import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pino from "pino";
import { AggregateDeviceSource } from "../src/core/device-sources/aggregate.js";
import type {
  DeviceChangeListener,
  DeviceCommandOutcome,
  DeviceDescriptor,
  DeviceSource,
} from "../src/core/device-sources/device-source.js";
import { formatQualifiedId } from "../src/core/device-sources/qualified-id.js";
import { DeviceVisibility } from "../src/core/device-visibility.js";
import { RoomManager } from "../src/core/room-manager.js";
import { StateManager } from "../src/core/state/state-manager.js";

/** A minimal fake `DeviceVisibility` — every device is visible. */
function makeVisibility(): DeviceVisibility {
  return { isHidden: () => false } as unknown as DeviceVisibility;
}

const logger = pino({ level: "silent" });

function makeDescriptor(
  source: string,
  id: string,
  overrides: Partial<DeviceDescriptor> = {},
): DeviceDescriptor {
  return {
    source,
    id,
    qualifiedId: formatQualifiedId(source, id),
    displayName: id,
    state: {},
    capabilities: [],
    reachable: true,
    observation: { mode: "push", observedAt: Date.now() },
    hidden: false,
    ...overrides,
  };
}

/**
 * A fake `DeviceSource` whose device list and availability can be mutated
 * after construction, so tests can simulate a device unpairing, reappearing,
 * or its whole source being disabled — none of which `AggregateDeviceSource`
 * caches, so mutating this in place is visible on the very next call.
 */
function makeMutableSource(id: string, initialDevices: DeviceDescriptor[] = []) {
  const devices: DeviceDescriptor[] = [...initialDevices];
  let available = true;
  const source: DeviceSource = {
    id,
    get available() {
      return available;
    },
    start: () => {},
    stop: () => {},
    list: () => (available ? [...devices] : []),
    get: (deviceId: string) => (available ? devices.find((d) => d.id === deviceId) : undefined),
    command: async (): Promise<DeviceCommandOutcome> => ({ status: "ok" }),
    subscribe: (_listener: DeviceChangeListener) => () => {},
  };
  return {
    source,
    devices,
    setAvailable: (value: boolean) => {
      available = value;
    },
  };
}

