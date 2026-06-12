# Presence Sensor Metrics

## Purpose

Exposes Prometheus gauges for mmWave presence sensor state (presence, target distance, PIR detection) via the existing `PrometheusMetricsService`. These gauges are separate from the existing occupancy gauge to differentiate mmWave presence from PIR-based motion detection.

## Requirements

### Presence sensor Prometheus gauge

The system SHALL expose a `zigbee_device_presence` gauge in `PrometheusMetricsService` that reflects the `presence` field of any device state, with value 1 when presence is detected and 0 when vacant.

#### Scenario: Presence detected
- **WHEN** a device reports state with `presence: true`
- **THEN** `zigbee_device_presence{device="<friendly_name>"}` SHALL be 1

#### Scenario: Presence cleared
- **WHEN** a device reports state with `presence: false`
- **THEN** `zigbee_device_presence{device="<friendly_name>"}` SHALL be 0

#### Scenario: No presence field in state
- **WHEN** a device reports state without a `presence` key
- **THEN** `zigbee_device_presence` SHALL NOT be set for that device (no default value)

### Target distance Prometheus gauge

The system SHALL expose a `zigbee_device_target_distance` gauge in `PrometheusMetricsService` that reflects the `target_distance` field (in meters) of any device state.

#### Scenario: Target distance reported
- **WHEN** a device reports state with `target_distance: 2.87`
- **THEN** `zigbee_device_target_distance{device="<friendly_name>"}` SHALL be 2.87

#### Scenario: No target distance in state
- **WHEN** a device reports state without a `target_distance` key
- **THEN** `zigbee_device_target_distance` SHALL NOT be set for that device

### PIR detection Prometheus gauge

The system SHALL expose a `zigbee_device_pir_detection` gauge in `PrometheusMetricsService` that reflects the `pir_detection` field of any device state, with value 1 when PIR motion is detected and 0 when none.

#### Scenario: PIR motion detected
- **WHEN** a device reports state with `pir_detection: true`
- **THEN** `zigbee_device_pir_detection{device="<friendly_name>"}` SHALL be 1

#### Scenario: No PIR motion
- **WHEN** a device reports state with `pir_detection: false`
- **THEN** `zigbee_device_pir_detection{device="<friendly_name>"}` SHALL be 0

### Gauge lifecycle management

The system SHALL register the new presence gauges in `allSingleLabelGauges` so they are properly cleaned up on device removal and service stop.

#### Scenario: Device removed
- **WHEN** a presence sensor device is removed from the registry
- **THEN** all three presence-related gauges (`zigbee_device_presence`, `zigbee_device_target_distance`, `zigbee_device_pir_detection`) SHALL be deregistered for that device

#### Scenario: Service stopped
- **WHEN** `PrometheusMetricsService.onStop()` is called
- **THEN** all presence-related gauge entries SHALL be cleaned up

### Existing occupancy gauge unchanged

The existing `zigbee_device_occupancy` gauge SHALL continue to function exactly as before — presence sensors use a separate gauge and do not affect the occupancy metric.

#### Scenario: Occupancy sensor unaffected
- **WHEN** a PIR motion sensor reports `occupancy: true`
- **THEN** `zigbee_device_occupancy{device="<friendly_name>"}` SHALL be 1, and `zigbee_device_presence` SHALL NOT be set for that device
