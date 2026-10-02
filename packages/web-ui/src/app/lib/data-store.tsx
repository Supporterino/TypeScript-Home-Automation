/**
 * The dashboard's data layer: snapshot-then-stream over the unified API
 * (design.md "Data Sources"; specs/web-ui "Data Sources"; task 10.2, 10.19).
 *
 * Loads its initial snapshot from the REST endpoints, then holds the SSE
 * stream open and applies each event incrementally — refetching the
 * snapshot only on reconnection (events may have been missed while
 * disconnected) or an explicit user request, never on a fixed interval
 * while the stream is healthy. When the stream is unavailable it falls back
 * to periodic snapshot refresh and reports the degraded transport via
 * `transport` so the interface can surface it (design.md "Degraded
 * transport is visible").
 *
 * Room membership is not re-fetched on every assignment change: the server
 * only ever pushes a `room` (definition) or `room_membership` (single
 * device's assignment) delta, never a full room list (design.md D14; task
 * 9.7) — mirroring that, this store keeps room definitions and assignments
 * as two flat maps and derives each room's member list from them and the
 * live device map, exactly like `RoomManager.listRooms()` does server-side.
 *
 * Deliberately thin on logic: event application here is a handful of map
 * mutations per category, with everything genuinely decision-worthy (tile
 * ranking, revert deadlines, coalescing, reserved-key filtering, log
 * filtering) already extracted into the pure modules alongside this file
 * (design.md D23). This file itself is accepted as manually verified.
 */
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  fetchAutomations,
  fetchDeviceCatalog,
  fetchHomekitStatus,
  fetchLogs,
  fetchRooms,
  fetchState,
  fetchStatus,
  hideDevice as hideDeviceRequest,
  openEventStream,
  sendDeviceCommand,
  setStateKey,
  unhideDevice as unhideDeviceRequest,
} from "../api.js";
import type {
  Automation,
  DeviceDescriptor,
  DeviceObservation,
  HomekitStatus,
  LogEntry,
  NormalizedStreamEvent,
  Room,
  RoomWithMembers,
  StateMap,
  StatusData,
  TransportState,
} from "../types.js";
import { normalizeStreamEvent } from "../utils/normalize.js";
import { CommandCoalescer, coalescingKey } from "./command-coalescing.js";
import {
  FAVORITES_STATE_KEY,
  favoritesFromState,
  isFavorite as isFavoriteInList,
  toggleFavorite as toggleFavoriteInList,
} from "./favorites.js";
import { computeRevertDeadlineMs, POLLED_DEFAULT_DEADLINE_MS } from "./revert-deadline.js";

/** One coalesced device-property command request (design.md D31). */
export interface DeviceCommandRequest {
  qualifiedId: string;
  property: string;
  value: unknown;
}

export type DeviceCommandCoalescer = CommandCoalescer<DeviceCommandRequest, void>;

/**
 * One store-level optimistic property override (design.md D5; task 10.2).
 * Unlike the component-local override in {@link useOptimisticDeviceProperty},
 * this is keyed in the shared store so a room batch command can command every
 * member at once and have every mounted tile reflect it.
 */
export interface OptimisticOverride {
  value: unknown;
  token: symbol;
}

/**
 * The pending revert deadline for one override key, tagged with the token that
 * owns it so a stale revert cannot cancel a superseding override's timer.
 */
interface OverrideTimer {
  token: symbol;
  timer: ReturnType<typeof setTimeout>;
}

/** How many log entries the in-memory ring buffer retains (mirrors the server's own LogBuffer default order of magnitude). */
const LOG_BUFFER_CAPACITY = 500;

/** How often the fallback poll re-snapshots while the stream is degraded. */
const FALLBACK_POLL_MS = 5000;

