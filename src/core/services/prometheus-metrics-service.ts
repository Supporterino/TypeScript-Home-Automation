import type { Hono } from "hono";
import type { Logger } from "pino";
import { collectDefaultMetrics, Gauge, Registry } from "prom-client";
import type { ZigbeeDevice } from "../../types/zigbee/bridge.js";
import type { DeviceRegistry, DeviceStateChangeHandler } from "../zigbee/device-registry.js";
import type { CoreContext, ServicePlugin } from "./service-plugin.js";

type InfoLabels = {
  device: string;
  model: string;
  vendor: string;
  type: string;
  ieee_address: string;
  power_source: string;
};

/**
 * Prometheus metrics service exposing device state and process health.
 *
 * Implements `ServicePlugin` so the engine calls `onStart`, `onStop`, and
 * `registerRoutes` automatically.  Enabled simply by passing a (factory)
 * instance under the `"metrics"` key in the `services` map:
 *
 * ```ts
 * import { createEngine, PrometheusMetricsService } from "ts-home-automation";
 *
 * const engine = createEngine({
 *   automationsDir: "...",
 *   services: {
 *     metrics: (http, logger) => new PrometheusMetricsService(logger),
 *   },
 * });
 * ```
 *
 * When `DEVICE_REGISTRY_ENABLED=false` the service still starts — process and
 * default metrics are exposed, but no per-device gauges are populated.
 */
export class PrometheusMetricsService implements ServicePlugin {
  readonly serviceKey = "metrics";

  private readonly register: Registry;

  // Per-device state handlers, keyed by friendly_name — stored for cleanup.
  private readonly stateHandlers: Map<string, DeviceStateChangeHandler> = new Map();
  private readonly deviceInfoLabels: Map<string, InfoLabels> = new Map();
  private onDeviceAddedCb: ((device: ZigbeeDevice) => void) | null = null;
  private onDeviceRemovedCb: ((device: ZigbeeDevice) => void) | null = null;
  private deviceRegistry: DeviceRegistry | null = null;

  // ── Info ──────────────────────────────────────────────────────────────────

  private readonly deviceInfoGauge: Gauge<
    "device" | "model" | "vendor" | "type" | "ieee_address" | "power_source"
  >;

  // ── State gauges ──────────────────────────────────────────────────────────

  // Lighting
  private readonly stateGauge: Gauge<"device">;
  private readonly brightnessGauge: Gauge<"device">;
  private readonly colorTempGauge: Gauge<"device">;
  private readonly colorHueGauge: Gauge<"device">;
  private readonly colorSaturationGauge: Gauge<"device">;
  private readonly colorXGauge: Gauge<"device">;
  private readonly colorYGauge: Gauge<"device">;
  private readonly colorRGauge: Gauge<"device">;
  private readonly colorGGauge: Gauge<"device">;
  private readonly colorBGauge: Gauge<"device">;

  // Climate / environment
  private readonly temperatureGauge: Gauge<"device">;
  private readonly humidityGauge: Gauge<"device">;
  private readonly pressureGauge: Gauge<"device">;
  private readonly illuminanceGauge: Gauge<"device">;
  private readonly pm25Gauge: Gauge<"device">;
  private readonly vocIndexGauge: Gauge<"device">;
  private readonly airQualityGauge: Gauge<"device">;

  // Motion / occupancy
  private readonly occupancyGauge: Gauge<"device">;

  // Contact
  private readonly contactGauge: Gauge<"device">;

  // Water leak
  private readonly waterLeakGauge: Gauge<"device">;

  // Power monitoring
  private readonly powerGauge: Gauge<"device">;
  private readonly energyGauge: Gauge<"device">;
  private readonly voltageGauge: Gauge<"device">;
  private readonly currentGauge: Gauge<"device">;
  private readonly powerOutageCountGauge: Gauge<"device">;

  // Battery
  private readonly batteryGauge: Gauge<"device">;
  private readonly batteryLowGauge: Gauge<"device">;

  // Device internal
  private readonly internalTemperatureGauge: Gauge<"device">;
  private readonly deviceAgeGauge: Gauge<"device">;

