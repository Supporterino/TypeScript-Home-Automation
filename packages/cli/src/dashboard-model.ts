/**
 * Pure dashboard data model (specs/cli "Realtime Dashboard Updates";
 * design.md D4).
 *
 * The dashboard takes a full snapshot, then patches it from the realtime
 * stream, and refreshes the non-streamed domains (HomeKit, energy, weather)
 * on a slower poll. The snapshot/poll fetching is impure and lives in the
 * dashboard component; this module holds the deterministic parts — the
 * event-application reducer and the energy/weather projections — so they are
 * unit-testable without React or a network.
 */

import type {
  DeviceDescriptor,
  EnergyData,
  StreamEvent,
  WeatherData,
  WeatherUnavailable,
} from "@ts-ha/shared";
import type { DashboardData, DevicesData } from "./components/types.js";
import { weatherUnavailableMessage } from "./format.js";

/** Maximum number of streamed log entries retained in the dashboard buffer. */
const LOG_BUFFER_LIMIT = 500;

/**
 * Apply one stream event to the dashboard state, returning a new state.
 *
 * Only the streamed categories mutate state. `fell_behind` is deliberately a
 * no-op here — it carries no delta; the dashboard treats it as a re-snapshot
 * trigger (design.md D28/D4). `automation_execution` and `wall` are not
 * displayed in the terminal.
 */
export function applyStreamEvent(data: DashboardData, event: StreamEvent): DashboardData {
  switch (event.category) {
    case "state": {
      const state = { ...data.state.state };
      if (event.value === undefined) delete state[event.key];
      else state[event.key] = event.value;
      return { ...data, state: { state, count: Object.keys(state).length } };
    }

    case "log": {
      const entry = event.entry;
      // A malformed-but-parseable frame may omit `entry`; degrade to a no-op
      // rather than throwing on the dedupe key below.
      if (!entry) return data;
      // Idempotent for a replayed delta: a buffered log entry that the
      // snapshot already contains must not duplicate the line.
      const key = logEntryKey(entry);
      if (data.logs.entries.some((existing) => logEntryKey(existing) === key)) return data;
      const entries = [...data.logs.entries, entry].slice(-LOG_BUFFER_LIMIT);
      return {
        ...data,
        logs: { entries, count: Math.max(data.logs.count, entries.length) },
      };
    }

    case "automation":
      return {
        ...data,
        automations: {
          ...data.automations,
          automations: data.automations.automations.map((automation) =>
            automation.name === event.name ? { ...automation, enabled: event.enabled } : automation,
          ),
        },
      };

    case "readiness":
      return {
        ...data,
        readiness: {
          ...data.readiness,
          // The event carries only the aggregate `ready` boolean
          // (`mqtt.isConnected && engineStarted`), which cannot say which
          // sub-check moved, so mirror the web UI: update `status` and leave
          // `checks` to the snapshot.
          status: event.ready ? "ready" : "not ready",
        },
      };

    case "device_state":
      return {
        ...data,
        devices: patchDevice(data.devices, event.qualifiedId, (device) => ({
          ...device,
          state: { ...device.state, ...event.properties },
          observation: event.observation,
        })),
      };

    case "device_reachability":
      return {
        ...data,
        devices: patchDevice(data.devices, event.qualifiedId, (device) => ({
          ...device,
          reachable: event.reachable,
        })),
      };

    case "device_visibility":
      return {
        ...data,
        devices: patchDevice(data.devices, event.qualifiedId, (device) => ({
          ...device,
          hidden: event.hidden,
        })),
      };

    case "device_appeared": {
      if (data.devices.devices.some((d) => d.qualifiedId === event.device.qualifiedId)) {
        return data;
      }
      const devices = [...data.devices.devices, event.device];
      return { ...data, devices: { ...data.devices, devices, count: devices.length } };
    }

    case "device_disappeared": {
      const devices = data.devices.devices.filter(
        (device) => device.qualifiedId !== event.qualifiedId,
      );
      if (devices.length === data.devices.devices.length) return data;
      return { ...data, devices: { ...data.devices, devices, count: devices.length } };
    }

    case "room": {
      const room = event.room;
      if (room) {
        const exists = data.rooms.rooms.some((candidate) => candidate.id === event.id);
        const rooms = exists
          ? data.rooms.rooms.map((candidate) =>
              candidate.id === event.id ? { ...candidate, name: room.name } : candidate,
            )
          : [...data.rooms.rooms, { id: event.id, name: room.name, members: [] }];
        return { ...data, rooms: { rooms, count: rooms.length } };
      }
      const rooms = data.rooms.rooms.filter((candidate) => candidate.id !== event.id);
      if (rooms.length === data.rooms.rooms.length) return data;
      return { ...data, rooms: { rooms, count: rooms.length } };
    }

    case "room_membership": {
      const { qualifiedId, roomId } = event;
      const device = data.devices.devices.find((d) => d.qualifiedId === qualifiedId) ?? null;
      let changed = false;
      const rooms = data.rooms.rooms.map((room) => {
        const alreadyMember = room.members.some((member) => member.qualifiedId === qualifiedId);
        const shouldAdd = roomId === room.id;
        // Idempotent on replay: the member's presence already matches the
        // event, so leave the room untouched rather than invert the change.
        if (alreadyMember === shouldAdd) return room;
        changed = true;
        return {
          ...room,
          members: shouldAdd
            ? [...room.members, { qualifiedId, available: device !== null, device }]
            : room.members.filter((member) => member.qualifiedId !== qualifiedId),
        };
      });
      if (!changed) return data;
      return { ...data, rooms: { ...data.rooms, rooms } };
    }

    case "fell_behind":
    case "automation_execution":
    case "wall":
      return data;

    default:
      // An unknown or newly-introduced category (the frame is parsed without
      // validating `category`) degrades to a no-op rather than storing
      // `undefined` and crashing the next render.
      return data;
  }
}

