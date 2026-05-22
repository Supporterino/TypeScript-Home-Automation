# Prometheus Metrics

The built-in `PrometheusMetricsService` exposes process, runtime, and per-device Zigbee metrics as a Prometheus-compatible `/metrics` HTTP endpoint. Uses [prom-client](https://github.com/siimon/prom-client) under the hood.

---

## Prerequisites

- **`DEVICE_REGISTRY_ENABLED=true`** — required for per-device Zigbee gauges. Without it the service still starts and exposes process/default metrics, but no device-level data is populated.
- `prom-client` is already bundled as a dependency of `ts-home-automation`. No additional installation is needed.

---

## Registering the service

Pass a `PrometheusMetricsService` factory to the `services.metrics` field in your entry point:

```ts
import { createEngine, PrometheusMetricsService } from "ts-home-automation";

const engine = createEngine({
  automationsDir: "./src/automations",
  services: {
    metrics: (http, logger) => new PrometheusMetricsService(logger),
  },
});

await engine.start();
```

The service requires no configuration — it auto-discovers devices from the device registry at startup and reacts to runtime device join/leave events.

---

## HTTP endpoint

The service registers a single route on the shared HTTP server:

| Method | Path | Description |
|---|---|---|
| `GET` | `/metrics` | Returns all metrics in Prometheus text exposition format |

The endpoint is **not** protected by `HTTP_TOKEN` auth — this is intentional, as most Prometheus scrapers do not support bearer token authentication by default. If you need access control, consider placing a reverse proxy (e.g. nginx, Traefik) in front of the engine and restricting `/metrics` at that layer.

---

## Exposed metrics

### Default metrics (always present)

`prom-client`'s `collectDefaultMetrics()` is called automatically, providing standard Node.js process metrics:

- `process_cpu_user_seconds_total`
- `process_cpu_system_seconds_total`
- `process_cpu_seconds_total`
- `process_start_time_seconds`
- `process_resident_memory_bytes`
- `nodejs_eventloop_lag_seconds`
- `nodejs_heap_size_total_bytes` / `nodejs_heap_size_used_bytes`
- `nodejs_heap_space_size_used_bytes`
- `nodejs_version_info`
- ...and others (see [prom-client docs](https://github.com/siimon/prom-client))

### Device info (requires device registry)

| Metric | Type | Labels | Description |
|---|---|---|---|
| `zigbee_device_info` | Gauge | `device`, `model`, `vendor`, `type`, `ieee_address`, `power_source` | Metadata gauge set to 1 for each known device |

### Device state gauges (requires device registry)

All device-level gauges use a single `device` label (friendly name). Values are set automatically from Zigbee state updates.

#### Lighting

| Metric | Description |
|---|---|
| `zigbee_device_state` | On/off state (1 = ON, 0 = OFF) |
| `zigbee_device_brightness` | Brightness level (0–254) |
| `zigbee_device_color_temp` | Colour temperature in mired |
| `zigbee_device_color_hue` | Colour hue (0–360) |
| `zigbee_device_color_saturation` | Colour saturation (0–100) |
| `zigbee_device_color_x` | CIE colour x |
| `zigbee_device_color_y` | CIE colour y |
| `zigbee_device_color_r` | Red channel (0–255) |
| `zigbee_device_color_g` | Green channel (0–255) |
| `zigbee_device_color_b` | Blue channel (0–255) |

#### Climate / environment

| Metric | Description |
|---|---|
| `zigbee_device_temperature` | Temperature in °C |
| `zigbee_device_humidity` | Relative humidity % |
| `zigbee_device_pressure` | Atmospheric pressure in hPa |
| `zigbee_device_illuminance` | Ambient light in lux |
| `zigbee_device_pm25` | PM2.5 in µg/m³ |
| `zigbee_device_voc_index` | VOC index |
| `zigbee_device_air_quality` | Air quality ordinal (6=excellent, 0=unknown) |

#### Sensors & detection

| Metric | Description |
|---|---|
| `zigbee_device_occupancy` | Occupancy (1 = occupied, 0 = vacant) |
| `zigbee_device_contact` | Contact (1 = closed, 0 = open) |
| `zigbee_device_water_leak` | Water leak (1 = leak, 0 = dry) |

#### Power monitoring

| Metric | Description |
|---|---|
| `zigbee_device_power` | Instantaneous power draw in watts |
| `zigbee_device_energy` | Cumulative energy in kWh |
| `zigbee_device_voltage` | Voltage in volts |
| `zigbee_device_current` | Current in amperes |
| `zigbee_device_power_outage_count` | Power outage count |

#### Battery & health

| Metric | Description |
|---|---|
| `zigbee_device_battery` | Battery level % |
| `zigbee_device_battery_low` | Battery low warning (1 = low) |
| `zigbee_device_internal_temperature` | Device internal temperature in °C |
| `zigbee_device_device_age` | Device uptime in minutes |
| `zigbee_device_linkquality` | Zigbee link quality (LQI) |

#### Air purifier

| Metric | Description |
|---|---|
| `zigbee_device_fan_state` | Fan state (1 = ON, 0 = OFF) |
| `zigbee_device_fan_speed` | Fan speed level |
| `zigbee_device_filter_age` | Filter age in minutes |
| `zigbee_device_replace_filter` | Filter needs replacement (1 = true) |
| `zigbee_device_child_lock` | Child lock (1 = LOCK) |
| `zigbee_device_led_enable` | LED enable (1 = enabled) |

#### Misc

| Metric | Description |
|---|---|
| `zigbee_device_trigger_count` | Device trigger count |

---

## Dynamic device tracking

The service subscribes to device registry events and reacts in real time:

- **Device joins** — info gauge and all applicable state gauges are populated immediately.
- **Device leaves** — all gauge entries for that device are removed.
- **State changes** — gauges are updated with each Zigbee state report.

At shutdown, all device subscriptions and gauge entries are cleaned up.

---

## Scraping with Prometheus

Add a scrape job to your `prometheus.yml`:

```yaml
scrape_configs:
  - job_name: "ts-home-automation"
    scrape_interval: 15s
    static_configs:
      - targets: ["localhost:8080"]
    metrics_path: "/metrics"
```

---

## Without device registry

When `DEVICE_REGISTRY_ENABLED=false`, the service logs an info message and starts with **only** process/default metrics. No `zigbee_*` gauges are populated. This mode is useful for monitoring the engine's own health without any Zigbee hardware.
