## 1. Add generic presence sensor types to common.ts

- [x] 1.1 Add `PresencePayload` interface with `presence` (boolean, required), `target_distance` (number, optional), `illuminance` (number, optional), `temperature` (number, optional), `humidity` (number, optional), `battery` (number, optional), `voltage` (number, optional), and `linkquality` (number, optional) — following the pattern of `OccupancyPayload`
- [x] 1.2 Add `PresenceSetCommand` interface with `motion_sensitivity` (`"low" | "medium" | "high"`, optional)

## 2. Add Aqara-specific presence types to aqara.ts

- [x] 2.1 Import `PresencePayload`, `PresenceSetCommand` from `./common.js`
- [x] 2.2 Add `AqaraPresencePayload` extending `PresencePayload` with `pir_detection` (boolean, optional), `presence_detection_options` (`"both" | "mmwave" | "pir"`, optional), `motion_sensitivity` (`"low" | "medium" | "high"`, optional), `ai_interference_source_selfidentification` (`"ON" | "OFF"`, optional), `ai_sensitivity_adaptive` (`"ON" | "OFF"`, optional), `absence_delay_timer` (number, optional), `pir_detection_interval` (number, optional), `detection_range` (number, optional), `detection_range_composite` (`Record<string, boolean>`, optional), and `power_outage_count` (number, optional)
- [x] 2.3 Add `AqaraPresenceSetCommand` extending `PresenceSetCommand` with `presence_detection_options` (`"both" | "mmwave" | "pir"`, optional), `ai_interference_source_selfidentification` (`"ON" | "OFF"`, optional), `ai_sensitivity_adaptive` (`"ON" | "OFF"`, optional), `absence_delay_timer` (number, optional), `pir_detection_interval` (number, optional), `detection_range` (number, optional), `detection_range_composite` (`Record<string, boolean>`, optional), `spatial_learning` (`"Start Learning"`, optional), `restart_device` (`"Restart Device"`, optional), `identify` (`"identify"`, optional), and `track_target_distance` (`"start_tracking_distance"`, optional)

## 3. Update barrel exports

- [x] 3.1 Re-export `PresencePayload`, `PresenceSetCommand` from `src/types/zigbee/index.ts` in the common section (alphabetical order)
- [x] 3.2 Re-export `AqaraPresencePayload`, `AqaraPresenceSetCommand` from `src/types/zigbee/index.ts` in the Aqara section (alphabetical order)
- [x] 3.3 Re-export `PresencePayload`, `PresenceSetCommand`, `AqaraPresencePayload`, `AqaraPresenceSetCommand` from `src/index.ts` in the Zigbee2MQTT types section (alphabetical order)

## 4. Add presence sensor metrics to PrometheusMetricsService

- [x] 4.1 Add `presenceGauge` (`zigbee_device_presence`, "Presence sensor state (1 = presence detected, 0 = vacant)"), `targetDistanceGauge` (`zigbee_device_target_distance`, "Distance to detected target in meters"), and `pirDetectionGauge` (`zigbee_device_pir_detection`, "PIR motion detection state (1 = motion detected, 0 = none)") as private fields
- [x] 4.2 Initialize the three new gauges in the constructor (after the existing occupancy gauge at line 178)
- [x] 4.3 Add the three new gauges to `allSingleLabelGauges` for cleanup (after line 261)
- [x] 4.4 In `handleDeviceState`, add `setBoolFrom(state, labels, "presence", this.presenceGauge)`, `setNumeric(state, labels, "target_distance", this.targetDistanceGauge)`, and `setBoolFrom(state, labels, "pir_detection", this.pirDetectionGauge)` — after the existing occupancy check (line 429)

## 5. Verify

- [x] 5.1 Run `bun run typecheck` to verify no type errors
- [x] 5.2 Run `bun run check` to verify formatting and linting pass