interface DataStoreValue {
  status: StatusData | null;
  automations: Automation[];
  state: StateMap;
  devices: DeviceDescriptor[];
  devicesByQualifiedId: Map<string, DeviceDescriptor>;
  rooms: RoomWithMembers[];
  unassignedDevices: DeviceDescriptor[];
  logs: LogEntry[];
  homekit: HomekitStatus | null;
  transport: TransportState;
  /** The user's favorites, derived from the ordinary state key (design.md D9). */
  favorites: string[];
  /** Whether `qualifiedId` is currently favorited. */
  isFavorite: (qualifiedId: string) => boolean;
  /**
   * Toggles a device's favorite mark: reflected locally immediately, then
   * written to the ordinary state key. Reverted if the request fails;
   * otherwise reconciled by the `state` event the server broadcasts, the
   * same way another client's change already updates this one (design.md D9).
   */
  toggleFavorite: (qualifiedId: string) => Promise<void>;
  /** Re-fetches the full snapshot on explicit user request. */
  refresh: () => Promise<void>;
  /** Subscribe to every raw stream event — used by detail views that need one specific category (e.g. an automation's own executions). */
  subscribe: (listener: (event: NormalizedStreamEvent) => void) => () => void;
  /**
   * Hides a device: reflected in the local store immediately, then sent to
   * the server. Reverted if the request fails; otherwise reconciled (as a
   * no-op) by the `device_visibility` event the server broadcasts, the same
   * way another client's change already updates this one.
   */
  hideDevice: (qualifiedId: string) => Promise<void>;
  /** Unhides a device — the mirror of {@link hideDevice}. */
  unhideDevice: (qualifiedId: string) => Promise<void>;
  /**
   * The single app-wide coalescer every optimistic device command goes
   * through (design.md D31) — one instance, not one per component, so a
   * device's coalescing state survives a control unmounting mid-command
   * (e.g. navigating away during a drag) exactly as it would on the network
   * layer regardless of what the UI is doing.
   */
  commandCoalescer: DeviceCommandCoalescer;
  /**
   * Store-level optimistic overrides, keyed by `coalescingKey(qualifiedId,
   * property)`, so a room batch command's per-member effect is visible in
   * every mounted control — not only inside the view that issued it
   * (design.md D5; task 10.2).
   */
  optimisticOverrides: Map<string, OptimisticOverride>;
  /**
   * Applies an optimistic value for one device property, returning a token
   * identifying this application. The override is reflected by
   * {@link useOptimisticDeviceProperty} and is cleared when a matching
   * `device_state` event confirms it, or after a revert deadline derived from
   * `observation` (falling back to the polled default). A later application
   * for the same key supersedes an earlier one.
   */
  applyOptimisticOverride: (
    qualifiedId: string,
    property: string,
    value: unknown,
    observation?: DeviceObservation,
  ) => symbol;
  /**
   * Clears an optimistic override. When `token` is omitted the override is
   * cleared unconditionally; when given, a superseding override is left
   * untouched (task 10.2).
   */
  revertOptimisticOverride: (qualifiedId: string, property: string, token?: symbol) => void;
}

const DataStoreContext = createContext<DataStoreValue | null>(null);

function applyLogRingBuffer(logs: LogEntry[], entry: LogEntry): LogEntry[] {
  const next = [...logs, entry];
  return next.length > LOG_BUFFER_CAPACITY ? next.slice(next.length - LOG_BUFFER_CAPACITY) : next;
}

