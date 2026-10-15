/**
 * The wall harness's fixture roster (design.md D5, D6; task 2.1).
 *
 * One device per card archetype, so every composition a wall card has is
 * reachable without an engine: a full light (on/off plus brightness, colour
 * temperature, and colour), a plain switch, a cover with position and stop, a
 * read-only sensor, and a value device — plus a selection large enough that the
 * device grid must page, one scene automation, one room with members, and the
 * weather and energy readings those two widgets would otherwise fetch.
 * {@link MISSING_DEVICE_ID} is deliberately not a device in the map, so
 * `DeviceWidget`'s "is not available" path renders.
 *
 * The set is typed as the store's own `DataStoreFixtures`, and every device as
 * `DeviceDescriptor`, so a change to either contract is a compile error in
 * `bun run typecheck` rather than silent fixture drift (design.md Risks).
 *
 * Development-only surface: nothing in the shipped app imports this module —
 * the guards that assert the harness is unreachable from the application
 * entrypoint are `tests/wall-harness-guard.test.ts` and the marker assertion in
 * `tests/web-ui-assets.test.ts` (design.md D9).
 */
import {
  type Capability,
  composeBooleanCapabilityValue,
  type EnergyData,
  type WeatherData,
} from "@ts-ha/shared";
import {
  coverTransportAction,
  type FlatCapability,
  flattenCapabilities,
  pickOnOffCapability,
} from "../../lib/capability-ranking.js";
import type { CardArchetype } from "../../lib/card-archetype.js";
import type { DataStoreFixtures } from "../../lib/data-store.js";
import { FAVORITES_STATE_KEY } from "../../lib/favorites.js";
import type { Automation, DeviceDescriptor, RoomWithMembers, StateMap } from "../../types.js";
import type { HarnessFixtureControls } from "./messages.js";

/** The device source every fixture device reports; the qualified ids read as synthetic on sight. */
const FIXTURE_SOURCE = "fixture";

/**
 * The qualified identifier no fixture device carries, so a `device` or
 * `temperature` widget pointed at it renders its contained "is not available"
 * explanation (design.md D6).
 */
export const MISSING_DEVICE_ID = "fixture:not-connected";

const READ_WRITE = { readable: true, writable: true };
const READ_ONLY = { readable: true, writable: false };

/**
 * The full light: on/off plus the three controls a wall light card can drive, so
 * the card resolves to the `light` archetype and composes its whole form. Its
 * on/off declares the string encoding Zigbee2MQTT reports, so the declared-value
 * path is exercised rather than a real boolean.
 */
function lightCapabilities(): Capability[] {
  return [
    {
      kind: "light",
      access: READ_WRITE,
      valueType: "composite",
      features: [
        {
          kind: "switch",
          property: "state",
          access: READ_WRITE,
          valueType: "boolean",
          valueOn: "ON",
          valueOff: "OFF",
        },
        {
          kind: "brightness",
          property: "brightness",
          access: READ_WRITE,
          valueType: "numeric",
          range: { min: 0, max: 254 },
        },
        {
          kind: "color_temp",
          property: "color_temp",
          access: READ_WRITE,
          valueType: "numeric",
          range: { min: 153, max: 500 },
          unit: "mired",
        },
        {
          kind: "color",
          property: "hue",
          access: READ_WRITE,
          valueType: "numeric",
          range: { min: 0, max: 360 },
        },
      ],
    },
  ];
}

/** A plain switch: a writable boolean on/off and nothing else, so its card is the whole-card toggle. */
function switchCapabilities(): Capability[] {
  return [{ kind: "switch", property: "on", access: READ_WRITE, valueType: "boolean" }];
}

/** A cover that positions and stops: a writable position beside a transport enum naming open, close, and stop. */
function coverCapabilities(): Capability[] {
  return [
    {
      kind: "cover",
      access: READ_WRITE,
      valueType: "composite",
      features: [
        {
          kind: "position",
          property: "position",
          access: READ_WRITE,
          valueType: "numeric",
          range: { min: 0, max: 100 },
          unit: "%",
        },
        {
          kind: "enum",
          property: "state",
          access: READ_WRITE,
          valueType: "enum",
          permittedValues: ["open", "close", "stop"],
        },
      ],
    },
  ];
}

