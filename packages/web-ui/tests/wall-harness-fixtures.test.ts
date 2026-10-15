import { describe, expect, it } from "bun:test";
import {
  coverStopCommand,
  coverTransportAction,
  rankDeviceTile,
  writableColorCapability,
  writableColorTemperatureCapability,
} from "../src/app/lib/capability-ranking.js";
import {
  type CardArchetype,
  cardArchetype,
  writableBrightnessCapability,
} from "../src/app/lib/card-archetype.js";
import { favoritesFromState } from "../src/app/lib/favorites.js";
import type { DeviceDescriptor } from "../src/app/types.js";
import { ROW_UNIT_MAX, ROW_UNIT_MIN } from "../src/app/wall/grid.js";
import {
  ARCHETYPE_DEVICE_IDS,
  DEVICE_GRID_SELECTION,
  MISSING_DEVICE_ID,
  WALL_HARNESS_FIXTURES,
} from "../src/app/wall/harness/fixtures.js";
import { WALL_WIDGET_REGISTRY } from "../src/app/wall/registry.js";
import { resolveDeviceGridPage } from "../src/app/wall/widgets/device-grid-model.js";
import { energyDisplay } from "../src/app/wall/widgets/energy-model.js";
import { temperatureWidgetState } from "../src/app/wall/widgets/temperature-model.js";
import { weatherWidgetState } from "../src/app/wall/widgets/weather-model.js";

/**
 * The harness roster's own contract (task 2.1; design.md D5, D6). The fixtures
 * are typed as the store's `DataStoreFixtures`, so typecheck catches a contract
 * change; what it cannot catch is a roster that still compiles while no longer
 * covering an archetype — which is exactly the "fixture drift" risk design.md
 * names. Every claim D6 makes is therefore resolved through the same pure
 * functions the wall itself uses, not by inspection.
 */
const ARCHETYPES: readonly CardArchetype[] = ["light", "toggle", "cover", "readout", "default"];

const DEVICES_BY_ID = new Map(
  WALL_HARNESS_FIXTURES.devices.map((device) => [device.qualifiedId, device]),
);

function fixtureDevice(qualifiedId: string): DeviceDescriptor {
  const device = DEVICES_BY_ID.get(qualifiedId);
  if (!device) throw new Error(`no fixture device "${qualifiedId}"`);
  return device;
}

function archetype(device: DeviceDescriptor): CardArchetype {
  return cardArchetype(rankDeviceTile(device.capabilities), device.capabilities);
}

describe("the fixture roster", () => {
  it("carries one device per card archetype, resolving to it", () => {
    for (const expected of ARCHETYPES) {
      const device = fixtureDevice(ARCHETYPE_DEVICE_IDS[expected]);
      expect(archetype(device), expected).toBe(expected);
    }
  });

  it("declares every control a light card offers on the full light", () => {
    const light = fixtureDevice(ARCHETYPE_DEVICE_IDS.light);

    expect(rankDeviceTile(light.capabilities).action?.kind).toBe("on_off");
    expect(writableBrightnessCapability(light.capabilities)?.property).toBe("brightness");
    expect(writableColorTemperatureCapability(light.capabilities)?.property).toBe("color_temp");
    expect(writableColorCapability(light.capabilities)?.property).toBe("hue");
  });

  it("gives the cover a position and a stop command", () => {
    const cover = fixtureDevice(ARCHETYPE_DEVICE_IDS.cover);

    expect(rankDeviceTile(cover.capabilities).action?.kind).toBe("position");
    expect(coverStopCommand(cover.capabilities)).toEqual({ property: "state", value: "stop" });
    expect(coverTransportAction(cover.capabilities)).toEqual({
      property: "state",
      open: "open",
      close: "close",
      stop: "stop",
    });
  });

  it("gives the read-only sensor a temperature the temperature widget reads", () => {
    const sensor = fixtureDevice(ARCHETYPE_DEVICE_IDS.readout);

    expect(temperatureWidgetState(sensor, sensor.qualifiedId)).toEqual({
      status: "reading",
      value: 21.5,
      unit: "°C",
    });
  });

  it("leaves the deliberately absent identifier out of the device map", () => {
    expect(DEVICES_BY_ID.has(MISSING_DEVICE_ID)).toBe(false);
  });
});

describe("the fixture selection and rooms", () => {
  it("selects a roster that pages at every span and row unit", () => {
    for (const rowUnit of [ROW_UNIT_MIN, ROW_UNIT_MAX]) {
      const plan = resolveDeviceGridPage({
        ids: [...DEVICE_GRID_SELECTION],
        span: WALL_WIDGET_REGISTRY.devices.max,
        rowUnit,
        page: 0,
      });

      expect(plan.pageCount, `row unit ${rowUnit}`).toBeGreaterThan(1);
      expect(plan.ids.length).toBeGreaterThan(0);
    }
  });

  it("selects only devices it actually carries", () => {
    expect(DEVICE_GRID_SELECTION.length).toBe(WALL_HARNESS_FIXTURES.devices.length);
    for (const qualifiedId of DEVICE_GRID_SELECTION) {
      expect(DEVICES_BY_ID.has(qualifiedId), qualifiedId).toBe(true);
    }
  });

  it("gives the room members that exist in the device map", () => {
    const rooms = WALL_HARNESS_FIXTURES.rooms;

    expect(rooms.length).toBeGreaterThan(0);
    for (const room of rooms) {
      expect(room.members.length).toBeGreaterThan(1);
      for (const member of room.members) {
        expect(member.available).toBe(true);
        expect(member.device).toBe(fixtureDevice(member.qualifiedId));
      }
    }
  });
});

describe("the fixture readings", () => {
  it("supplies a weather reading that renders rather than its unconfigured state", () => {
    const state = weatherWidgetState(WALL_HARNESS_FIXTURES.weather ?? null, null);
    if (state.status !== "ready") throw new Error(`the weather reading is ${state.status}`);

    expect(state.data.forecast.length).toBe(3);
    expect(state.data.current.description).toBe("partly cloudy");
  });

  it("supplies an energy reading with contributing devices", () => {
    const energy = WALL_HARNESS_FIXTURES.energy;
    if (!energy) throw new Error("the fixture set carries no energy reading");

    expect(energyDisplay(energy).meteringCount).toBeGreaterThan(0);
    for (const entry of energy.breakdown) {
      expect(DEVICES_BY_ID.has(entry.qualifiedId), entry.qualifiedId).toBe(true);
    }
  });

  it("supplies a scene automation and favorites the wall cards read", () => {
    expect(WALL_HARNESS_FIXTURES.automations.length).toBeGreaterThan(0);
    expect(favoritesFromState(WALL_HARNESS_FIXTURES.state).length).toBeGreaterThan(0);
    expect(WALL_HARNESS_FIXTURES.transport).toBe("live");
  });
});
