/**
 * The dashboard's data layer: loads a snapshot, then applies SSE events
 * incrementally, falling back to periodic refresh when the stream degrades.
 */

import type { EnergyData, WeatherData, WeatherUnavailable } from "@ts-ha/shared";
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
  fetchDevice,
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
import { CommandCoalescer, coalescingKey } from "./command-coalescing.js";
import { reduceDeviceEvent, unknownDeviceDeltaId } from "./device-reduction.js";
import {
  FAVORITES_STATE_KEY,
  favoritesFromState,
  isFavorite as isFavoriteInList,
  toggleFavorite as toggleFavoriteInList,
} from "./favorites.js";
import { applyLogRingBuffer, LOG_BUFFER_CAPACITY } from "./log-ring-buffer.js";
import { normalizeStreamEvent } from "./normalize.js";
import { computeRevertDeadlineMs, POLLED_DEFAULT_DEADLINE_MS } from "./revert-deadline.js";

/** One coalesced device-property command request. */
export interface DeviceCommandRequest {
  qualifiedId: string;
  property: string;
  value: unknown;
}

export type DeviceCommandCoalescer = CommandCoalescer<DeviceCommandRequest, void>;

/**
 * One store-level optimistic property override, keyed in the shared store so a
 * room batch command is reflected by every mounted tile.
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

/** How often the fallback poll re-snapshots while the stream is degraded. */
const FALLBACK_POLL_MS = 5000;

/**
 * The data a caller may supply in place of the engine — a client-side injection
 * seam, not a wire contract.
 */
export interface DataStoreFixtures {
  devices: DeviceDescriptor[];
  state: StateMap;
  rooms: RoomWithMembers[];
  automations: Automation[];
  transport: TransportState;
  /**
   * A supplied weather reading in `fetchWeather()`'s shape: conditions or the
   * unconfigured marker.
   */
  weather?: WeatherData | WeatherUnavailable;
  /** A supplied energy reading in `fetchEnergy()`'s shape. */
  energy?: EnergyData;
}

/** The store's initial values and the fixture-supplied ambient readings. */
interface DataStoreSeed {
  automations: Automation[];
  devicesByQualifiedId: Map<string, DeviceDescriptor>;
  energy: EnergyData | undefined;
  roomAssignments: Map<string, string>;
  roomDefs: Map<string, Room>;
  state: StateMap;
  transport: TransportState;
  weather: WeatherData | WeatherUnavailable | undefined;
}

/**
 * The store's initial values from the fixture set, or the empty defaults the
 * API path starts from; a fixture room is split into a definition plus members.
 */
export function seedDataStore(fixtures: DataStoreFixtures | undefined): DataStoreSeed {
  const devices = fixtures?.devices ?? [];
  const rooms = fixtures?.rooms ?? [];
  return {
    automations: fixtures?.automations ?? [],
    devicesByQualifiedId: new Map(devices.map((device) => [device.qualifiedId, device])),
    energy: fixtures?.energy,
    roomAssignments: new Map(
      rooms.flatMap((room) => room.members.map((member) => [member.qualifiedId, room.id] as const)),
    ),
    roomDefs: new Map(rooms.map((room) => [room.id, { id: room.id, name: room.name }])),
    state: fixtures?.state ?? {},
    transport: fixtures?.transport ?? "connecting",
    weather: fixtures?.weather,
  };
}

/**
 * Whether the store sources its data from the API and event stream; true unless
 * a caller supplied a fixture set.
 */
export function sourcesFromApi(fixtures: DataStoreFixtures | undefined): boolean {
  return fixtures === undefined;
}

/**
 * Whether a component must source a reading itself: false when the store
 * already carries a fixture-supplied one.
 */
export function sourcesOwnReading<T>(reading: T | undefined): boolean {
  return reading === undefined;
}

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
  /**
   * The caller-supplied weather reading, or `undefined` when the fixture set
   * carries none.
   */
  fixtureWeather: WeatherData | WeatherUnavailable | undefined;
  /**
   * The caller-supplied energy reading, or `undefined` when the fixture set
   * carries none.
   */
  fixtureEnergy: EnergyData | undefined;
  /** The user's favorites, derived from the ordinary state key. */
  favorites: string[];
  /** Whether `qualifiedId` is currently favorited. */
  isFavorite: (qualifiedId: string) => boolean;
  /**
   * Toggles a device's favorite mark: reflected locally, then written to the
   * ordinary state key; reverted if the request fails.
   */
  toggleFavorite: (qualifiedId: string) => Promise<void>;
  /** Re-fetches the full snapshot on explicit user request. */
  refresh: () => Promise<void>;
  /** Subscribe to every raw stream event, for detail views needing one category. */
  subscribe: (listener: (event: NormalizedStreamEvent) => void) => () => void;
  /**
   * Hides a device: reflected locally, then sent to the server; reverted if
   * the request fails.
   */
  hideDevice: (qualifiedId: string) => Promise<void>;
  /** Unhides a device — the mirror of {@link hideDevice}. */
  unhideDevice: (qualifiedId: string) => Promise<void>;
  /**
   * The single app-wide coalescer every optimistic device command goes through,
   * so a device's coalescing state survives a control unmounting mid-command.
   */
  commandCoalescer: DeviceCommandCoalescer;
  /**
   * Store-level optimistic overrides, keyed by `coalescingKey(qualifiedId,
   * property)`, so a room batch command is visible in every mounted control.
   */
  optimisticOverrides: Map<string, OptimisticOverride>;
  /**
   * Applies an optimistic value for one device property and returns its token.
   * Cleared on a matching report or after a deadline.
   */
  applyOptimisticOverride: (
    qualifiedId: string,
    property: string,
    value: unknown,
    observation?: DeviceObservation,
  ) => symbol;
  /**
   * Clears an optimistic override; when `token` is given, a superseding override
   * is left untouched.
   */
  revertOptimisticOverride: (qualifiedId: string, property: string, token?: symbol) => void;
}

