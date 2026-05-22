import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { Hono } from "hono";
import pino from "pino";
import { PrometheusMetricsService } from "../src/core/services/prometheus-metrics-service.js";
import type {
  DeviceRegistry,
  DeviceStateChangeHandler,
} from "../src/core/zigbee/device-registry.js";
import type { ZigbeeDevice } from "../src/types/zigbee/bridge.js";

const logger = pino({ level: "silent" });

function makeDevice(friendlyName: string, overrides: Partial<ZigbeeDevice> = {}): ZigbeeDevice {
  return {
    ieee_address: `0x${friendlyName}`,
    friendly_name: friendlyName,
    type: "Router",
    supported: true,
    disabled: false,
    interview_state: "SUCCESSFUL",
    definition: null,
    ...overrides,
  };
}

/**
 * A controllable mock `DeviceRegistry` for testing the metrics service.
 *
 * Stores listeners and lets the test fire device-add / device-remove / state-change
 * events without a real MQTT connection.
 */
function createMockDeviceRegistry() {
  const addedHandlers: Set<(device: ZigbeeDevice) => void> = new Set();
  const removedHandlers: Set<(device: ZigbeeDevice) => void> = new Set();
  const stateHandlers: Map<string, Set<DeviceStateChangeHandler>> = new Map();
  const devices: Map<string, ZigbeeDevice> = new Map();
  const states: Map<string, Record<string, unknown>> = new Map();

  const registry = {
    onDeviceAdded: mock((handler: (device: ZigbeeDevice) => void) => {
      addedHandlers.add(handler);
    }),
    offDeviceAdded: mock((handler: (device: ZigbeeDevice) => void) => {
      addedHandlers.delete(handler);
    }),
    onDeviceRemoved: mock((handler: (device: ZigbeeDevice) => void) => {
      removedHandlers.add(handler);
    }),
    offDeviceRemoved: mock((handler: (device: ZigbeeDevice) => void) => {
      removedHandlers.delete(handler);
    }),
    onDeviceStateChange: mock((name: string, handler: DeviceStateChangeHandler) => {
      let set = stateHandlers.get(name);
      if (!set) {
        set = new Set();
        stateHandlers.set(name, set);
      }
      set.add(handler);
    }),
    offDeviceStateChange: mock((name: string, handler: DeviceStateChangeHandler) => {
      stateHandlers.get(name)?.delete(handler);
    }),
    getDevices: mock(() => Array.from(devices.values())),
    getDeviceState: mock((name: string) => states.get(name)),
    hasDevice: mock((name: string) => devices.has(name)),
    getNiceName: mock((name: string) => name),
  } as unknown as DeviceRegistry;

  /** Fire an onDeviceAdded event for the given device. */
  function addDevice(device: ZigbeeDevice, state?: Record<string, unknown>): void {
    devices.set(device.friendly_name, device);
    if (state) states.set(device.friendly_name, state);
    for (const handler of addedHandlers) handler(device);
  }

  /** Fire an onDeviceRemoved event for the given device. */
  function removeDevice(device: ZigbeeDevice): void {
    devices.delete(device.friendly_name);
    states.delete(device.friendly_name);
    for (const handler of removedHandlers) handler(device);
  }

  /** Simulate an incoming state change for a device. */
  function emitStateChange(friendlyName: string, newState: Record<string, unknown>): void {
    const prev = states.get(friendlyName);
    states.set(friendlyName, { ...prev, ...newState });
    for (const handler of stateHandlers.get(friendlyName) ?? []) {
      handler({ ...prev, ...newState }, prev);
    }
  }

  return { registry, addDevice, removeDevice, emitStateChange };
}

