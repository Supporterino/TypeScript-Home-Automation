# Writing Automations

Every automation is a TypeScript class that extends `Automation`. It defines a unique name, one or more triggers, and an `execute()` method that runs when any trigger fires.

```ts
import { Automation, type Trigger, type TriggerContext } from "ts-home-automation";

export default class MyAutomation extends Automation {
  readonly name = "my-automation";

  readonly triggers: Trigger[] = [/* ... */];

  async execute(context: TriggerContext): Promise<void> {
    // your logic here
  }
}
```

Files in the configured `automationsDir` are discovered automatically at startup — just export a default class.

---

## Trigger types

### MQTT trigger

Fires when a matching MQTT message arrives. Topics support `+` (one level) and `#` (all remaining levels) wildcards.

```ts
{
  type: "mqtt",
  topic: "zigbee2mqtt/hallway_sensor",
  // optional: only trigger when this returns true
  filter: (payload) => (payload as OccupancyPayload).occupancy === true,
}
```

The `context` in `execute()` provides:

```ts
context.type    // "mqtt"
context.topic   // the matched topic string
context.payload // parsed JSON payload as Record<string, unknown>
```

### Cron trigger

Fires on a schedule using standard cron syntax. The `TZ` environment variable controls the timezone.

```ts
{
  type: "cron",
  expression: "0 7 * * *",  // every day at 07:00
}
```

The `context` provides:

```ts
context.type       // "cron"
context.expression // the cron expression string
context.firedAt    // Date — when the job fired
```

### State trigger

Fires when a state key changes. Any automation can set state with `this.state.set()`.

```ts
{
  type: "state",
  key: "night_mode",
  // optional filter — both newValue and oldValue are available
  filter: (newValue, oldValue) => newValue === true && oldValue !== true,
}
```

The `context` provides:

```ts
context.type      // "state"
context.key       // the state key
context.newValue  // the new value
context.oldValue  // the previous value
```

### Webhook trigger

Fires when an HTTP request hits `POST /webhook/<path>` (or another method if configured). Requires the HTTP server to be enabled (`HTTP_PORT != 0`).

```ts
{
  type: "webhook",
  path: "deploy",            // → POST /webhook/deploy
  methods: ["POST"],         // optional, defaults to ["POST"]
}
```

The `context` provides:

```ts
context.type     // "webhook"
context.path     // the path segment
context.method   // HTTP method
context.headers  // request headers
context.query    // query string params
context.body     // parsed request body
```

### Device state trigger

Fires when a tracked Zigbee2MQTT device's state changes. Requires `DEVICE_REGISTRY_ENABLED=true`. The trigger receives the full **merged** device state — if a light sends only `brightness`, that value is merged on top of the previously known state so `context.state` always reflects the complete picture.

```ts
{
  type: "device_state",
  friendlyName: "living_room_bulb",
  // Optional — only fire when this returns true
  filter: (state, device) => state.state === "ON",
}
```

The `context` provides:

```ts
context.type         // "device_state"
context.friendlyName // "living_room_bulb"
context.state        // full merged state: { state: "ON", brightness: 200, ... }
context.device       // ZigbeeDevice — type, ieee_address, definition, ...
```

### Device joined trigger

Fires when a new device joins the Zigbee network. Requires `DEVICE_REGISTRY_ENABLED=true`. Optionally scoped to a specific `friendlyName`; omit to fire for any joining device.

```ts
{ type: "device_joined" }                             // any device
{ type: "device_joined", friendlyName: "new_sensor" } // specific device only
```

The `context` provides:

```ts
context.type   // "device_joined"
context.device // ZigbeeDevice that joined
```

### Device left trigger

Fires when a device leaves the Zigbee network. Requires `DEVICE_REGISTRY_ENABLED=true`. Same scoping options as `device_joined`.

```ts
{ type: "device_left" }
{ type: "device_left", friendlyName: "old_plug" }
```

The `context` provides:

```ts
context.type   // "device_left"
context.device // ZigbeeDevice that left
```

> **When the registry is disabled:** `device_state`, `device_joined`, and `device_left` triggers are skipped with a warning at startup. The automation still registers and its other triggers remain active.

See [Device Registry](device-registry.md) for the full feature guide.

### Multiple triggers

An automation can declare as many triggers as needed. The `context.type` discriminant tells you which one fired:

```ts
readonly triggers: Trigger[] = [
  { type: "mqtt", topic: "zigbee2mqtt/button" },
  { type: "cron", expression: "0 22 * * *" },
];

async execute(context: TriggerContext): Promise<void> {
  if (context.type === "mqtt") {
    // button pressed
  } else if (context.type === "cron") {
    // scheduled run
  }
}
```

---

## Available services

Inside `execute()`, `onStart()`, and `onStop()` the following are available on `this`:

### MQTT

