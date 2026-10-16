/**
 * The wall harness's fixture roster: one device per wall device class, plus a paging
 * selection, a scene, a room, and the weather and energy readings.
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
import type { DataStoreFixtures } from "../../lib/data-store.js";
import { FAVORITES_STATE_KEY } from "../../lib/favorites.js";
import type { Automation, DeviceDescriptor, RoomWithMembers, StateMap } from "../../types.js";
import type { WallDeviceClass } from "../cards/device-class.js";
import type { HarnessFixtureControls } from "./messages.js";

/** The device source every fixture device reports; the qualified ids read as synthetic on sight. */
const FIXTURE_SOURCE = "fixture";

/**
 * The qualified identifier no fixture device carries, so a widget pointed at it renders
 * its "is not available" explanation.
 */
export const MISSING_DEVICE_ID = "fixture:not-connected";

const READ_WRITE = { readable: true, writable: true };
const READ_ONLY = { readable: true, writable: false };

/**
 * The full light: on/off plus the three controls a wall light card can drive, so the
 * device resolves to the `light` class.
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

/** A plain switch: a writable boolean on/off and nothing else, so its card is the entity card's whole-card toggle. */
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

/**
 * A read-only sensor: a readable temperature beside a readable humidity on the same
 * device, and nothing actuatable.
 */
function sensorCapabilities(): Capability[] {
  return [
    {
      kind: "sensor",
      property: "temperature",
      access: READ_ONLY,
      valueType: "numeric",
      unit: "°C",
    },
    {
      kind: "sensor",
      property: "humidity",
      access: READ_ONLY,
      valueType: "numeric",
      unit: "%",
    },
  ];
}

/**
 * A temperature-only sensor: the same read-only shape with no humidity leaf.
 */
function temperatureOnlySensorCapabilities(): Capability[] {
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
 * A fan: a declared preset enum beneath a `fan` container, so its card is the fan card.
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

/**
 * A bounded numeric control with no specialised on/off card, so its card is the number
 * card.
 */
function numberCapabilities(): Capability[] {
  return [
    {
      kind: "number",
      property: "value",
      access: READ_WRITE,
      valueType: "numeric",
      range: { min: 0, max: 100 },
      unit: "%",
    },
  ];
}

/**
 * An enumerated control with no specialised card, so its card is the select card.
 */
function selectCapabilities(): Capability[] {
  return [
    {
      kind: "select",
      property: "option",
      access: READ_WRITE,
      valueType: "enum",
      permittedValues: ["auto", "manual", "off"],
    },
  ];
}

/**
 * A thermostat: a writable setpoint and mode beneath a climate container with a
 * measured temperature.
 */
function climateCapabilities(): Capability[] {
  return [
    {
      kind: "climate",
      access: READ_WRITE,
      valueType: "composite",
      features: [
        {
          kind: "climate",
          property: "current_heating_setpoint",
          access: READ_WRITE,
          valueType: "numeric",
          range: { min: 5, max: 35 },
          unit: "°C",
        },
        {
          kind: "climate",
          property: "system_mode",
          access: READ_WRITE,
          valueType: "enum",
          permittedValues: ["off", "heat", "cool", "auto", "dry", "fan_only"],
        },
        {
          kind: "climate",
          property: "local_temperature",
          access: READ_ONLY,
          valueType: "numeric",
          unit: "°C",
        },
      ],
    },
  ];
}

/**
 * A lock: a writable `state` enum naming its own lock and unlock values.
 */
function lockCapabilities(): Capability[] {
  return [
    {
      kind: "lock",
      access: READ_WRITE,
      valueType: "composite",
      features: [
        {
          kind: "lock",
          property: "state",
          access: READ_WRITE,
          valueType: "enum",
          permittedValues: ["LOCK", "UNLOCK"],
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
  state: { temperature: 21.5, humidity: 48 },
  capabilities: sensorCapabilities(),
});

/**
 * The temperature-only sensor: bound by a placed `temperature` widget so a harness walk
 * reaches the widget's other reading case.
 */
const TEMPERATURE_ONLY_SENSOR = fixtureDevice({
  id: "sensor-attic",
  displayName: "Attic sensor",
  state: { temperature: 16.2 },
  capabilities: temperatureOnlySensorCapabilities(),
});

const VALUE = fixtureDevice({
  id: "fan-bedroom",
  displayName: "Bedroom fan",
  state: { mode: "medium" },
  capabilities: valueCapabilities(),
});

const NUMBER = fixtureDevice({
  id: "number-valve",
  displayName: "Radiator valve",
  state: { value: 40 },
  capabilities: numberCapabilities(),
});

const SELECT = fixtureDevice({
  id: "select-mode",
  displayName: "Heating mode",
  state: { option: "auto" },
  capabilities: selectCapabilities(),
});

const CLIMATE = fixtureDevice({
  id: "climate-hall",
  displayName: "Hall thermostat",
  state: { current_heating_setpoint: 21, system_mode: "heat", local_temperature: 20.5 },
  capabilities: climateCapabilities(),
});

const LOCK = fixtureDevice({
  id: "lock-front",
  displayName: "Front door",
  state: { state: "LOCK" },
  capabilities: lockCapabilities(),
});

/**
 * How many extra devices the paging selection carries — larger than any one page the
 * wall can draw, so the selection always pages.
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
 * Every fixture device: one per wall device class first, then the metering plug, the
 * temperature-only sensor, and the paging roster.
 */
const DEVICES: DeviceDescriptor[] = [
  LIGHT,
  SWITCH,
  COVER,
  SENSOR,
  VALUE,
  NUMBER,
  SELECT,
  CLIMATE,
  LOCK,
  METERING_PLUG,
  TEMPERATURE_ONLY_SENSOR,
  ...PAGING_DEVICES,
];

/**
 * The device the panel points a typed device widget at to reach each wall device class.
 */
export const DEVICE_CLASS_DEVICE_IDS: Readonly<Record<WallDeviceClass, string>> = {
  light: LIGHT.qualifiedId,
  cover: COVER.qualifiedId,
  fan: VALUE.qualifiedId,
  climate: CLIMATE.qualifiedId,
  lock: LOCK.qualifiedId,
  number: NUMBER.qualifiedId,
  select: SELECT.qualifiedId,
  entity: SENSOR.qualifiedId,
};

/** The `devices` widget's selection: the whole roster, which always exceeds one page. */
export const DEVICE_GRID_SELECTION: readonly string[] = DEVICES.map((device) => device.qualifiedId);

/**
 * The sensor that declares no humidity, which a placed `temperature` widget is bound to
 * beside the hall sensor's.
 */
export const HARNESS_TEMPERATURE_ONLY_SENSOR_ID = TEMPERATURE_ONLY_SENSOR.qualifiedId;

/**
 * The room the panel points a `room` widget at, whose members span several wall device
 * classes.
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

/** The room id a `room` widget is pointed at. */
export const HARNESS_ROOM_ID = ROOM.id;

/** The automation name a `scene` widget is pointed at. */
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
 * The harness's whole fixture set, typed as the store's own contract so the fixtures
 * cannot drift.
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
 * The selected device with the panel's controls applied to it. Each control writes
 * through the device's declared capabilities.
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
 * The fixture set the stage renders for one set of panel controls, derived from the
 * roster above.
 */
export function fixtureSetFor(controls: HarnessFixtureControls): DataStoreFixtures {
  const selected = DEVICE_CLASS_DEVICE_IDS[controls.device];
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

  // Built field by field so a reading the panel switches off is absent.
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