/** A read-only sensor: a readable temperature and nothing actuatable, so its card is a chrome-less readout. */
function sensorCapabilities(): Capability[] {
  return [
    {
      kind: "sensor",
      property: "temperature",
      access: READ_ONLY,
      valueType: "numeric",
      unit: "°C",
    },
  ];
}

/**
 * A value device: an actuatable value the wall has no specialised card for — a
 * fan's declared mode — so its card keeps the shared default composition and the
 * generic value control.
 */
function valueCapabilities(): Capability[] {
  return [
    {
      kind: "fan",
      access: READ_WRITE,
      valueType: "composite",
      features: [
        {
          kind: "enum",
          property: "mode",
          access: READ_WRITE,
          valueType: "enum",
          permittedValues: ["low", "medium", "high"],
        },
      ],
    },
  ];
}

function fixtureDevice(input: {
  id: string;
  displayName: string;
  state: StateMap;
  capabilities: Capability[];
}): DeviceDescriptor {
  return {
    source: FIXTURE_SOURCE,
    id: input.id,
    qualifiedId: `${FIXTURE_SOURCE}:${input.id}`,
    displayName: input.displayName,
    state: input.state,
    capabilities: input.capabilities,
    reachable: true,
    observation: { mode: "push", observedAt: 0 },
    hidden: false,
  };
}

const LIGHT = fixtureDevice({
  id: "light-kitchen",
  displayName: "Kitchen light",
  state: { state: "ON", brightness: 180, color_temp: 320, hue: 120 },
  capabilities: lightCapabilities(),
});

const SWITCH = fixtureDevice({
  id: "switch-hall",
  displayName: "Hall switch",
  state: { on: true },
  capabilities: switchCapabilities(),
});

const COVER = fixtureDevice({
  id: "cover-blinds",
  displayName: "Living room blinds",
  state: { position: 40, state: "open" },
  capabilities: coverCapabilities(),
});

const SENSOR = fixtureDevice({
  id: "sensor-hall",
  displayName: "Hall sensor",
  state: { temperature: 21.5 },
  capabilities: sensorCapabilities(),
});

const VALUE = fixtureDevice({
  id: "fan-bedroom",
  displayName: "Bedroom fan",
  state: { mode: "medium" },
  capabilities: valueCapabilities(),
});

/**
 * How many extra devices the paging selection carries. The device grid draws at
 * most 30 tiles on any legal placement — 6 across by 5 rows at the widget's
 * largest span (12 × 12) and the wall's smallest row unit, and a larger row unit
 * fits fewer rows — so a selection of this size always pages.
 * `tests/wall-harness-fixtures.test.ts` asserts the paging through
 * `resolveDeviceGridPage` rather than trusting this note.
 */
const PAGING_DEVICE_COUNT = 36;

const PAGING_DEVICES: DeviceDescriptor[] = Array.from({ length: PAGING_DEVICE_COUNT }, (_, index) =>
  fixtureDevice({
    id: `switch-plug-${index + 1}`,
    displayName: `Fixture plug ${index + 1}`,
    state: { on: index % 2 === 0 },
    capabilities: switchCapabilities(),
  }),
);

/** The device the energy reading attributes its home total to. */
const METERING_PLUG = fixtureDevice({
  id: "plug-washer",
  displayName: "Washing machine plug",
  state: { on: false },
  capabilities: switchCapabilities(),
});

/**
 * Every fixture device: one per card archetype first, so the grid's own first
 * page shows every composition, then the metering plug and the paging roster.
 */
const DEVICES: DeviceDescriptor[] = [
  LIGHT,
  SWITCH,
  COVER,
  SENSOR,
  VALUE,
  METERING_PLUG,
  ...PAGING_DEVICES,
];

/** The device the panel points a `device` widget at to reach each card archetype (task 5.2). */
export const ARCHETYPE_DEVICE_IDS: Readonly<Record<CardArchetype, string>> = {
  light: LIGHT.qualifiedId,
  toggle: SWITCH.qualifiedId,
  cover: COVER.qualifiedId,
  readout: SENSOR.qualifiedId,
  default: VALUE.qualifiedId,
};