describe("RoomManager", () => {
  let state: StateManager;
  let zigbee: ReturnType<typeof makeMutableSource>;
  let shelly: ReturnType<typeof makeMutableSource>;
  let nanoleaf: ReturnType<typeof makeMutableSource>;
  let aggregate: AggregateDeviceSource;
  let rooms: RoomManager;

  beforeEach(async () => {
    state = new StateManager(logger, { persist: false });
    zigbee = makeMutableSource("zigbee", [makeDescriptor("zigbee", "0xaaa111")]);
    shelly = makeMutableSource("shelly", [makeDescriptor("shelly", "living_room_plug")]);
    nanoleaf = makeMutableSource("nanoleaf", [makeDescriptor("nanoleaf", "panel")]);
    aggregate = new AggregateDeviceSource(
      [zigbee.source, shelly.source, nanoleaf.source],
      makeVisibility(),
      logger,
    );
    await aggregate.start();
    rooms = new RoomManager(state, aggregate, logger);
  });

  afterEach(async () => {
    await aggregate.stop();
  });

  describe("room definition (task 9.1)", () => {
    it("creates a room with no members", () => {
      const result = rooms.createRoom("Living Room");
      expect(result.status).toBe("ok");
      if (result.status !== "ok") throw new Error("unreachable");
      expect(result.room.name).toBe("Living Room");
      expect(result.room.id).toBeTruthy();

      const listed = rooms.listRooms();
      expect(listed).toHaveLength(1);
      expect(listed[0].members).toEqual([]);
    });

    it("rejects a duplicate room name and creates nothing", () => {
      rooms.createRoom("Kitchen");
      const result = rooms.createRoom("Kitchen");
      expect(result.status).toBe("duplicate_name");
      expect(rooms.listRooms()).toHaveLength(1);
    });

    it("renames a room, preserving its membership", () => {
      const created = rooms.createRoom("Office");
      if (created.status !== "ok") throw new Error("unreachable");
      rooms.assignDevice(zigbee.source.get("0xaaa111")?.qualifiedId ?? "", created.room.id);

      const renamed = rooms.renameRoom(created.room.id, "Study");
      expect(renamed.status).toBe("ok");
      if (renamed.status !== "ok") throw new Error("unreachable");
      expect(renamed.room.name).toBe("Study");

      const listed = rooms.listRooms();
      expect(listed[0].name).toBe("Study");
      expect(listed[0].members).toHaveLength(1);
    });

    it("rejects renaming to a name already in use by another room", () => {
      rooms.createRoom("Bedroom");
      const office = rooms.createRoom("Office");
      if (office.status !== "ok") throw new Error("unreachable");

      const result = rooms.renameRoom(office.room.id, "Bedroom");
      expect(result.status).toBe("duplicate_name");
      expect(rooms.getRoom(office.room.id)?.name).toBe("Office");
    });

    it("renaming a room to its own current name is not a duplicate", () => {
      const created = rooms.createRoom("Office");
      if (created.status !== "ok") throw new Error("unreachable");
      const result = rooms.renameRoom(created.room.id, "Office");
      expect(result.status).toBe("ok");
    });

    it("returns not_found for renaming or deleting an unknown room", () => {
      expect(rooms.renameRoom("nope", "X").status).toBe("not_found");
      expect(rooms.deleteRoom("nope")).toBe("not_found");
    });

    it("deleting a room does not delete its devices, which become unassigned", () => {
      const created = rooms.createRoom("Garage");
      if (created.status !== "ok") throw new Error("unreachable");
      const qualifiedId = formatQualifiedId("zigbee", "0xaaa111");
      rooms.assignDevice(qualifiedId, created.room.id);

      expect(rooms.deleteRoom(created.room.id)).toBe("ok");
      expect(rooms.listRooms()).toHaveLength(0);
      expect(rooms.getRoomForDevice(qualifiedId)).toBeNull();
      expect(aggregate.get(qualifiedId)).toBeDefined();
    });
  });

  describe("single room membership (task 9.2)", () => {
    it("reports a device in only its new room after reassignment", () => {
      const a = rooms.createRoom("A");
      const b = rooms.createRoom("B");
      if (a.status !== "ok" || b.status !== "ok") throw new Error("unreachable");
      const qualifiedId = formatQualifiedId("zigbee", "0xaaa111");

      rooms.assignDevice(qualifiedId, a.room.id);
      expect(rooms.getRoomForDevice(qualifiedId)?.id).toBe(a.room.id);

      rooms.assignDevice(qualifiedId, b.room.id);
      const listed = rooms.listRooms();
      const roomA = listed.find((r) => r.id === a.room.id);
      const roomB = listed.find((r) => r.id === b.room.id);
      expect(roomA?.members).toEqual([]);
      expect(roomB?.members.map((m) => m.qualifiedId)).toEqual([qualifiedId]);
    });

    it("is idempotent when assigning a device to the room it is already in", () => {
      const a = rooms.createRoom("A");
      if (a.status !== "ok") throw new Error("unreachable");
      const qualifiedId = formatQualifiedId("zigbee", "0xaaa111");

      expect(rooms.assignDevice(qualifiedId, a.room.id)).toBe("ok");
      expect(rooms.assignDevice(qualifiedId, a.room.id)).toBe("ok");

      const listed = rooms.listRooms();
      expect(listed[0].members).toHaveLength(1);
    });

    it("returns room_not_found when assigning to an unknown room", () => {
      const qualifiedId = formatQualifiedId("zigbee", "0xaaa111");
      expect(rooms.assignDevice(qualifiedId, "nope")).toBe("room_not_found");
      expect(rooms.getRoomForDevice(qualifiedId)).toBeNull();
    });

    it("unassigns a device", () => {
      const a = rooms.createRoom("A");
      if (a.status !== "ok") throw new Error("unreachable");
      const qualifiedId = formatQualifiedId("zigbee", "0xaaa111");
      rooms.assignDevice(qualifiedId, a.room.id);

      rooms.unassignDevice(qualifiedId);
      expect(rooms.getRoomForDevice(qualifiedId)).toBeNull();
      expect(rooms.listRooms()[0].members).toEqual([]);
    });
  });

  describe("rooms span device sources (task 9.5)", () => {
    it("holds a Zigbee, a Shelly, and a Nanoleaf device simultaneously", () => {
      const created = rooms.createRoom("Living Room");
      if (created.status !== "ok") throw new Error("unreachable");

      rooms.assignDevice(formatQualifiedId("zigbee", "0xaaa111"), created.room.id);
      rooms.assignDevice(formatQualifiedId("shelly", "living_room_plug"), created.room.id);
      rooms.assignDevice(formatQualifiedId("nanoleaf", "panel"), created.room.id);

      const listed = rooms.listRooms();
      expect(listed[0].members).toHaveLength(3);
      expect(listed[0].members.every((m) => m.available)).toBe(true);
      expect(listed[0].members.map((m) => m.device?.source).sort()).toEqual([
        "nanoleaf",
        "shelly",
        "zigbee",
      ]);
    });
  });

  describe("absent devices retain their assignment (task 9.3)", () => {
    it("marks an unpaired device unavailable but keeps it in the room", () => {
      const created = rooms.createRoom("Living Room");
      if (created.status !== "ok") throw new Error("unreachable");
      const qualifiedId = formatQualifiedId("zigbee", "0xaaa111");
      rooms.assignDevice(qualifiedId, created.room.id);

      // Unpair: remove it from the source's inventory entirely.
      zigbee.devices.splice(0, 1);

      const listed = rooms.listRooms();
      expect(listed[0].members).toHaveLength(1);
      expect(listed[0].members[0]).toEqual({ qualifiedId, available: false, device: null });
    });

    it("restores an unpaired device automatically once it becomes present again", () => {
      const created = rooms.createRoom("Living Room");
      if (created.status !== "ok") throw new Error("unreachable");
      const qualifiedId = formatQualifiedId("zigbee", "0xaaa111");
      rooms.assignDevice(qualifiedId, created.room.id);

      const descriptor = zigbee.devices[0];
      zigbee.devices.splice(0, 1);
      expect(rooms.listRooms()[0].members[0].available).toBe(false);

      zigbee.devices.push(descriptor);
      const listed = rooms.listRooms();
      expect(listed[0].members[0].available).toBe(true);
      expect(listed[0].members[0].device?.qualifiedId).toBe(qualifiedId);
    });

    it("reports a disabled source's devices as unavailable without losing the assignment", () => {
      const created = rooms.createRoom("Living Room");
      if (created.status !== "ok") throw new Error("unreachable");
      const qualifiedId = formatQualifiedId("shelly", "living_room_plug");
      rooms.assignDevice(qualifiedId, created.room.id);

      shelly.setAvailable(false);

      const listed = rooms.listRooms();
      expect(listed[0].members).toHaveLength(1);
      expect(listed[0].members[0].available).toBe(false);
    });

    it("does not error when an assignment references a device that has never been observed", () => {
      const created = rooms.createRoom("Living Room");
      if (created.status !== "ok") throw new Error("unreachable");
      rooms.assignDevice(formatQualifiedId("zigbee", "0xnever-seen"), created.room.id);

      const listed = rooms.listRooms();
      expect(listed[0].members).toHaveLength(1);
      expect(listed[0].members[0].available).toBe(false);
      expect(listed[0].members[0].device).toBeNull();
    });
  });

  describe("membership queries (task 9.4)", () => {
    it("reports both a present and an absent member of the same room", () => {
      const created = rooms.createRoom("Living Room");
      if (created.status !== "ok") throw new Error("unreachable");
      rooms.assignDevice(formatQualifiedId("zigbee", "0xaaa111"), created.room.id);
      rooms.assignDevice(formatQualifiedId("shelly", "living_room_plug"), created.room.id);
      shelly.setAvailable(false);

      const listed = rooms.listRooms();
      const byId = new Map(listed[0].members.map((m) => [m.qualifiedId, m]));
      expect(byId.get(formatQualifiedId("zigbee", "0xaaa111"))?.available).toBe(true);
      expect(byId.get(formatQualifiedId("shelly", "living_room_plug"))?.available).toBe(false);
    });

    it("reports the room a device belongs to", () => {
      const created = rooms.createRoom("Office");
      if (created.status !== "ok") throw new Error("unreachable");
      const qualifiedId = formatQualifiedId("zigbee", "0xaaa111");
      rooms.assignDevice(qualifiedId, created.room.id);
      expect(rooms.getRoomForDevice(qualifiedId)?.name).toBe("Office");
    });

    it("lists every present device belonging to no room as the unassigned group", () => {
      const created = rooms.createRoom("Office");
      if (created.status !== "ok") throw new Error("unreachable");
      rooms.assignDevice(formatQualifiedId("zigbee", "0xaaa111"), created.room.id);

      const unassigned = rooms.getUnassignedDevices();
      expect(unassigned.map((d) => d.qualifiedId).sort()).toEqual(
        [
          formatQualifiedId("nanoleaf", "panel"),
          formatQualifiedId("shelly", "living_room_plug"),
        ].sort(),
      );
    });
  });

  describe("visibility (design.md D9; task 3.8)", () => {
    it("hiding a device leaves its room membership intact", async () => {
      const realVisibility = new DeviceVisibility(state, logger);
      const visAggregate = new AggregateDeviceSource(
        [zigbee.source, shelly.source, nanoleaf.source],
        realVisibility,
        logger,
      );
      await visAggregate.start();
      const visRooms = new RoomManager(state, visAggregate, logger);

      const created = visRooms.createRoom("Living Room");
      if (created.status !== "ok") throw new Error("unreachable");
      const qualifiedId = formatQualifiedId("zigbee", "0xaaa111");
      visRooms.assignDevice(qualifiedId, created.room.id);

      realVisibility.hide(qualifiedId);

      const listed = visRooms.listRooms();
      const member = listed[0]?.members.find((m) => m.qualifiedId === qualifiedId);
      expect(member).toBeDefined();
      expect(member?.available).toBe(true);
      expect(visRooms.getRoomForDevice(qualifiedId)?.id).toBe(created.room.id);

      await visAggregate.stop();
    });

    it("getUnassignedDevices() still includes a hidden device", async () => {
      const realVisibility = new DeviceVisibility(state, logger);
      const visAggregate = new AggregateDeviceSource(
        [zigbee.source, shelly.source, nanoleaf.source],
        realVisibility,
        logger,
      );
      await visAggregate.start();
      const visRooms = new RoomManager(state, visAggregate, logger);

      const qualifiedId = formatQualifiedId("zigbee", "0xaaa111");
      realVisibility.hide(qualifiedId);

      const unassigned = visRooms.getUnassignedDevices();
      expect(unassigned.map((d) => d.qualifiedId)).toContain(qualifiedId);

      await visAggregate.stop();
    });
  });

  describe("durability (task 9.8)", () => {
    let tmpDir: string;
    let filePath: string;

    beforeEach(async () => {
      tmpDir = await mkdtemp(join(tmpdir(), "ts-ha-rooms-"));
      filePath = join(tmpDir, "state.json");
    });

    afterEach(async () => {
      await rm(tmpDir, { recursive: true, force: true });
    });

    it("restores rooms and assignments across a graceful restart", async () => {
      const s1 = new StateManager(logger, { persist: true, filePath });
      const zigbee1 = makeMutableSource("zigbee", [makeDescriptor("zigbee", "0xaaa111")]);
      const agg1 = new AggregateDeviceSource([zigbee1.source], makeVisibility(), logger);
      await agg1.start();
      const r1 = new RoomManager(s1, agg1, logger);

      const created = r1.createRoom("Living Room");
      if (created.status !== "ok") throw new Error("unreachable");
      r1.assignDevice(formatQualifiedId("zigbee", "0xaaa111"), created.room.id);
      // flush() (not save()) mirrors the engine's graceful-shutdown path.
      await s1.flush();
      await agg1.stop();

      const s2 = new StateManager(logger, { persist: true, filePath });
      await s2.load();
      const zigbee2 = makeMutableSource("zigbee", [makeDescriptor("zigbee", "0xaaa111")]);
      const agg2 = new AggregateDeviceSource([zigbee2.source], makeVisibility(), logger);
      await agg2.start();
      const r2 = new RoomManager(s2, agg2, logger);

      const listed = r2.listRooms();
      expect(listed).toHaveLength(1);
      expect(listed[0].name).toBe("Living Room");
      expect(listed[0].members).toHaveLength(1);
      expect(listed[0].members[0].available).toBe(true);

      await agg2.stop();
    });

    it("survives an abrupt termination once the write-behind window has elapsed", async () => {
      // No flush()/stop() is ever called on s1 below — the assignment reaches
      // disk only through the coalesced background flush that set()/setInternal()
      // schedules on its own, exactly like a process killed without a graceful
      // shutdown after the debounce window has already fired (design.md D6;
      // specs/device-rooms "Rooms survive abrupt termination").
      const s1 = new StateManager(logger, { persist: true, filePath, flushIntervalMs: 10 });
      const zigbee1 = makeMutableSource("zigbee", [makeDescriptor("zigbee", "0xaaa111")]);
      const agg1 = new AggregateDeviceSource([zigbee1.source], makeVisibility(), logger);
      await agg1.start();
      const r1 = new RoomManager(s1, agg1, logger);

      const created = r1.createRoom("Living Room");
      if (created.status !== "ok") throw new Error("unreachable");
      r1.assignDevice(formatQualifiedId("zigbee", "0xaaa111"), created.room.id);

      // Wait past the write-behind window for the scheduled flush to fire on
      // its own, with no explicit save()/flush() call standing in for a
      // graceful shutdown that never happens here.
      await new Promise((resolve) => setTimeout(resolve, 50));

      const s2 = new StateManager(logger, { persist: true, filePath });
      await s2.load();
      const zigbee2 = makeMutableSource("zigbee", [makeDescriptor("zigbee", "0xaaa111")]);
      const agg2 = new AggregateDeviceSource([zigbee2.source], makeVisibility(), logger);
      await agg2.start();
      const r2 = new RoomManager(s2, agg2, logger);

      const listed = r2.listRooms();
      expect(listed).toHaveLength(1);
      expect(listed[0].name).toBe("Living Room");
      expect(r2.getRoomForDevice(formatQualifiedId("zigbee", "0xaaa111"))?.id).toBe(
        created.room.id,
      );

      await agg1.stop();
      await agg2.stop();
    });
  });
});