/**
 * Buffers stream deltas while a snapshot is in flight, then replays them in
 * arrival order before switching to live application (specs/cli "Realtime
 * Dashboard Updates").
 *
 * The dashboard subscribes to the stream before (or atomically with) taking a
 * snapshot. A delta that arrives before the snapshot resolves would otherwise
 * be overwritten by the snapshot's wholesale `setData`; buffering it and
 * replaying it through {@link applyStreamEvent} after the snapshot loses
 * nothing. On a re-snapshot (`fell_behind`, reconnect) the gate is closed again
 * so deltas that arrive during the re-read are replayed the same way.
 */
export interface DeltaGate {
  /**
   * Accept an event. While the gate is closed the event is buffered and `[]` is
   * returned; while open the event is returned for immediate application.
   */
  accept(event: StreamEvent): StreamEvent[];
  /**
   * Open the gate (the snapshot resolved) and return every buffered event in
   * arrival order, for replay before live application resumes.
   */
  open(): StreamEvent[];
  /** Close the gate again (a re-snapshot began) so deltas buffer until `open`. */
  close(): void;
}

export function createDeltaGate(): DeltaGate {
  let buffered: StreamEvent[] = [];
  let open = false;

  return {
    accept(event) {
      if (open) return [event];
      buffered.push(event);
      return [];
    },
    open() {
      open = true;
      const events = buffered;
      buffered = [];
      return events;
    },
    close() {
      open = false;
    },
  };
}

function logEntryKey(entry: { time: number; level: number; msg: string }): string {
  return `${entry.time}:${entry.level}:${entry.msg}`;
}

function patchDevice(
  devices: DevicesData,
  qualifiedId: string,
  update: (device: DeviceDescriptor) => DeviceDescriptor,
): DevicesData {
  let changed = false;
  const next = devices.devices.map((device) => {
    if (device.qualifiedId !== qualifiedId) return device;
    changed = true;
    return update(device);
  });
  return changed ? { ...devices, devices: next } : devices;
}

// ---------------------------------------------------------------------------
// Overview projections (energy, weather) — non-streamed, slow-polled domains
// ---------------------------------------------------------------------------

export interface EnergySummary {
  powerWatts: number;
  energyWh: number;
  deviceCount: number;
}

/** Project energy data to the Overview summary, or `null` when unavailable. */
export function energySummary(energy: EnergyData | null): EnergySummary | null {
  if (!energy) return null;
  return {
    powerWatts: energy.powerWatts,
    energyWh: energy.energyWh,
    deviceCount: energy.breakdown.length,
  };
}

export interface WeatherSummary {
  available: boolean;
  /** Human-readable line: the condition when available, else why not. */
  message: string;
  current?: { temperature: number; feelsLike: number; description: string };
  forecast: { date: string; tempLow: number; tempHigh: number; description: string }[];
}

/** Project weather data to the Overview summary, including the unavailable marker. */
export function weatherSummary(weather: WeatherData | WeatherUnavailable | null): WeatherSummary {
  if (!weather) {
    return { available: false, message: "Weather unavailable.", forecast: [] };
  }

  if ("available" in weather) {
    return { available: false, message: weatherUnavailableMessage(weather.reason), forecast: [] };
  }

  return {
    available: true,
    message: weather.current.description,
    current: {
      temperature: weather.current.temperature,
      feelsLike: weather.current.feelsLike,
      description: weather.current.description,
    },
    forecast: weather.forecast.map((day) => ({
      date: day.date,
      tempLow: day.tempLow,
      tempHigh: day.tempHigh,
      description: day.description,
    })),
  };
}