  // Network
  private readonly linkqualityGauge: Gauge<"device">;

  // Air purifier
  private readonly fanStateGauge: Gauge<"device">;
  private readonly fanSpeedGauge: Gauge<"device">;
  private readonly filterAgeGauge: Gauge<"device">;
  private readonly replaceFilterGauge: Gauge<"device">;
  private readonly childLockGauge: Gauge<"device">;
  private readonly ledEnableGauge: Gauge<"device">;

  // Misc counters
  private readonly triggerCountGauge: Gauge<"device">;

  // ── All single-label gauges for batch deregister ──────────────────────────

  private readonly allSingleLabelGauges: Gauge<"device">[];

  constructor(private readonly logger: Logger) {
    this.register = new Registry();
    collectDefaultMetrics({ register: this.register });

    // Info
    this.deviceInfoGauge = this.makeGauge(
      "zigbee_device_info",
      "Zigbee device metadata (constant 1)",
      ["device", "model", "vendor", "type", "ieee_address", "power_source"],
    );

    // Lighting
    this.stateGauge = this.makeGauge(
      "zigbee_device_state",
      "Device on/off state (1 = ON, 0 = OFF)",
    );
    this.brightnessGauge = this.makeGauge(
      "zigbee_device_brightness",
      "Light brightness level (0-254)",
    );
    this.colorTempGauge = this.makeGauge(
      "zigbee_device_color_temp",
      "Light colour temperature in mired",
    );
    this.colorHueGauge = this.makeGauge("zigbee_device_color_hue", "Light colour hue (0-360)");
    this.colorSaturationGauge = this.makeGauge(
      "zigbee_device_color_saturation",
      "Light colour saturation (0-100)",
    );
    this.colorXGauge = this.makeGauge("zigbee_device_color_x", "Light colour CIE x");
    this.colorYGauge = this.makeGauge("zigbee_device_color_y", "Light colour CIE y");
    this.colorRGauge = this.makeGauge("zigbee_device_color_r", "Light colour red (0-255)");
    this.colorGGauge = this.makeGauge("zigbee_device_color_g", "Light colour green (0-255)");
    this.colorBGauge = this.makeGauge("zigbee_device_color_b", "Light colour blue (0-255)");

    // Climate / environment
    this.temperatureGauge = this.makeGauge(
      "zigbee_device_temperature",
      "Temperature in degrees Celsius",
    );
    this.humidityGauge = this.makeGauge("zigbee_device_humidity", "Relative humidity percentage");
    this.pressureGauge = this.makeGauge("zigbee_device_pressure", "Atmospheric pressure in hPa");
    this.illuminanceGauge = this.makeGauge(
      "zigbee_device_illuminance",
      "Ambient light level in lux",
    );
    this.pm25Gauge = this.makeGauge("zigbee_device_pm25", "PM2.5 particulate matter in µg/m³");
    this.vocIndexGauge = this.makeGauge("zigbee_device_voc_index", "VOC index");
    this.airQualityGauge = this.makeGauge(
      "zigbee_device_air_quality",
      "Air quality ordinal (6=excellent … 0=unknown)",
    );

    // Motion / occupancy
    this.occupancyGauge = this.makeGauge(
      "zigbee_device_occupancy",
      "Occupancy sensor state (1 = occupied, 0 = vacant)",
    );

    // Contact
    this.contactGauge = this.makeGauge(
      "zigbee_device_contact",
      "Contact sensor state (1 = closed, 0 = open)",
    );

    // Water leak
    this.waterLeakGauge = this.makeGauge(
      "zigbee_device_water_leak",
      "Water leak detected (1 = leak, 0 = dry)",
    );

    // Power monitoring
    this.powerGauge = this.makeGauge("zigbee_device_power", "Instantaneous power draw in watts");
    this.energyGauge = this.makeGauge(
      "zigbee_device_energy",
      "Cumulative energy consumption in kWh",
    );
    this.voltageGauge = this.makeGauge("zigbee_device_voltage", "Voltage in volts");
    this.currentGauge = this.makeGauge("zigbee_device_current", "Current in amperes");
    this.powerOutageCountGauge = this.makeGauge(
      "zigbee_device_power_outage_count",
      "Power outage count",
    );

    // Battery
    this.batteryGauge = this.makeGauge("zigbee_device_battery", "Battery level percentage");
    this.batteryLowGauge = this.makeGauge(
      "zigbee_device_battery_low",
      "Battery low warning (1 = low)",
    );

    // Device internal
    this.internalTemperatureGauge = this.makeGauge(
      "zigbee_device_internal_temperature",
      "Device internal temperature in °C",
    );
    this.deviceAgeGauge = this.makeGauge("zigbee_device_device_age", "Device uptime in minutes");

    // Network
    this.linkqualityGauge = this.makeGauge(
      "zigbee_device_linkquality",
      "Zigbee link quality (LQI)",
    );

    // Air purifier
    this.fanStateGauge = this.makeGauge("zigbee_device_fan_state", "Fan state (1 = ON, 0 = OFF)");
    this.fanSpeedGauge = this.makeGauge("zigbee_device_fan_speed", "Fan speed level");
    this.filterAgeGauge = this.makeGauge("zigbee_device_filter_age", "Filter age in minutes");
    this.replaceFilterGauge = this.makeGauge(
      "zigbee_device_replace_filter",
      "Filter needs replacement (1 = true)",
    );
    this.childLockGauge = this.makeGauge("zigbee_device_child_lock", "Child lock (1 = LOCK)");
    this.ledEnableGauge = this.makeGauge(
      "zigbee_device_led_enable",
      "LED enable state (1 = enabled)",
    );

    // Misc counters
    this.triggerCountGauge = this.makeGauge("zigbee_device_trigger_count", "Device trigger count");

    // Batch list for deregister — all single-label gauges
    this.allSingleLabelGauges = [
      this.stateGauge,
      this.brightnessGauge,
      this.colorTempGauge,
      this.colorHueGauge,
      this.colorSaturationGauge,
      this.colorXGauge,
      this.colorYGauge,
      this.colorRGauge,
      this.colorGGauge,
      this.colorBGauge,
      this.temperatureGauge,
      this.humidityGauge,
      this.pressureGauge,
      this.illuminanceGauge,
      this.pm25Gauge,
      this.vocIndexGauge,
      this.airQualityGauge,
      this.occupancyGauge,
      this.contactGauge,
      this.waterLeakGauge,
      this.powerGauge,
      this.energyGauge,
      this.voltageGauge,
      this.currentGauge,
      this.powerOutageCountGauge,
      this.batteryGauge,
      this.batteryLowGauge,
      this.internalTemperatureGauge,
      this.deviceAgeGauge,
      this.linkqualityGauge,
      this.fanStateGauge,
      this.fanSpeedGauge,
      this.filterAgeGauge,
      this.replaceFilterGauge,
      this.childLockGauge,
      this.ledEnableGauge,
      this.triggerCountGauge,
    ];
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────

  async onStart(ctx: CoreContext): Promise<void> {
    this.deviceRegistry = ctx.deviceRegistry;
    if (!this.deviceRegistry) {
      this.logger.info(
        "Device registry unavailable (DEVICE_REGISTRY_ENABLED=false) — only process metrics exposed",
      );
      return;
    }

    // Register device-add / device-remove listeners.
    this.onDeviceAddedCb = (device) => this.handleDeviceAdded(device);
    this.onDeviceRemovedCb = (device) => this.handleDeviceRemoved(device);
    this.deviceRegistry.onDeviceAdded(this.onDeviceAddedCb);
    this.deviceRegistry.onDeviceRemoved(this.onDeviceRemovedCb);

    // Process devices already present at startup.
    for (const device of this.deviceRegistry.getDevices()) {
      this.handleDeviceAdded(device);
    }

    this.logger.info(
      { devices: this.deviceRegistry.getDevices().length },
      "Prometheus metrics service started",
    );
  }

  async onStop(): Promise<void> {
    if (this.deviceRegistry) {
      if (this.onDeviceAddedCb) {
        this.deviceRegistry.offDeviceAdded(this.onDeviceAddedCb);
        this.onDeviceAddedCb = null;
      }
      if (this.onDeviceRemovedCb) {
        this.deviceRegistry.offDeviceRemoved(this.onDeviceRemovedCb);
        this.onDeviceRemovedCb = null;
      }
    }

    // Unsubscribe all per-device state handlers.
    for (const [friendlyName, handler] of this.stateHandlers) {
      this.deviceRegistry?.offDeviceStateChange(friendlyName, handler);
    }
    this.stateHandlers.clear();

    // Remove all device-level gauge entries.
    this.deregisterAllDevices();

    this.register.clear();
    this.logger.info("Prometheus metrics service stopped");
  }

  // ── Routes ───────────────────────────────────────────────────────────────

  registerRoutes(app: Hono): void {
    app.get("/metrics", async (c) => {
      const metrics = await this.register.metrics();
      return c.text(metrics);
    });
  }

  // ── Device tracking ──────────────────────────────────────────────────────

  private handleDeviceAdded(device: ZigbeeDevice): void {
    const name = device.friendly_name;

    // Set info gauge (constant 1 with device metadata labels).
    const infoLabels: InfoLabels = {
      device: name,
      model: device.definition?.model ?? "",
      vendor: device.definition?.vendor ?? "",
      type: device.type,
      ieee_address: device.ieee_address,
      power_source: device.power_source ?? "unknown",
    };
    this.deviceInfoGauge.set(infoLabels, 1);
    this.deviceInfoLabels.set(name, infoLabels);

    // Subscribe to state changes for this device.
    const handler: DeviceStateChangeHandler = (_state, _prev) => {
      this.handleDeviceState(name, _state);
    };
    this.stateHandlers.set(name, handler);
    this.deviceRegistry?.onDeviceStateChange(name, handler);

    // Populate state from any already-known data.
    const existingState = this.deviceRegistry?.getDeviceState(name);
    if (existingState) {
      this.handleDeviceState(name, existingState);
    }
  }

  private handleDeviceRemoved(device: ZigbeeDevice): void {
    const name = device.friendly_name;

    // Unsubscribe state handler.
    const handler = this.stateHandlers.get(name);
    if (handler) {
      this.deviceRegistry?.offDeviceStateChange(name, handler);
      this.stateHandlers.delete(name);
    }

    // Remove all gauge entries for this device.
    this.deregisterDevice(name);
  }

  private handleDeviceState(friendlyName: string, state: Record<string, unknown>): void {
    const labels = { device: friendlyName };

    // Lighting — state
    this.setBoolFrom(state, labels, "state", this.stateGauge, "ON");

    // Lighting — numeric
    this.setNumeric(state, labels, "brightness", this.brightnessGauge);
    this.setNumeric(state, labels, "color_temp", this.colorTempGauge);

    // Lighting — colour (nested object)
    if ("color" in state && typeof state.color === "object" && state.color !== null) {
      const c = state.color as Record<string, unknown>;
      this.setNumeric(c, labels, "hue", this.colorHueGauge);
      this.setNumeric(c, labels, "saturation", this.colorSaturationGauge);
      this.setNumeric(c, labels, "x", this.colorXGauge);
      this.setNumeric(c, labels, "y", this.colorYGauge);
      this.setNumeric(c, labels, "r", this.colorRGauge);
      this.setNumeric(c, labels, "g", this.colorGGauge);
      this.setNumeric(c, labels, "b", this.colorBGauge);
    }

    // Climate / environment — numeric
    this.setNumeric(state, labels, "temperature", this.temperatureGauge);
    this.setNumeric(state, labels, "humidity", this.humidityGauge);
    this.setNumeric(state, labels, "pressure", this.pressureGauge);
    // Both key variants map to the same gauge
    this.setNumeric(state, labels, "illuminance", this.illuminanceGauge);
    this.setNumeric(state, labels, "illuminance_lux", this.illuminanceGauge);
    this.setNumeric(state, labels, "pm25", this.pm25Gauge);
    this.setNumeric(state, labels, "voc_index", this.vocIndexGauge);

    // Climate / environment — enum
    if ("air_quality" in state) {
      this.airQualityGauge.set(labels, airQualityOrdinal(state.air_quality));
    }

    // Occupancy / contact — booleans / strings
    this.setBoolFrom(state, labels, "occupancy", this.occupancyGauge);
    this.setBoolFrom(state, labels, "contact", this.contactGauge);

    // Water leak
    this.setBoolFrom(state, labels, "water_leak", this.waterLeakGauge);

    // Power monitoring — numeric
    this.setNumeric(state, labels, "power", this.powerGauge);
    this.setNumeric(state, labels, "energy", this.energyGauge);
    this.setNumeric(state, labels, "voltage", this.voltageGauge);
    this.setNumeric(state, labels, "current", this.currentGauge);
    this.setNumeric(state, labels, "power_outage_count", this.powerOutageCountGauge);

    // Battery
    this.setNumeric(state, labels, "battery", this.batteryGauge);
    this.setBoolFrom(state, labels, "battery_low", this.batteryLowGauge);

    // Device internal
    this.setNumeric(state, labels, "device_temperature", this.internalTemperatureGauge);
    this.setNumeric(state, labels, "device_age", this.deviceAgeGauge);

    // Network
    this.setNumeric(state, labels, "linkquality", this.linkqualityGauge);

    // Air purifier
    this.setBoolFrom(state, labels, "fan_state", this.fanStateGauge, "ON");
    this.setNumeric(state, labels, "fan_speed", this.fanSpeedGauge);
    this.setNumeric(state, labels, "filter_age", this.filterAgeGauge);
    this.setBoolFrom(state, labels, "replace_filter", this.replaceFilterGauge);
    this.setBoolFrom(state, labels, "child_lock", this.childLockGauge, "LOCK");
    this.setBoolFrom(state, labels, "led_enable", this.ledEnableGauge);

    // Misc counters
    this.setNumeric(state, labels, "trigger_count", this.triggerCountGauge);
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private makeGauge(
    name: string,
    help: string,
    labelNames: string[] = ["device"],
  ): Gauge<"device"> {
    return new Gauge({
      name,
      help,
      labelNames,
      registers: [this.register],
    });
  }

  private setNumeric(
    source: Record<string, unknown>,
    labels: { device: string },
    key: string,
    gauge: Gauge<"device">,
  ): void {
    if (key in source) {
      const val = source[key];
      if (typeof val === "number") {
        gauge.set(labels, val);
      }
    }
  }

  private setBoolFrom(
    source: Record<string, unknown>,
    labels: { device: string },
    key: string,
    gauge: Gauge<"device">,
    truthy?: string,
  ): void {
    if (key in source) {
      const val = source[key];
      const isTrue = val === true || val === "true" || (truthy !== undefined && val === truthy);
      gauge.set(labels, isTrue ? 1 : 0);
    }
  }

  private deregisterDevice(friendlyName: string): void {
    const labels = { device: friendlyName };
    const infoLabels = this.deviceInfoLabels.get(friendlyName);
    if (infoLabels) {
      this.deviceInfoGauge.remove(infoLabels);
      this.deviceInfoLabels.delete(friendlyName);
    }
    for (const gauge of this.allSingleLabelGauges) {
      gauge.remove(labels);
    }
  }

  private deregisterAllDevices(): void {
    for (const [name, handler] of this.stateHandlers) {
      this.deviceRegistry?.offDeviceStateChange(name, handler);
      this.deregisterDevice(name);
    }
    this.stateHandlers.clear();
    this.deviceInfoLabels.clear();
  }
}

// ── Air quality ordinal ────────────────────────────────────────────────────

const AIR_QUALITY_RANK: Record<string, number> = {
  excellent: 6,
  good: 5,
  moderate: 4,
  poor: 3,
  unhealthy: 2,
  hazardous: 1,
  out_of_range: 0,
};

function airQualityOrdinal(value: unknown): number {
  if (typeof value === "string") return AIR_QUALITY_RANK[value] ?? 0;
  return 0;
}