export function DataStoreProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<StatusData | null>(null);
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [state, setState] = useState<StateMap>({});
  const [devicesByQualifiedId, setDevicesByQualifiedId] = useState<Map<string, DeviceDescriptor>>(
    () => new Map(),
  );
  const [roomDefs, setRoomDefs] = useState<Map<string, Room>>(() => new Map());
  const [roomAssignments, setRoomAssignments] = useState<Map<string, string>>(() => new Map());
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [homekit, setHomekit] = useState<HomekitStatus | null>(null);
  const [transport, setTransport] = useState<TransportState>("connecting");

  const commandCoalescerRef = useRef<DeviceCommandCoalescer | null>(null);
  if (!commandCoalescerRef.current) {
    commandCoalescerRef.current = new CommandCoalescer<DeviceCommandRequest, void>((_key, req) =>
      sendDeviceCommand(req.qualifiedId, { [req.property]: req.value }),
    );
  }
  const commandCoalescer = commandCoalescerRef.current;

  // Store-level optimistic overrides (task 10.2). A room batch command is a
  // single request whose effect is nevertheless per member, so the overrides
  // live in the shared store keyed by `qualifiedId:property` — every mounted
  // tile, wherever it is rendered, reads the same override. The revert
  // deadline uses the same pure rule as single-device optimistic commands.
  const [optimisticOverrides, setOptimisticOverrides] = useState<Map<string, OptimisticOverride>>(
    () => new Map(),
  );
  // Timer bookkeeping mirrors the state map's token guard: a key stores the
  // token that owns its pending revert timer, so a stale token's revert can
  // never cancel a newer override's deadline while leaving that newer override
  // in state. A React store is not exercisable without a DOM harness, so this
  // invariant is enforced structurally here and covered only by review.
  const overrideTimersRef = useRef<Map<string, OverrideTimer>>(new Map());

  const clearOverride = useCallback((key: string, token?: symbol) => {
    const entry = overrideTimersRef.current.get(key);
    if (entry && (token === undefined || entry.token === token)) {
      clearTimeout(entry.timer);
      overrideTimersRef.current.delete(key);
    }
    setOptimisticOverrides((prev) => {
      const current = prev.get(key);
      if (!current) return prev;
      if (token !== undefined && current.token !== token) return prev;
      const next = new Map(prev);
      next.delete(key);
      return next;
    });
  }, []);

  const applyOptimisticOverride = useCallback(
    (
      qualifiedId: string,
      property: string,
      value: unknown,
      observation?: DeviceObservation,
    ): symbol => {
      const key = coalescingKey(qualifiedId, property);
      const token = Symbol(key);

      const existing = overrideTimersRef.current.get(key);
      if (existing) clearTimeout(existing.timer);

      setOptimisticOverrides((prev) => {
        const next = new Map(prev);
        next.set(key, { value, token });
        return next;
      });

      const deadlineMs = observation
        ? computeRevertDeadlineMs(observation)
        : POLLED_DEFAULT_DEADLINE_MS;
      const timer = setTimeout(() => {
        const entry = overrideTimersRef.current.get(key);
        if (entry?.token === token) overrideTimersRef.current.delete(key);
        // Only the latest application for this key may revert itself; a
        // superseding application owns the key now (task 10.2).
        setOptimisticOverrides((prev) => {
          const current = prev.get(key);
          if (!current || current.token !== token) return prev;
          const next = new Map(prev);
          next.delete(key);
          return next;
        });
      }, deadlineMs);
      overrideTimersRef.current.set(key, { token, timer });

      return token;
    },
    [],
  );

  const revertOptimisticOverride = useCallback(
    (qualifiedId: string, property: string, token?: symbol) => {
      clearOverride(coalescingKey(qualifiedId, property), token);
    },
    [clearOverride],
  );

  // A device_state event that carries a property is the authoritative
  // confirmation/rejection of any optimistic value for it: clear the store
  // override so the reported state wins (design.md D5; task 10.2).
  const clearConfirmedOverrides = useCallback(
    (qualifiedId: string, properties: Record<string, unknown>) => {
      for (const property of Object.keys(properties)) {
        clearOverride(coalescingKey(qualifiedId, property));
      }
    },
    [clearOverride],
  );

  useEffect(() => {
    const timers = overrideTimersRef.current;
    return () => {
      for (const entry of timers.values()) clearTimeout(entry.timer);
      timers.clear();
    };
  }, []);

  const listenersRef = useRef<Set<(event: NormalizedStreamEvent) => void>>(new Set());
  const subscribe = useCallback((listener: (event: NormalizedStreamEvent) => void) => {
    listenersRef.current.add(listener);
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  const refresh = useCallback(async () => {
    const [statusRes, automationsRes, stateRes, devicesRes, roomsRes, logsRes, homekitRes] =
      await Promise.all([
        fetchStatus().catch(() => null),
        fetchAutomations().catch(() => []),
        fetchState().catch(() => ({})),
        fetchDeviceCatalog().catch(() => []),
        fetchRooms().catch(() => []),
        fetchLogs(LOG_BUFFER_CAPACITY).catch(() => []),
        fetchHomekitStatus().catch(() => null),
      ]);

    setStatus(statusRes);
    setAutomations(automationsRes);
    setState(stateRes);
    setDevicesByQualifiedId(new Map(devicesRes.map((d) => [d.qualifiedId, d])));
    setRoomDefs(new Map(roomsRes.map((r) => [r.id, { id: r.id, name: r.name }])));
    setRoomAssignments(() => {
      const next = new Map<string, string>();
      for (const room of roomsRes) {
        for (const member of room.members) next.set(member.qualifiedId, room.id);
      }
      return next;
    });
    setLogs(logsRes);
    setHomekit(homekitRes);
  }, []);

  const setDeviceHidden = useCallback((qualifiedId: string, hidden: boolean) => {
    setDevicesByQualifiedId((prev) => {
      const existing = prev.get(qualifiedId);
      if (!existing || existing.hidden === hidden) return prev;
      const next = new Map(prev);
      next.set(qualifiedId, { ...existing, hidden });
      return next;
    });
  }, []);

  const hideDevice = useCallback(
    async (qualifiedId: string) => {
      setDeviceHidden(qualifiedId, true);
      try {
        await hideDeviceRequest(qualifiedId);
      } catch (err) {
        setDeviceHidden(qualifiedId, false);
        throw err;
      }
    },
    [setDeviceHidden],
  );

  const unhideDevice = useCallback(
    async (qualifiedId: string) => {
      setDeviceHidden(qualifiedId, false);
      try {
        await unhideDeviceRequest(qualifiedId);
      } catch (err) {
        setDeviceHidden(qualifiedId, true);
        throw err;
      }
    },
    [setDeviceHidden],
  );

  const favorites = useMemo(() => favoritesFromState(state), [state]);

  const toggleFavorite = useCallback(
    async (qualifiedId: string) => {
      const previous = favorites;
      const next = toggleFavoriteInList(favorites, qualifiedId);
      // The whole list is read-modify-written over one ordinary state key, so
      // two clients toggling different devices within this write window
      // last-write-wins (design.md D9 accepts favorites as ordinary state;
      // the key is small, and a per-device schema would be a new subsystem).
      // Optimistic: reflect the toggle before the request lands. The
      // functional update preserves any other key updated concurrently.
      setState((prev) => ({ ...prev, [FAVORITES_STATE_KEY]: next }));
      try {
        await setStateKey(FAVORITES_STATE_KEY, next);
      } catch (err) {
        setState((prev) => ({ ...prev, [FAVORITES_STATE_KEY]: previous }));
        throw err;
      }
    },
    [favorites],
  );

  const isFavorite = useCallback(
    (qualifiedId: string) => isFavoriteInList(favorites, qualifiedId),
    [favorites],
  );

  // Initial snapshot, then open the stream. Re-runs (via the effect below)
  // are not needed after this — reconnection triggers its own refresh.
  useEffect(() => {
    let cancelled = false;
    let fallbackTimer: ReturnType<typeof setInterval> | null = null;
    let hadOpenedBefore = false;

    function stopFallbackPoll() {
      if (fallbackTimer) {
        clearInterval(fallbackTimer);
        fallbackTimer = null;
      }
    }

    function startFallbackPoll() {
      if (fallbackTimer) return;
      fallbackTimer = setInterval(() => {
        void refresh();
      }, FALLBACK_POLL_MS);
    }

    function applyEvent(event: NormalizedStreamEvent) {
      for (const listener of listenersRef.current) listener(event);

      switch (event.category) {
        case "state": {
          setState((prev) => {
            if (event.value === undefined) {
              if (!(event.key in prev)) return prev;
              const next = { ...prev };
              delete next[event.key];
              return next;
            }
            return { ...prev, [event.key]: event.value };
          });
          break;
        }
        case "log": {
          setLogs((prev) => applyLogRingBuffer(prev, event.entry));
          break;
        }
        case "automation": {
          setAutomations((prev) =>
            prev.map((a) => (a.name === event.name ? { ...a, enabled: event.enabled } : a)),
          );
          break;
        }
        case "readiness": {
          setStatus((prev) =>
            prev ? { ...prev, status: event.ready ? "ready" : "not ready" } : prev,
          );
          break;
        }
        case "device_state": {
          setDevicesByQualifiedId((prev) => {
            const existing = prev.get(event.qualifiedId);
            if (!existing) return prev;
            const next = new Map(prev);
            next.set(event.qualifiedId, {
              ...existing,
              state: { ...existing.state, ...event.properties },
              observation: event.observation,
            });
            return next;
          });
          clearConfirmedOverrides(event.qualifiedId, event.properties);
          break;
        }
        case "device_reachability": {
          setDevicesByQualifiedId((prev) => {
            const existing = prev.get(event.qualifiedId);
            if (!existing) return prev;
            const next = new Map(prev);
            next.set(event.qualifiedId, { ...existing, reachable: event.reachable });
            return next;
          });
          break;
        }
        case "device_appeared": {
          setDevicesByQualifiedId((prev) => {
            const next = new Map(prev);
            next.set(event.device.qualifiedId, event.device);
            return next;
          });
          break;
        }
        case "device_disappeared": {
          setDevicesByQualifiedId((prev) => {
            if (!prev.has(event.qualifiedId)) return prev;
            const next = new Map(prev);
            next.delete(event.qualifiedId);
            return next;
          });
          break;
        }
        case "room": {
          setRoomDefs((prev) => {
            const next = new Map(prev);
            if (event.room) next.set(event.id, event.room);
            else next.delete(event.id);
            return next;
          });
          if (!event.room) {
            // A deleted room's members become unassigned — drop any
            // assignment still pointing at it rather than waiting for
            // per-device room_membership deltas that were never emitted for
            // a bulk delete of a room's members list.
            setRoomAssignments((prev) => {
              let changed = false;
              const next = new Map(prev);
              for (const [qualifiedId, roomId] of prev) {
                if (roomId === event.id) {
                  next.delete(qualifiedId);
                  changed = true;
                }
              }
              return changed ? next : prev;
            });
          }
          break;
        }
        case "room_membership": {
          setRoomAssignments((prev) => {
            const next = new Map(prev);
            if (event.roomId) next.set(event.qualifiedId, event.roomId);
            else next.delete(event.qualifiedId);
            return next;
          });
          break;
        }
        case "device_visibility": {
          setDevicesByQualifiedId((prev) => {
            const existing = prev.get(event.qualifiedId);
            if (!existing) return prev;
            const next = new Map(prev);
            next.set(event.qualifiedId, { ...existing, hidden: event.hidden });
            return next;
          });
          break;
        }
        case "fell_behind": {
          // The connection is healthy but discarded buffered events — the
          // client is behind, not disconnected. Re-snapshot to recover,
          // exactly as on reconnection (design.md D28).
          void refresh();
          break;
        }
        case "automation_execution":
        case "unknown":
          break;
      }
    }

    async function start() {
      setTransport("connecting");
      await refresh();
      if (cancelled) return;

      const es = openEventStream();

      es.onopen = () => {
        if (cancelled) return;
        stopFallbackPoll();
        setTransport("live");
        if (hadOpenedBefore) void refresh();
        hadOpenedBefore = true;
      };

      es.onmessage = (ev) => {
        if (cancelled) return;
        try {
          const parsed = JSON.parse(ev.data);
          applyEvent(normalizeStreamEvent(parsed));
        } catch {
          // A malformed frame is dropped, not fatal — normalizeStreamEvent
          // already handles a well-formed-but-unrecognised payload; this
          // catches JSON.parse itself failing.
        }
      };

      es.onerror = () => {
        if (cancelled) return;
        setTransport("degraded");
        startFallbackPoll();
      };

      return es;
    }

    let esRef: EventSource | null = null;
    start().then((es) => {
      if (cancelled) es?.close();
      else esRef = es ?? null;
    });

    return () => {
      cancelled = true;
      stopFallbackPoll();
      esRef?.close();
    };
    // Intentionally runs once: reconnection and the fallback poll are
    // handled inside the effect itself, not by re-running it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh]);

  const devices = useMemo(() => [...devicesByQualifiedId.values()], [devicesByQualifiedId]);

  const rooms = useMemo<RoomWithMembers[]>(() => {
    const membersByRoom = new Map<string, { qualifiedId: string; roomId: string }[]>();
    for (const [qualifiedId, roomId] of roomAssignments) {
      const list = membersByRoom.get(roomId) ?? [];
      list.push({ qualifiedId, roomId });
      membersByRoom.set(roomId, list);
    }
    return [...roomDefs.values()].map((room) => ({
      id: room.id,
      name: room.name,
      members: (membersByRoom.get(room.id) ?? []).map(({ qualifiedId }) => {
        const device = devicesByQualifiedId.get(qualifiedId) ?? null;
        return { qualifiedId, available: device !== null, device };
      }),
    }));
  }, [roomDefs, roomAssignments, devicesByQualifiedId]);

  const unassignedDevices = useMemo(
    () => devices.filter((d) => !roomAssignments.has(d.qualifiedId)),
    [devices, roomAssignments],
  );

  const value = useMemo<DataStoreValue>(
    () => ({
      status,
      automations,
      state,
      devices,
      devicesByQualifiedId,
      rooms,
      unassignedDevices,
      logs,
      homekit,
      transport,
      favorites,
      isFavorite,
      toggleFavorite,
      refresh,
      subscribe,
      commandCoalescer,
      optimisticOverrides,
      applyOptimisticOverride,
      revertOptimisticOverride,
      hideDevice,
      unhideDevice,
    }),
    [
      status,
      automations,
      state,
      devices,
      devicesByQualifiedId,
      rooms,
      unassignedDevices,
      logs,
      homekit,
      transport,
      favorites,
      isFavorite,
      toggleFavorite,
      refresh,
      subscribe,
      commandCoalescer,
      optimisticOverrides,
      applyOptimisticOverride,
      revertOptimisticOverride,
      hideDevice,
      unhideDevice,
    ],
  );

  return <DataStoreContext.Provider value={value}>{children}</DataStoreContext.Provider>;
}

export function useDataStore(): DataStoreValue {
  const ctx = useContext(DataStoreContext);
  if (!ctx) throw new Error("useDataStore() called outside a <DataStoreProvider>");
  return ctx;
}
