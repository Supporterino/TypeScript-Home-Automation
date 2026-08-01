## Why

The codebase currently only has generic `OccupancyPayload` for PIR motion/occupancy sensors and `ContactPayload` for door/window sensors. There is no type support for mmWave presence sensors (like the Aqara FP300), which report continuous presence, target distance, temperature, humidity, illuminance, and PIR detection state — distinct from simple PIR on/off occupancy. Adding this unlocks automations that react to "someone is in the room" rather than just "motion detected".

## What Changes

- Add a new **generic presence sensor payload** (`PresencePayload`) to `src/types/zigbee/common.ts`, covering mmWave presence sensors from any brand — with `presence` boolean and optional `target_distance`, `illuminance`, `temperature`, `humidity`, `battery`, `voltage`, and `linkquality`.
- Add a **brand-specific Aqara presence sensor payload** (`AqaraPresencePayload`) to `src/types/zigbee/aqara.ts`, extending the generic payload with FP300-specific fields (PIR detection, presence detection mode, AI features, detection range zones, and power outage count).
- Add a **presence sensor set command** type (`PresenceSetCommand`) for configurable presence sensor parameters.
- Re-export all new types from `src/types/zigbee/index.ts`.
- Update `src/index.ts` to export the new public types.
- Expose `presence`, `target_distance`, and `pir_detection` as Prometheus metrics in `PrometheusMetricsService` (the service currently only checks `occupancy`, silently dropping fp300's primary signal).

## Capabilities

### New Capabilities

- `presence-sensor-types`: Zigbee2MQTT type definitions for mmWave presence sensors — a generic cross-brand `PresencePayload` and `PresenceSetCommand`, plus an Aqara-specific `AqaraPresencePayload` for the FP300 device.
- `presence-sensor-metrics`: Prometheus gauge metrics for presence sensor state — `zigbee_device_presence`, `zigbee_device_target_distance`, and `zigbee_device_pir_detection`.

### Modified Capabilities

- `prometheus-metrics`: The `PrometheusMetricsService` gains three new gauges to track mmWave presence sensor state alongside the existing occupancy gauge.

## Impact

- **Affected code**: `src/types/zigbee/common.ts`, `src/types/zigbee/aqara.ts`, `src/types/zigbee/index.ts`, `src/index.ts`, `src/core/services/prometheus-metrics-service.ts`
- **No breaking changes**: purely additive type definitions and new gauges — existing `zigbee_device_occupancy` is unchanged
- **No new dependencies**: depends only on existing Zigbee bridge primitives and prom-client
