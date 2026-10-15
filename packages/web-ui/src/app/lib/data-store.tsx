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
 * The store can also be seeded from a caller-supplied fixture set instead of
 * the API (design.md D5): with `fixtures` present the initial values come from
 * them, and neither a snapshot is fetched nor a stream opened. The fixture set
 * carries the two ambient readings too — weather and energy — which the two
 * wall widgets would otherwise fetch for themselves, so a fixture-backed
 * render reaches their real composition with no engine. The seed, the sourcing
 * decision, and that widget-side decision are pure functions in this file, so
 * a `bun test` with no DOM reaches all three; nothing but the call site can
 * select fixture data — no environment variable, query parameter, or
 * configuration key.
 *
 * Deliberately thin on logic: event application here is a handful of map
 * mutations per category, with everything genuinely decision-worthy (tile
 * ranking, revert deadlines, coalescing, reserved-key filtering, log
 * filtering, log-ring bounding, device-event reduction) already extracted
 * into the pure modules alongside this file (design.md D23). This file itself
 * is accepted as manually verified.
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
import { normalizeStreamEvent } from "../utils/normalize.js";
import { CommandCoalescer, coalescingKey } from "./command-coalescing.js";
import { reduceDeviceEvent, unknownDeviceDeltaId } from "./device-reduction.js";
import {
  FAVORITES_STATE_KEY,
  favoritesFromState,
  isFavorite as isFavoriteInList,
  toggleFavorite as toggleFavoriteInList,
} from "./favorites.js";
import { applyLogRingBuffer, LOG_BUFFER_CAPACITY } from "./log-ring-buffer.js";
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

/** How often the fallback poll re-snapshots while the stream is degraded. */
const FALLBACK_POLL_MS = 5000;

/**
 * The data a caller may supply in place of the engine (design.md D5).
 *
 * Declared here, web-ui-internal: it is a client-side injection seam, not a
 * wire contract, so it is neither a `@ts-ha/shared` contract nor part of the
 * package's exported surface. It covers exactly what the wall's widgets read
 * from the store and nothing more — `devices` (device, temperature,
 * device-grid), `state` (favorites reads its key), `rooms` (room),
 * `automations` (scene), and `transport` (weather, energy) — plus the two
 * ambient readings the weather and energy widgets source themselves rather
 * than read from the store, which they prefer over their own fetch. It is
 * typed against the same contracts the store and those widgets already
 * consume, so a change to one of them is a compile error here rather than
 * silent fixture drift.
 *
 * `rooms` is the store's own exposed shape, {@link RoomWithMembers}, so a room
 * widget renders its members: the provider splits it into the definition and
 * assignment maps the store keeps, exactly as it splits the snapshot's room
 * list.
 */
export interface DataStoreFixtures {
  devices: DeviceDescriptor[];
  state: StateMap;
  rooms: RoomWithMembers[];
  automations: Automation[];
  transport: TransportState;
  /**
   * A supplied weather reading, in the exact shape `fetchWeather()` resolves
   * to — conditions, or the unconfigured marker — so a widget can present the
   * unconfigured case from a fixture too (design.md D5).
   */
  weather?: WeatherData | WeatherUnavailable;
  /** A supplied energy reading, in the exact shape `fetchEnergy()` resolves to (design.md D5). */
  energy?: EnergyData;
}

/** The store's initial values and the fixture-supplied ambient readings (design.md D5). */
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
 * The store's initial values: the caller's fixture set when one is supplied,
 * and otherwise the same empty defaults — and the same `connecting` transport
 * — the API path has always started from (design.md D5).
 *
 * A fixture room is split into a definition plus one assignment per member,
 * mirroring the snapshot path, so the room widget derives the same membership
 * from either source. The two ambient readings are absent unless the fixture
 * set carries them, so a widget sources its own until a caller supplies one.
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
 * Whether the store sources its data from the API and the event stream
 * (design.md D5; specs/web-ui "Data Sources"). The caller-supplied fixture set
 * is its only input: no environment variable, query parameter, or
 * configuration key reaches it, so a deployed dashboard cannot select fixture
 * data — only a call site can.
 */
export function sourcesFromApi(fixtures: DataStoreFixtures | undefined): boolean {
  return fixtures === undefined;
}

/**
 * Whether a component must source a reading itself (design.md D5; specs/web-ui
 * "Data Sources" — "A widget that sources its own reading prefers the
 * fixture"). The two wall widgets that fetch their own ambient reading consult
 * this with the reading the store carries from the fixture set: with one
 * supplied, the widget renders it and issues no request for it; with none, it
 * sources the reading exactly as it does today.
 *
 * The only input is the reading, so no environment variable, query parameter,
 * or configuration key can make a widget prefer a fixture.
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
   * carries none (design.md D5). Read-only: `WeatherWidget` prefers it over the
   * reading it fetches for itself, so a fixture-backed render issues no request
   * for it, and with none supplied the widget is unchanged.
   */
  fixtureWeather: WeatherData | WeatherUnavailable | undefined;
  /**
   * The caller-supplied energy reading, or `undefined` when the fixture set
   * carries none (design.md D5) — the mirror of {@link fixtureWeather} for
   * `EnergyWidget`.
   */
  fixtureEnergy: EnergyData | undefined;
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

export function DataStoreProvider({
  children,
  fixtures,
}: {
  children: ReactNode;
  fixtures?: DataStoreFixtures;
}) {
  // The store's initial values, resolved once: a fixture set is a mount-time
  // input, and re-seeding a live store is not a use case (design.md D5).
  const seedRef = useRef<DataStoreSeed | null>(null);
  if (!seedRef.current) seedRef.current = seedDataStore(fixtures);
  const seed = seedRef.current;

  const [status, setStatus] = useState<StatusData | null>(null);
  const [automations, setAutomations] = useState<Automation[]>(seed.automations);
  const [state, setState] = useState<StateMap>(seed.state);
  const [devicesByQualifiedId, setDevicesByQualifiedId] = useState<Map<string, DeviceDescriptor>>(
    seed.devicesByQualifiedId,
  );
  // A live mirror of the device map for the stream handler: the handler is
  // created once and cannot read the state variable directly without closing
  // over a stale map (design.md D7). Synced on every commit below.
  const devicesByIdRef = useRef<Map<string, DeviceDescriptor>>(devicesByQualifiedId);
  // Ids with an in-flight recovery fetch, so a burst of deltas for one unknown
  // device fires a single refetch rather than one per event (design.md D7).
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

  // Keep the handler's map mirror in step with committed state, so a delta for
  // a device already in the map is recognised as known (design.md D7).
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

  // A delta for a device the client does not hold carries no full descriptor,
  // so it is refetched by id and merged rather than dropped (design.md D7;
  // specs/web-ui "A delta for an unknown device recovers it"). The fetch is a
  // side effect and never runs inside a state updater; a failure is ignored,
  // matching refresh()'s per-endpoint tolerance — the next event for the id
  // retries. Concurrent deltas for one id share a single fetch.
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
        // delta for this id, exactly as refresh() swallows a failed endpoint.
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
  // are not needed after this — reconnection triggers its own refresh. With a
  // caller-supplied fixture set there is nothing to source at all: the seeded
  // store is the whole world, so no snapshot is fetched and no stream is
  // opened (design.md D5).
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
    // handled inside the effect itself, not by re-running it. `fixtures` is a
    // mount-time input, so listing it changes nothing for a stable caller.
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
