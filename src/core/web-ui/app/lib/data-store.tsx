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
  openEventStream,
  sendDeviceCommand,
} from "../api.js";
import type {
  Automation,
  DeviceDescriptor,
  HomekitStatus,
  LogEntry,
  Room,
  RoomWithMembers,
  StateMap,
  StatusData,
  StreamEvent,
  TransportState,
} from "../types.js";
import { normalizeStreamEvent } from "../utils/normalize.js";
import { CommandCoalescer } from "./command-coalescing.js";

/** One coalesced device-property command request (design.md D31). */
export interface DeviceCommandRequest {
  qualifiedId: string;
  property: string;
  value: unknown;
}

export type DeviceCommandCoalescer = CommandCoalescer<DeviceCommandRequest, void>;

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
  /** Re-fetches the full snapshot on explicit user request. */
  refresh: () => Promise<void>;
  /** Subscribe to every raw stream event — used by detail views that need one specific category (e.g. an automation's own executions). */
  subscribe: (listener: (event: StreamEvent) => void) => () => void;
  /**
   * The single app-wide coalescer every optimistic device command goes
   * through (design.md D31) — one instance, not one per component, so a
   * device's coalescing state survives a control unmounting mid-command
   * (e.g. navigating away during a drag) exactly as it would on the network
   * layer regardless of what the UI is doing.
   */
  commandCoalescer: DeviceCommandCoalescer;
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

  const listenersRef = useRef<Set<(event: StreamEvent) => void>>(new Set());
  const subscribe = useCallback((listener: (event: StreamEvent) => void) => {
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

    function applyEvent(event: StreamEvent) {
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
      refresh,
      subscribe,
      commandCoalescer,
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
      refresh,
      subscribe,
      commandCoalescer,
    ],
  );

  return <DataStoreContext.Provider value={value}>{children}</DataStoreContext.Provider>;
}

export function useDataStore(): DataStoreValue {
  const ctx = useContext(DataStoreContext);
  if (!ctx) throw new Error("useDataStore() called outside a <DataStoreProvider>");
  return ctx;
}
