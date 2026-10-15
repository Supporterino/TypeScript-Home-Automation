import { describe, expect, it } from "bun:test";
import {
  coverStopCommand,
  coverTransportAction,
  rankDeviceTile,
  writableBrightnessCapability,
  writableColorCapability,
  writableColorTemperatureCapability,
} from "../src/app/lib/capability-ranking.js";
import { favoritesFromState } from "../src/app/lib/favorites.js";
import type { DeviceDescriptor } from "../src/app/types.js";
import { climateCardModel } from "../src/app/wall/cards/ClimateCard.js";
import {
  placedDeviceCardBox,
  resolveEnumControlForm,
  WALL_CARD_COMPACT_HEIGHT_PX,
  WALL_CARD_ENUM_SIBLING_RESERVE_PX,
} from "../src/app/wall/cards/card-composition.js";
import { resolveDeviceClass, WALL_DEVICE_CLASSES } from "../src/app/wall/cards/device-class.js";
import { lockCardModel } from "../src/app/wall/cards/LockCard.js";
import { numberCardControl } from "../src/app/wall/cards/NumberCard.js";
import { selectCardModel } from "../src/app/wall/cards/SelectCard.js";
import {
  ROW_UNIT_MAX,
  ROW_UNIT_MIN,
  WALL_GUTTER_MIN_PX,
  WALL_MIN_DEVICE_COLUMNS,
} from "../src/app/wall/grid.js";
import {
  DEVICE_CLASS_DEVICE_IDS,
  DEVICE_GRID_SELECTION,
  HARNESS_TEMPERATURE_ONLY_SENSOR_ID,
  MISSING_DEVICE_ID,
  WALL_HARNESS_FIXTURES,
} from "../src/app/wall/harness/fixtures.js";
import { resolvePages, WALL_FRAME_RESERVED_PX } from "../src/app/wall/pages.js";
import { WALL_WIDGET_REGISTRY } from "../src/app/wall/registry.js";
import { resolveDeviceGridPage } from "../src/app/wall/widgets/device-grid-model.js";
import { energyDisplay } from "../src/app/wall/widgets/energy-model.js";
import { temperatureWidgetState } from "../src/app/wall/widgets/temperature-model.js";
import { weatherWidgetState } from "../src/app/wall/widgets/weather-model.js";

/**
 * The harness roster's own contract (task 2.1; design.md D5, D6). The fixtures
 * are typed as the store's `DataStoreFixtures`, so typecheck catches a contract
 * change; what it cannot catch is a roster that still compiles while no longer
 * covering a wall device class — which is exactly the "fixture drift" risk
 * design.md names. Every claim D6 makes is therefore resolved through the same
 * pure functions the wall itself uses, not by inspection.
 */

const DEVICES_BY_ID = new Map(
  WALL_HARNESS_FIXTURES.devices.map((device) => [device.qualifiedId, device]),
);

function fixtureDevice(qualifiedId: string): DeviceDescriptor {
  const device = DEVICES_BY_ID.get(qualifiedId);
  if (!device) throw new Error(`no fixture device "${qualifiedId}"`);
  return device;
}