/** The `devices` widget's selection: the whole roster, which always exceeds one page (task 5.2). */
export const DEVICE_GRID_SELECTION: readonly string[] = DEVICES.map((device) => device.qualifiedId);

/**
 * The room the panel points a `room` widget at. Its members are all five
 * archetype devices, so the panel's device selector and state controls are
 * observable in the stage for every key it offers: the room card renders each
 * member's own device card, and its command row groups the on/off and positioning
 * members.
 */
const ROOM: RoomWithMembers = {
  id: "fixture:living-room",
  name: "Living Room",
  members: [LIGHT, SWITCH, COVER, SENSOR, VALUE].map((device) => ({
    qualifiedId: device.qualifiedId,
    available: true,
    device,
  })),
};

/** The room id a `room` widget is pointed at (task 5.2). */
export const HARNESS_ROOM_ID = ROOM.id;

/** The automation name a `scene` widget is pointed at (task 5.2). */
export const HARNESS_SCENE_NAME = "evening-scene";

/** The scene the panel points a `scene` widget at. */
const AUTOMATIONS: Automation[] = [
  {
    name: HARNESS_SCENE_NAME,
    enabled: true,
    triggers: [{ type: "cron", expression: "0 18 * * *" }],
  },
];

/** Current conditions and a three-day forecast, in the shape `GET /api/weather` answers with. */
const WEATHER: WeatherData = {
  location: { latitude: 52.52, longitude: 13.405 },
  current: {
    temperature: 18.4,
    feelsLike: 17.1,
    humidity: 62,
    pressure: 1013,
    condition: "clouds",
    description: "partly cloudy",
    wind: { speed: 3.4, direction: 225, gust: 5.2 },
    cloudCover: 40,
    visibility: 10_000,
    uvIndex: 3,
    timestamp: 1_760_000_000,
  },
  forecast: [
    {
      date: "2026-03-02",
      tempHigh: 21.5,
      tempLow: 9.8,
      condition: "clear",
      description: "sunny",
      precipitationChance: 0.05,
      wind: { speed: 2.1, direction: 180 },
    },
    {
      date: "2026-03-03",
      tempHigh: 17.2,
      tempLow: 8.4,
      condition: "rain",
      description: "light rain",
      precipitationChance: 0.65,
      precipitationAmount: 3.2,
      wind: { speed: 4.8, direction: 270, gust: 7.4 },
    },
    {
      date: "2026-03-04",
      tempHigh: 14.6,
      tempLow: 6.9,
      condition: "drizzle",
      description: "drizzle",
      precipitationChance: 0.4,
      wind: { speed: 3.9, direction: 300 },
    },
  ],
};

/** Home totals with two contributing devices, in the shape `GET /api/energy` answers with. */
const ENERGY: EnergyData = {
  powerWatts: 1_234,
  energyWh: 12_480,
  breakdown: [
    {
      qualifiedId: LIGHT.qualifiedId,
      displayName: LIGHT.displayName,
      powerWatts: 42,
      energyWh: 1_850,
      available: true,
    },
    {
      qualifiedId: METERING_PLUG.qualifiedId,
      displayName: METERING_PLUG.displayName,
      powerWatts: 1_192,
      energyWh: 10_630,
      available: true,
    },
  ],
  history: [
    { timestamp: 1_759_999_000, powerWatts: 1_180 },
    { timestamp: 1_759_999_500, powerWatts: 1_260 },
    { timestamp: 1_760_000_000, powerWatts: 1_234 },
  ],
};

/** The state a healthy dashboard would hold: the favorites the wall's favorites card reads, plus one ordinary key. */
const STATE: StateMap = {
  night_mode: true,
  [FAVORITES_STATE_KEY]: [LIGHT.qualifiedId, COVER.qualifiedId],
};

/**
 * The harness's whole fixture set, typed as the store's own contract so the
 * fixtures cannot drift from what the data layer and the wall's widgets consume.
 * `weather` and `energy` are optional on that contract: leaving them off is how
 * the panel reaches those two widgets' own fetch path (task 5.2).
 */
