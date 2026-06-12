# Prometheus Metrics

## Purpose

Exports device state and process health metrics in Prometheus format via the `/metrics` endpoint. Implements `ServicePlugin` for automatic lifecycle management. Populates per-device gauges by listening to `DeviceRegistry` state change events.

## Requirements

### ServicePlugin Implementation

The `PrometheusMetricsService` MUST implement `ServicePlugin`:
- `readonly serviceKey = "metrics"`
- `onStart(ctx)` — Start collecting default metrics, subscribe to device state changes
- `onStop()` — Detach all device listeners, clear gauges
- `registerRoutes(app)` — Mount `GET /metrics` endpoint

### Registration

The service is enabled by passing an instance or factory under the `"metrics"` key in the engine's services map. No additional configuration is required.

### Metrics Endpoint

`GET /metrics` MUST:
- Return Prometheus text format from the `prom-client` registry
- Be mounted on the shared Hono app (protected by `/api/*` auth middleware)
- Include `Content-Type: text/plain`

### Default Metrics

The system MUST collect `prom-client` default metrics (CPU, memory, event loop, GC, etc.) via `collectDefaultMetrics()`.

### Device Info Gauge

A `device_info` gauge MUST be populated for every tracked device with labels:
- `device` — friendly name
- `model` — device model identifier
- `vendor` — manufacturer
- `type` — device type (e.g., "Router", "EndDevice")
- `ieee_address` — IEEE 802.15.4 address
- `power_source` — "Battery" or "Mains"

### Device State Gauges

The system MUST populate these per-device gauges by reading device state fields:

**Lighting:**
- `device_state` — 0/1 (off/on)
- `device_brightness` — 0–254
- `device_color_temp` — mireds
- `device_color_hue` — 0–360
- `device_color_saturation` — 0–100
- `device_color_x`, `device_color_y` — CIE xy
- `device_color_r`, `device_color_g`, `device_color_b` — 0–255

**Climate / Environment:**
- `device_temperature` — Celsius
- `device_humidity` — percent
- `device_pressure` — hPa
- `device_illuminance` — lux
- `device_pm25` — µg/m³
- `device_voc_index` — VOC index
- `device_air_quality` — air quality score

**Sensors:**
- `device_occupancy` — 0/1
- `device_contact` — 0/1
- `device_water_leak` — 0/1

**Power:**
- `device_power` — Watts
- `device_energy` — kWh
- `device_voltage` — Volts
- `device_current` — Amps
- `device_power_outage_count`

**Battery:**
- `device_battery` — percent
- `device_battery_low` — 0/1

**Internal:**
- `device_internal_temperature` — Celsius

### Dynamic Device Lifecycle

On device added: register device info gauge, set up `DeviceStateChangeHandler`.
On device removed: remove all gauges for that device, detach handler.

### Disabled Registry

When `DEVICE_REGISTRY_ENABLED=false`, the service still starts and exposes default/process metrics, but no per-device gauges are populated.