describe("the fixture roster", () => {
  it("carries one device per wall device class, resolving to it", () => {
    for (const expected of WALL_DEVICE_CLASSES) {
      const device = fixtureDevice(DEVICE_CLASS_DEVICE_IDS[expected]);
      expect(resolveDeviceClass(device.capabilities), expected).toBe(expected);
    }
  });

  it("declares every control a light card offers on the full light", () => {
    const light = fixtureDevice(DEVICE_CLASS_DEVICE_IDS.light);

    expect(rankDeviceTile(light.capabilities).action?.kind).toBe("on_off");
    expect(writableBrightnessCapability(light.capabilities)?.property).toBe("brightness");
    expect(writableColorTemperatureCapability(light.capabilities)?.property).toBe("color_temp");
    expect(writableColorCapability(light.capabilities)?.property).toBe("hue");
  });

  it("gives the cover a position and a stop command", () => {
    const cover = fixtureDevice(DEVICE_CLASS_DEVICE_IDS.cover);

    expect(rankDeviceTile(cover.capabilities).action?.kind).toBe("position");
    expect(coverStopCommand(cover.capabilities)).toEqual({ property: "state", value: "stop" });
    expect(coverTransportAction(cover.capabilities)).toEqual({
      property: "state",
      open: "open",
      close: "close",
      stop: "stop",
    });
  });

  it("backs the number, select, climate and lock classes with a control each card drives", () => {
    // The classes whose card has its own pure model are asserted through it, so a
    // fixture that resolves to a class but declares nothing that class's card can
    // drive fails here rather than reaching the harness as an inert card.
    const number = fixtureDevice(DEVICE_CLASS_DEVICE_IDS.number);
    expect(numberCardControl(number.capabilities)?.property).toBe("value");

    const select = fixtureDevice(DEVICE_CLASS_DEVICE_IDS.select);
    expect(selectCardModel(select.capabilities).values).toEqual(["auto", "manual", "off"]);

    const climate = fixtureDevice(DEVICE_CLASS_DEVICE_IDS.climate);
    expect(climateCardModel(climate.capabilities).setpoint?.property).toBe(
      "current_heating_setpoint",
    );
    expect(climateCardModel(climate.capabilities).modeValues).toEqual([
      "off",
      "heat",
      "cool",
      "auto",
      "dry",
      "fan_only",
    ]);

    const lock = fixtureDevice(DEVICE_CLASS_DEVICE_IDS.lock);
    expect(lockCardModel(lock.capabilities)).toEqual({
      property: "state",
      lock: "LOCK",
      unlock: "UNLOCK",
      stateProperty: "state",
    });
  });

  it("gives the read-only sensor a temperature and a humidity the temperature widget reads", () => {
    const sensor = fixtureDevice(DEVICE_CLASS_DEVICE_IDS.entity);

    // The sensor this home runs declares its humidity on the same device, so the
    // widget bound to it presents both readings (design.md W5; specs/wall-display
    // "A temperature widget shows its sensor's humidity").
    expect(temperatureWidgetState(sensor, sensor.qualifiedId)).toEqual({
      status: "reading",
      value: 21.5,
      unit: "°C",
      humidity: { value: 48, unit: "%" },
    });
  });

  it("keeps a second sensor that declares no humidity, so the other case is walked", () => {
    const temperatureOnly = fixtureDevice(HARNESS_TEMPERATURE_ONLY_SENSOR_ID);

    // The other half of the reading rule: a sensor with a temperature and no
    // humidity presents only its temperature, never a placeholder (design.md W5;
    // specs/wall-display "A sensor without humidity shows only its temperature").
    expect(temperatureWidgetState(temperatureOnly, temperatureOnly.qualifiedId)).toEqual({
      status: "reading",
      value: 16.2,
      unit: "°C",
    });
  });

  it("leaves the deliberately absent identifier out of the device map", () => {
    expect(DEVICES_BY_ID.has(MISSING_DEVICE_ID)).toBe(false);
  });

  it("carries an enum with more values than fit one row, so the fallback is reachable", () => {
    const climate = fixtureDevice(DEVICE_CLASS_DEVICE_IDS.climate);
    const values = climateCardModel(climate.capabilities).modeValues;
    expect(values.length).toBeGreaterThan(4);

    // At the widget's minimum span the option row cannot fit beside the setpoint
    // slider at the wall's touch target, so the enumerated control resolves to
    // one affordance rather than an option squeezed below the target.
    const box = placedDeviceCardBox({
      columns: WALL_MIN_DEVICE_COLUMNS,
      rowUnit: ROW_UNIT_MIN,
      heightPx: WALL_CARD_COMPACT_HEIGHT_PX,
    });
    expect(
      resolveEnumControlForm({ box, values, reservedPx: WALL_CARD_ENUM_SIBLING_RESERVE_PX }),
    ).toBe("single");
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

  it("carries more devices than the most tiles any legal placement presents", () => {
    // The roster's size is a derivation, not a number: the most tiles one page can
    // hold is `devices` at its largest span, the wall's smallest row unit and the
    // gutter's floor, with the chrome a *one-page* placement reserves held back —
    // which is the frame's ported inset alone (design.md W3; specs/wall-display
    // "Panel Fit"). A placement whose content fits one page draws no page-control
    // row, so it reserves no room for one and keeps that cell for tiles; only a
    // placement that pages pays `WALL_PAGE_CONTROL_RESERVED_PX` (resolvePagedTiles
    // resolves the larger plan only once the content pages). A larger row unit fits
    // no more rows, so an untitled placement at the floors is the ceiling.
    const mostTiles = resolvePages({
      span: WALL_WIDGET_REGISTRY.devices.max,
      count: 1,
      rowUnit: ROW_UNIT_MIN,
      gutterPx: WALL_GUTTER_MIN_PX,
      reservedPx: WALL_FRAME_RESERVED_PX,
    }).tilesPerPage;

    // The ceiling is exact: that many devices still fit the one page the frame-only
    // plan promises, and the next one pages — so any roster above this ceiling
    // necessarily resolves to more than one page, the property `fixtures.ts` claims.
    const span = WALL_WIDGET_REGISTRY.devices.max;
    expect(
      resolveDeviceGridPage({
        ids: DEVICE_GRID_SELECTION.slice(0, mostTiles),
        span,
        rowUnit: ROW_UNIT_MIN,
        page: 0,
      }).pageCount,
    ).toBe(1);
    expect(
      resolveDeviceGridPage({
        ids: DEVICE_GRID_SELECTION.slice(0, mostTiles + 1),
        span,
        rowUnit: ROW_UNIT_MIN,
        page: 0,
      }).pageCount,
    ).toBeGreaterThan(1);

    expect(DEVICE_GRID_SELECTION.length).toBeGreaterThan(mostTiles);
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