```ts
this.mqtt.publishToDevice(name, payload)
// Publishes to zigbee2mqtt/<name>/set

this.mqtt.publish(topic, payload)
// Publish to any arbitrary MQTT topic
```

### Shelly devices

```ts
// Switch control
this.shelly.turnOn(name)
this.shelly.turnOff(name)
this.shelly.toggle(name)
this.shelly.isOn(name)           // → Promise<boolean>
this.shelly.getPower(name)       // → Promise<number> (Watts)
this.shelly.getStatus(name)      // → full switch status

// Cover / shutter control
this.shelly.coverOpen(name)
this.shelly.coverClose(name)
this.shelly.coverStop(name)
this.shelly.coverGoToPosition(name, 50)  // 0–100%
```

Devices must be registered first. See [Shelly](services/shelly.md) for the full method list including cover status and relative movement.

### Nanoleaf

```ts
this.nanoleaf.turnOn(name)
this.nanoleaf.setBrightness(name, 80, 2)   // 80%, 2s transition
this.nanoleaf.setColor(name, 120, 100)     // hue, saturation
this.nanoleaf.setEffect(name, "Aurora")
```

See [Nanoleaf](services/nanoleaf.md) for pairing and full method list.

### Weather

> **Requires configuration.** `this.weather` returns `null` when no `WeatherService` is configured. Always null-check before use:

```ts
const weather = this.weather;
if (!weather) {
  this.logger.warn("Weather service not configured");
  return;
}

const current = await weather.getCurrent();
// current.temperature, current.condition, current.wind.speed, ...

const forecast = await weather.getForecast(3);
// forecast[0].tempHigh, forecast[0].precipitationChance, ...
```

See [Weather](services/weather.md) for setup.

### Notifications

```ts
await this.notify({
  title: "Front door opened",
  message: "Nobody should be home",
  priority: "urgent",
  tags: ["warning"],
});
```

If no notification service is configured, `this.notify()` logs a warning and does nothing. See [Notifications](services/notifications.md).

### State

```ts
this.state.set<boolean>("night_mode", true)
this.state.get<boolean>("night_mode", false)   // second arg is default
this.state.has("night_mode")
this.state.delete("night_mode")
```

Setting state fires `state` triggers in other automations. See [State Management](state.md).

### HTTP client

```ts
await this.http.get("https://api.example.com/data")
await this.http.post("https://api.example.com/action", { key: "value" })
await this.http.put(url, body)
await this.http.request(url, { method: "PATCH", body: "..." })
```

### Device Registry

> **Requires `DEVICE_REGISTRY_ENABLED=true`.** `this.deviceRegistry` returns `null` when disabled. Always null-check before use.

```ts
const registry = this.deviceRegistry;
if (!registry) return;

// Query tracked devices
registry.getDevices()                          // ZigbeeDevice[]
registry.getDevice("living_room_bulb")         // ZigbeeDevice | undefined
registry.hasDevice("living_room_bulb")         // boolean

// Current merged state for a device
registry.getDeviceState("living_room_bulb")    // Record<string, unknown> | undefined

// Human-readable name (from DeviceNiceNames mapping)
registry.getNiceName("living_room_bulb")       // string

// Listen for state changes
registry.onDeviceStateChange("living_room_bulb", (state, prev) => {
  this.logger.info({ brightness: state.brightness }, "Bulb changed");
});
```

See [Device Registry](device-registry.md) for the complete API and nice-name configuration.

### Logger and config

```ts
this.logger.info({ sensor: "hallway" }, "Motion detected")
this.logger.warn("Unexpected state")
this.config   // full application Config object
```

---

## Lifecycle hooks

Override `onStart()` and `onStop()` for setup and teardown. Both have empty default implementations.

```ts
async onStart(): Promise<void> {
  // Called when the automation is registered at engine startup.
  // Good for: initialising state, setting up timers.
  this.state.set("lights_on", false);
}

async onStop(): Promise<void> {
  // Called on engine shutdown.
  // Good for: clearing timers, releasing resources.
  if (this.timer) {
    clearTimeout(this.timer);
    this.timer = null;
  }
}
```

---

## Recommended patterns

### Named private constants

```ts
export default class MotionLight extends Automation {
  readonly name = "motion-light";

  private readonly SENSOR_TOPIC = "zigbee2mqtt/hallway_sensor";
  private readonly LIGHT_NAME = "hallway_light";
  private readonly TIMEOUT_MS = 5 * 60 * 1000;

  private timer: ReturnType<typeof setTimeout> | null = null;

  // ...
}
```

### State-scoped keys

Prefix state keys with the automation name to avoid collisions:

```ts
this.state.set("motion-light:lights_on", true);
this.state.get<boolean>("motion-light:lights_on", false);
```

### Error handling

Log errors and continue — never re-throw non-critical failures:

```ts
try {
  await this.shelly.turnOff("tv_plug");
} catch (err) {
  this.logger.error({ err }, "Failed to turn off TV plug");
}
```