export const WALL_HARNESS_FIXTURES: DataStoreFixtures = {
  devices: DEVICES,
  state: STATE,
  rooms: [ROOM],
  automations: AUTOMATIONS,
  transport: "live",
  weather: WEATHER,
  energy: ENERGY,
};

/** One percentage of a declared range as a raw value — the inverse of the wall's `formatBrightnessPercent`. */
function scalePercent(percent: number, range?: { min?: number; max?: number }): number {
  const min = range?.min ?? 0;
  const max = range?.max ?? 100;
  return Math.round(min + ((max - min) * percent) / 100);
}

/**
 * The selected device with the panel's controls applied to it. Each control
 * writes through the device's *declared* capabilities, so a device that
 * declares no brightness never gains a brightness reading — and the on/off
 * writes through the shared `composeBooleanCapabilityValue`, so a light whose
 * capability declares the Zigbee `"ON"`/`"OFF"` strings is driven in its own
 * encoding rather than with a real boolean (design.md D5; specs/web-ui "A
 * device known only from the stream keeps its declared encoding").
 *
 * A device that positions or transports is driven to its own extremes by the
 * same on/off control — its declared transport values, found by the wall's own
 * detector — so a cover's card is controllable from the panel's control set
 * rather than showing a state the controls cannot reach.
 */
function withControlState(
  device: DeviceDescriptor,
  controls: HarnessFixtureControls,
): DeviceDescriptor {
  const flat = flattenCapabilities(device.capabilities);
  const find = (property: string): FlatCapability | undefined =>
    flat.find((capability) => capability.property === property);
  const state: Record<string, unknown> = { ...device.state };

  const onOff = pickOnOffCapability(flat, "writable");
  if (onOff) state[onOff.property] = composeBooleanCapabilityValue(onOff, controls.on);

  const brightness = find("brightness");
  if (brightness) {
    state[brightness.property] = scalePercent(controls.brightnessPercent, brightness.range);
  }

  const colorTemp = find("color_temp");
  if (colorTemp) {
    state[colorTemp.property] = scalePercent(controls.colorTempPercent, colorTemp.range);
  }

  const temperature = find("temperature");
  if (temperature) state[temperature.property] = controls.temperature;

  const position = find("position");
  if (position) {
    state[position.property] = controls.on
      ? (position.range?.max ?? 100)
      : (position.range?.min ?? 0);
  }

  const transport = coverTransportAction(device.capabilities);
  if (transport) state[transport.property] = controls.on ? transport.open : transport.close;

  return { ...device, state };
}

/**
 * The fixture set the stage renders for one set of panel controls (tasks 4.1,
 * 5.2). Pure, so the panel's controls are reachable by `bun test` without a DOM,
 * and derived from the roster above rather than from a second copy of it.
 *
 * The room's members are derived from the resulting device map the same way the
 * store derives them from a snapshot, so turning the selected device's presence
 * off shows an unavailable member in the room card as well as routing a
 * `device` widget pointed at it to its contained explanation.
 */
export function fixtureSetFor(controls: HarnessFixtureControls): DataStoreFixtures {
  const selected = ARCHETYPE_DEVICE_IDS[controls.device];
  const devices = DEVICES.filter(
    (device) => controls.devicePresent || device.qualifiedId !== selected,
  ).map((device) =>
    device.qualifiedId === selected ? withControlState(device, controls) : device,
  );

  const byId = new Map(devices.map((device) => [device.qualifiedId, device]));
  const rooms = [ROOM].map((room) => ({
    ...room,
    members: room.members.map((member) => ({
      ...member,
      available: byId.has(member.qualifiedId),
      device: byId.get(member.qualifiedId) ?? null,
    })),
  }));

  // Built field by field rather than spread over the base set: a reading the
  // panel switches off must be *absent*, which a spread of the base would
  // re-supply.
  return {
    devices,
    state: STATE,
    rooms,
    automations: AUTOMATIONS,
    transport: "live",
    ...(controls.weather ? { weather: WEATHER } : {}),
    ...(controls.energy ? { energy: ENERGY } : {}),
  };
}