describe("PrometheusMetricsService", () => {
  let service: PrometheusMetricsService;
  let app: Hono;
  let mockRegistry: ReturnType<typeof createMockDeviceRegistry>;

  beforeEach(() => {
    service = new PrometheusMetricsService(logger);
    mockRegistry = createMockDeviceRegistry();
    app = new Hono();
    service.registerRoutes(app);
  });

  // ---------------------------------------------------------------------------
  // registerRoutes
  // ---------------------------------------------------------------------------

  describe("registerRoutes", () => {
    it("mounts GET /metrics returning 200 with plain text", async () => {
      const res = await app.request("/metrics");
      expect(res.status).toBe(200);
    });

    it("returns valid Prometheus exposition format", async () => {
      const res = await app.request("/metrics");
      const body = await res.text();

      // Prometheus format: # HELP, # TYPE, and metric lines
      expect(body).toContain("# HELP");
      expect(body).toContain("# TYPE");
      expect(body).toMatch(/\n\S+\{/); // metric lines have metricname{labels}
    });

    it("includes process-level default metrics", async () => {
      const res = await app.request("/metrics");
      const body = await res.text();
      // collectDefaultMetrics registers process_* gauges
      expect(body).toMatch(/process_/);
    });
  });

  // ---------------------------------------------------------------------------
  // Device gauges
  // ---------------------------------------------------------------------------

  describe("device gauges", () => {
    beforeEach(async () => {
      await service.onStart({
        http: {} as never,
        logger,
        deviceRegistry: mockRegistry.registry,
      });
    });

    afterEach(async () => {
      await service.onStop();
    });

    it("sets the info gauge when a device is added", async () => {
      mockRegistry.addDevice(
        makeDevice("bulb", {
          definition: { model: "TRÅDFRI", vendor: "IKEA", description: "bulb", source: "native" },
        }),
      );

      const res = await app.request("/metrics");
      const body = await res.text();
      expect(body).toContain('zigbee_device_info{device="bulb"');
      expect(body).toContain('model="TRÅDFRI"');
      expect(body).toContain('vendor="IKEA"');
    });

    it("sets device_state gauge from incoming state", async () => {
      mockRegistry.addDevice(makeDevice("bulb"));
      mockRegistry.emitStateChange("bulb", { state: "ON" });

      const res = await app.request("/metrics");
      const body = await res.text();
      expect(body).toContain('zigbee_device_state{device="bulb"} 1');
    });

    it("sets device_state to 0 for OFF", async () => {
      mockRegistry.addDevice(makeDevice("bulb"));
      mockRegistry.emitStateChange("bulb", { state: "OFF" });

      const res = await app.request("/metrics");
      const body = await res.text();
      expect(body).toContain('zigbee_device_state{device="bulb"} 0');
    });

    it("updates brightness gauge", async () => {
      mockRegistry.addDevice(makeDevice("bulb"));
      mockRegistry.emitStateChange("bulb", { state: "ON", brightness: 200 });

      const res = await app.request("/metrics");
      const body = await res.text();
      expect(body).toContain('zigbee_device_brightness{device="bulb"} 200');
    });

    it("updates temperature and humidity gauges", async () => {
      mockRegistry.addDevice(makeDevice("sensor"));
      mockRegistry.emitStateChange("sensor", { temperature: 22.5, humidity: 55 });

      const res = await app.request("/metrics");
      const body = await res.text();
      expect(body).toContain('zigbee_device_temperature{device="sensor"} 22.5');
      expect(body).toContain('zigbee_device_humidity{device="sensor"} 55');
    });

    it("updates battery gauge", async () => {
      mockRegistry.addDevice(makeDevice("remote"));
      mockRegistry.emitStateChange("remote", { battery: 88 });

      const res = await app.request("/metrics");
      const body = await res.text();
      expect(body).toContain('zigbee_device_battery{device="remote"} 88');
    });

    it("updates contact gauge (closed = 1)", async () => {
      mockRegistry.addDevice(makeDevice("door"));
      mockRegistry.emitStateChange("door", { contact: true });

      const res = await app.request("/metrics");
      const body = await res.text();
      expect(body).toContain('zigbee_device_contact{device="door"} 1');
    });

    it("updates occupancy gauge (occupied = 1)", async () => {
      mockRegistry.addDevice(makeDevice("motion"));
      mockRegistry.emitStateChange("motion", { occupancy: true });

      const res = await app.request("/metrics");
      const body = await res.text();
      expect(body).toContain('zigbee_device_occupancy{device="motion"} 1');
    });

    it("updates power and energy gauges", async () => {
      mockRegistry.addDevice(makeDevice("plug"));
      mockRegistry.emitStateChange("plug", { power: 45.2, energy: 1.23 });

      const res = await app.request("/metrics");
      const body = await res.text();
      expect(body).toContain('zigbee_device_power{device="plug"} 45.2');
      expect(body).toContain('zigbee_device_energy{device="plug"} 1.23');
    });

    it("updates linkquality gauge", async () => {
      mockRegistry.addDevice(makeDevice("sensor"));
      mockRegistry.emitStateChange("sensor", { linkquality: 150 });

      const res = await app.request("/metrics");
      const body = await res.text();
      expect(body).toContain('zigbee_device_linkquality{device="sensor"} 150');
    });

    it("updates color_temp gauge", async () => {
      mockRegistry.addDevice(makeDevice("bulb"));
      mockRegistry.emitStateChange("bulb", { color_temp: 370 });

      const res = await app.request("/metrics");
      const body = await res.text();
      expect(body).toContain('zigbee_device_color_temp{device="bulb"} 370');
    });

    it("merges partial state updates — keeps previous values", async () => {
      mockRegistry.addDevice(makeDevice("bulb"), { state: "ON", brightness: 200 });
      // Partial update: only brightness changes
      mockRegistry.emitStateChange("bulb", { brightness: 100 });

      const res = await app.request("/metrics");
      const body = await res.text();
      expect(body).toContain('zigbee_device_state{device="bulb"} 1');
      expect(body).toContain('zigbee_device_brightness{device="bulb"} 100');
    });

    it("removes all gauge entries when a device is removed", async () => {
      mockRegistry.addDevice(makeDevice("bulb"), { state: "ON", brightness: 200 });
      mockRegistry.removeDevice(makeDevice("bulb"));

      const res = await app.request("/metrics");
      const body = await res.text();
      expect(body).not.toContain('device="bulb"');
    });

    it("does not create gauges for non-numeric values", async () => {
      mockRegistry.addDevice(makeDevice("sensor"));
      mockRegistry.emitStateChange("sensor", { temperature: "hot" });

      const res = await app.request("/metrics");
      const body = await res.text();
      // Should not appear because "hot" is not a number
      expect(body).not.toContain('zigbee_device_temperature{device="sensor"}');
    });

    // ── Colour ─────────────────────────────────────────────────────────

    it("exposes colour hue and saturation sub-gauges", async () => {
      mockRegistry.addDevice(makeDevice("bulb"));
      mockRegistry.emitStateChange("bulb", { color: { hue: 180, saturation: 75 } });

      const res = await app.request("/metrics");
      const body = await res.text();
      expect(body).toContain('zigbee_device_color_hue{device="bulb"} 180');
      expect(body).toContain('zigbee_device_color_saturation{device="bulb"} 75');
    });

    it("exposes colour CIE xy sub-gauges", async () => {
      mockRegistry.addDevice(makeDevice("bulb"));
      mockRegistry.emitStateChange("bulb", { color: { x: 0.45, y: 0.35 } });

      const res = await app.request("/metrics");
      const body = await res.text();
      expect(body).toContain('zigbee_device_color_x{device="bulb"} 0.45');
      expect(body).toContain('zigbee_device_color_y{device="bulb"} 0.35');
    });

    it("exposes colour RGB sub-gauges", async () => {
      mockRegistry.addDevice(makeDevice("bulb"));
      mockRegistry.emitStateChange("bulb", { color: { r: 255, g: 128, b: 64 } });

      const res = await app.request("/metrics");
      const body = await res.text();
      expect(body).toContain('zigbee_device_color_r{device="bulb"} 255');
      expect(body).toContain('zigbee_device_color_g{device="bulb"} 128');
      expect(body).toContain('zigbee_device_color_b{device="bulb"} 64');
    });

    it("ignores colour field when it is not an object", async () => {
      mockRegistry.addDevice(makeDevice("bulb"));
      mockRegistry.emitStateChange("bulb", { color: "#FF0000" });

      const res = await app.request("/metrics");
      const body = await res.text();
      expect(body).not.toContain('zigbee_device_color_hue{device="bulb"}');
    });

    // ── Climate / environment ──────────────────────────────────────────

    it("exposes pressure gauge", async () => {
      mockRegistry.addDevice(makeDevice("sensor"));
      mockRegistry.emitStateChange("sensor", { pressure: 1013.2 });

      const res = await app.request("/metrics");
      const body = await res.text();
      expect(body).toContain('zigbee_device_pressure{device="sensor"} 1013.2');
    });

    it("exposes illuminance gauge from illuminance_lux key", async () => {
      mockRegistry.addDevice(makeDevice("motion"));
      mockRegistry.emitStateChange("motion", { illuminance_lux: 1200 });

      const res = await app.request("/metrics");
      const body = await res.text();
      expect(body).toContain('zigbee_device_illuminance{device="motion"} 1200');
    });

    it("exposes illuminance gauge from illuminance key", async () => {
      mockRegistry.addDevice(makeDevice("motion2"));
      mockRegistry.emitStateChange("motion2", { illuminance: 800 });

      const res = await app.request("/metrics");
      const body = await res.text();
      expect(body).toContain('zigbee_device_illuminance{device="motion2"} 800');
    });

    it("exposes pm25 gauge", async () => {
      mockRegistry.addDevice(makeDevice("air"));
      mockRegistry.emitStateChange("air", { pm25: 15 });

      const res = await app.request("/metrics");
      const body = await res.text();
      expect(body).toContain('zigbee_device_pm25{device="air"} 15');
    });

    it("exposes voc_index gauge", async () => {
      mockRegistry.addDevice(makeDevice("air"));
      mockRegistry.emitStateChange("air", { voc_index: 120 });

      const res = await app.request("/metrics");
      const body = await res.text();
      expect(body).toContain('zigbee_device_voc_index{device="air"} 120');
    });

    it("maps air_quality to ordinal", async () => {
      mockRegistry.addDevice(makeDevice("purifier"));
      mockRegistry.emitStateChange("purifier", { air_quality: "good" });

      const res = await app.request("/metrics");
      const body = await res.text();
      expect(body).toContain('zigbee_device_air_quality{device="purifier"} 5');
    });

    it("maps air_quality unknown to 0", async () => {
      mockRegistry.addDevice(makeDevice("purifier"));
      mockRegistry.emitStateChange("purifier", { air_quality: "unknown" });

      const res = await app.request("/metrics");
      const body = await res.text();
      expect(body).toContain('zigbee_device_air_quality{device="purifier"} 0');
    });

    // ── Water leak ─────────────────────────────────────────────────────

    it("exposes water_leak gauge", async () => {
      mockRegistry.addDevice(makeDevice("leak_sensor"));
      mockRegistry.emitStateChange("leak_sensor", { water_leak: true });

      const res = await app.request("/metrics");
      const body = await res.text();
      expect(body).toContain('zigbee_device_water_leak{device="leak_sensor"} 1');
    });

    // ── Power monitoring ───────────────────────────────────────────────

    it("exposes voltage and current gauges", async () => {
      mockRegistry.addDevice(makeDevice("plug"));
      mockRegistry.emitStateChange("plug", { voltage: 230, current: 0.45 });

      const res = await app.request("/metrics");
      const body = await res.text();
      expect(body).toContain('zigbee_device_voltage{device="plug"} 230');
      expect(body).toContain('zigbee_device_current{device="plug"} 0.45');
    });

    it("exposes power_outage_count gauge", async () => {
      mockRegistry.addDevice(makeDevice("leak_sensor"));
      mockRegistry.emitStateChange("leak_sensor", { power_outage_count: 3 });

      const res = await app.request("/metrics");
      const body = await res.text();
      expect(body).toContain('zigbee_device_power_outage_count{device="leak_sensor"} 3');
    });

    // ── Battery ────────────────────────────────────────────────────────

    it("exposes battery_low gauge", async () => {
      mockRegistry.addDevice(makeDevice("remote"));
      mockRegistry.emitStateChange("remote", { battery_low: true });

      const res = await app.request("/metrics");
      const body = await res.text();
      expect(body).toContain('zigbee_device_battery_low{device="remote"} 1');
    });

    // ── Device internal ────────────────────────────────────────────────

    it("exposes internal temperature distinct from ambient temperature", async () => {
      mockRegistry.addDevice(makeDevice("leak_sensor"));
      mockRegistry.emitStateChange("leak_sensor", { device_temperature: 42 });

      const res = await app.request("/metrics");
      const body = await res.text();
      expect(body).toContain('zigbee_device_internal_temperature{device="leak_sensor"} 42');
      // Ambient temperature gauge should not be affected
      expect(body).not.toContain('zigbee_device_temperature{device="leak_sensor"}');
    });

    it("exposes device_age gauge", async () => {
      mockRegistry.addDevice(makeDevice("purifier"));
      mockRegistry.emitStateChange("purifier", { device_age: 1209600 });

      const res = await app.request("/metrics");
      const body = await res.text();
      expect(body).toContain('zigbee_device_device_age{device="purifier"} 1209600');
    });

    // ── Air purifier ───────────────────────────────────────────────────

    it("exposes fan_state gauge (ON/OFF → 1/0)", async () => {
      mockRegistry.addDevice(makeDevice("purifier"));
      mockRegistry.emitStateChange("purifier", { fan_state: "ON" });

      const res = await app.request("/metrics");
      const body = await res.text();
      expect(body).toContain('zigbee_device_fan_state{device="purifier"} 1');
    });

    it("exposes fan_speed gauge", async () => {
      mockRegistry.addDevice(makeDevice("purifier"));
      mockRegistry.emitStateChange("purifier", { fan_speed: 5 });

      const res = await app.request("/metrics");
      const body = await res.text();
      expect(body).toContain('zigbee_device_fan_speed{device="purifier"} 5');
    });

    it("exposes filter_age gauge", async () => {
      mockRegistry.addDevice(makeDevice("purifier"));
      mockRegistry.emitStateChange("purifier", { filter_age: 4320 });

      const res = await app.request("/metrics");
      const body = await res.text();
      expect(body).toContain('zigbee_device_filter_age{device="purifier"} 4320');
    });

    it("exposes replace_filter gauge", async () => {
      mockRegistry.addDevice(makeDevice("purifier"));
      mockRegistry.emitStateChange("purifier", { replace_filter: true });

      const res = await app.request("/metrics");
      const body = await res.text();
      expect(body).toContain('zigbee_device_replace_filter{device="purifier"} 1');
    });

    it("exposes child_lock gauge (LOCK → 1)", async () => {
      mockRegistry.addDevice(makeDevice("purifier"));
      mockRegistry.emitStateChange("purifier", { child_lock: "LOCK" });

      const res = await app.request("/metrics");
      const body = await res.text();
      expect(body).toContain('zigbee_device_child_lock{device="purifier"} 1');
    });

    it("exposes led_enable gauge", async () => {
      mockRegistry.addDevice(makeDevice("purifier"));
      mockRegistry.emitStateChange("purifier", { led_enable: true });

      const res = await app.request("/metrics");
      const body = await res.text();
      expect(body).toContain('zigbee_device_led_enable{device="purifier"} 1');
    });

    // ── Misc counters ──────────────────────────────────────────────────

    it("exposes trigger_count gauge", async () => {
      mockRegistry.addDevice(makeDevice("leak_sensor"));
      mockRegistry.emitStateChange("leak_sensor", { trigger_count: 12 });

      const res = await app.request("/metrics");
      const body = await res.text();
      expect(body).toContain('zigbee_device_trigger_count{device="leak_sensor"} 12');
    });
  });

  // ---------------------------------------------------------------------------
  // Null deviceRegistry
  // ---------------------------------------------------------------------------

  describe("null deviceRegistry", () => {
    it("starts without errors when deviceRegistry is null", async () => {
      await expect(
        service.onStart({
          http: {} as never,
          logger,
          deviceRegistry: null,
        }),
      ).resolves.toBeUndefined();
    });

    it("still serves process metrics", async () => {
      await service.onStart({
        http: {} as never,
        logger,
        deviceRegistry: null,
      });

      const res = await app.request("/metrics");
      const body = await res.text();
      expect(body).toMatch(/process_/);
      // No device metric data points (only HELP/TYPE lines, no actual values)
      expect(body).not.toContain("zigbee_device_info{");
    });
  });

  // ---------------------------------------------------------------------------
  // onStart processes existing devices
  // ---------------------------------------------------------------------------

  describe("existing devices at startup", () => {
    it("registers state listeners for devices already in the registry", async () => {
      // Seed the mock registry with a device before onStart
      const bulb = makeDevice("bulb");
      mockRegistry.addDevice(bulb, { state: "OFF" });

      await service.onStart({
        http: {} as never,
        logger,
        deviceRegistry: mockRegistry.registry,
      });

      // Should have the info gauge and initial state from the existing device
      const res = await app.request("/metrics");
      const body = await res.text();
      expect(body).toContain('zigbee_device_info{device="bulb"');
      expect(body).toContain('zigbee_device_state{device="bulb"} 0');

      // A live state update should still work
      mockRegistry.emitStateChange("bulb", { state: "ON", brightness: 254 });
      const res2 = await app.request("/metrics");
      const body2 = await res2.text();
      expect(body2).toContain('zigbee_device_state{device="bulb"} 1');
      expect(body2).toContain('zigbee_device_brightness{device="bulb"} 254');
    });
  });
});