const DataStoreContext = createContext<DataStoreValue | null>(null);

export function DataStoreProvider({
  children,
  fixtures,
}: {
  children: ReactNode;
  fixtures?: DataStoreFixtures;
}) {
  // Resolved once: fixtures are a mount-time input.
  const seedRef = useRef<DataStoreSeed | null>(null);
  if (!seedRef.current) seedRef.current = seedDataStore(fixtures);
  const seed = seedRef.current;

  const [status, setStatus] = useState<StatusData | null>(null);
  const [automations, setAutomations] = useState<Automation[]>(seed.automations);
  const [state, setState] = useState<StateMap>(seed.state);
  const [devicesByQualifiedId, setDevicesByQualifiedId] = useState<Map<string, DeviceDescriptor>>(
    seed.devicesByQualifiedId,
  );
  // A live mirror for the stream handler, which is created once and would
  // otherwise close over a stale map. Synced on every commit below.
  const devicesByIdRef = useRef<Map<string, DeviceDescriptor>>(devicesByQualifiedId);
  // Ids with an in-flight recovery fetch, so a burst of deltas for one unknown
  // device fires a single refetch.
  const recoveringDeviceIdsRef = useRef<Set<string>>(new Set());
  const [roomDefs, setRoomDefs] = useState<Map<string, Room>>(seed.roomDefs);
  const [roomAssignments, setRoomAssignments] = useState<Map<string, string>>(seed.roomAssignments);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [homekit, setHomekit] = useState<HomekitStatus | null>(null);
  const [transport, setTransport] = useState<TransportState>(seed.transport);

  const commandCoalescerRef = useRef<DeviceCommandCoalescer | null>(null);
  if (!commandCoalescerRef.current) {
    commandCoalescerRef.current = new CommandCoalescer<DeviceCommandRequest, void>((_key, req) =>
      sendDeviceCommand(req.qualifiedId, { [req.property]: req.value }),
    );
  }
  const commandCoalescer = commandCoalescerRef.current;

  // Store-level optimistic overrides: a room batch command is one request whose
  // effect is per member, so every mounted tile reads the same override.
  const [optimisticOverrides, setOptimisticOverrides] = useState<Map<string, OptimisticOverride>>(
    () => new Map(),
  );
  // Each key stores the token that owns its pending revert timer, so a stale
  // token's revert cannot cancel a newer override's deadline.
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
        // Only the latest application for this key may revert itself.
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

  // A device_state event is the authoritative confirmation of any optimistic
  // value for it: clear the store override so the reported state wins.
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

  // Keep the handler's map mirror in step with committed state.
  useEffect(() => {
    devicesByIdRef.current = devicesByQualifiedId;
  }, [devicesByQualifiedId]);

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

  // A delta for an unknown device is refetched by id and merged rather than
  // dropped; concurrent deltas for one id share a single fetch.
  const recoverDevice = useCallback((qualifiedId: string) => {
    if (recoveringDeviceIdsRef.current.has(qualifiedId)) return;
    recoveringDeviceIdsRef.current.add(qualifiedId);
    void fetchDevice(qualifiedId)
      .then((device) => {
        setDevicesByQualifiedId((prev) =>
          reduceDeviceEvent(prev, { category: "device_appeared", device }),
        );
      })
      .catch(() => {
        // Best-effort recovery: the event is dropped and retried on the next
        // delta for this id.
      })
      .finally(() => {
        recoveringDeviceIdsRef.current.delete(qualifiedId);
      });
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
      // The whole list is read-modify-written over one state key, so two clients
      // toggling within this window last-write-wins. Reflected optimistically.
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

  // Initial snapshot, then open the stream; reconnection triggers its own
  // refresh. With a fixture set there is nothing to source at all.
  useEffect(() => {
    if (!sourcesFromApi(fixtures)) return;

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
        case "device_state":
        case "device_reachability":
        case "device_appeared":
        case "device_disappeared":
        case "device_visibility": {
          const unknownId = unknownDeviceDeltaId(devicesByIdRef.current, event);
          if (unknownId !== null) recoverDevice(unknownId);
          setDevicesByQualifiedId((prev) => reduceDeviceEvent(prev, event));
          if (event.category === "device_state") {
            clearConfirmedOverrides(event.qualifiedId, event.properties);
          }
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
            // A deleted room's members become unassigned: drop any assignment
            // still pointing at it.
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
        case "fell_behind": {
          // The connection is healthy but discarded buffered events; re-snapshot
          // to recover.
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
          // A malformed frame is dropped, not fatal.
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
    // Intentionally runs once: reconnection and the fallback poll are handled
    // inside the effect itself.
  }, [refresh, fixtures]);

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
      fixtureWeather: seed.weather,
      fixtureEnergy: seed.energy,
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
      seed,
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
