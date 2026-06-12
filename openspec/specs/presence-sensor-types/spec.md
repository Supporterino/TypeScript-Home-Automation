# Presence Sensor Types

## Purpose

Defines TypeScript interfaces for mmWave presence sensor state payloads and configuration set commands. Provides a generic `PresencePayload` covering common presence sensor fields, and an Aqara-specific `AqaraPresencePayload` for FP300 features including PIR detection, zone-based ranges, and AI configuration.

## Requirements

### Generic presence sensor payload

The system SHALL provide a `PresencePayload` interface in `src/types/zigbee/common.ts` that represents the state of any mmWave presence sensor, with `presence` as the required boolean field and optional `target_distance`, `illuminance`, `temperature`, `humidity`, `battery`, `voltage`, and `linkquality` fields.

#### Scenario: Presence detected
- **WHEN** a presence sensor reports presence via MQTT
- **THEN** the payload SHALL be assignable to `PresencePayload` with `presence: true`

#### Scenario: Presence cleared
- **WHEN** a presence sensor reports no presence via MQTT
- **THEN** the payload SHALL be assignable to `PresencePayload` with `presence: false`

#### Scenario: Presence with distance
- **WHEN** a presence sensor reports presence with `target_distance: 2.5`
- **THEN** the payload SHALL be assignable to `PresencePayload` with both `presence: true` and `target_distance: 2.5`

#### Scenario: Presence with environmental data
- **WHEN** a presence sensor reports presence with `temperature: 22.15`, `humidity: 62.01`, and `illuminance: 1`
- **THEN** the payload SHALL be assignable to `PresencePayload` with `presence: true`, `temperature: 22.15`, `humidity: 62.01`, and `illuminance: 1`

#### Scenario: Presence with battery and link quality
- **WHEN** a presence sensor reports with `battery: 85`, `voltage: 2900`, and `linkquality: 54`
- **THEN** the payload SHALL be assignable to `PresencePayload` with optional diagnostic fields populated

### Generic presence sensor set command

The system SHALL provide a `PresenceSetCommand` interface in `src/types/zigbee/common.ts` for configuring presence sensor sensitivity.

#### Scenario: Set motion sensitivity
- **WHEN** constructing a set command for a presence sensor
- **THEN** the command SHALL accept an optional `motion_sensitivity` field of type `"low" | "medium" | "high"`

### Aqara-specific presence sensor payload

The system SHALL provide an `AqaraPresencePayload` interface in `src/types/zigbee/aqara.ts` that extends `PresencePayload` with Aqara FP300-specific fields including PIR detection state, presence detection options, AI features, and zone-based detection range.

#### Scenario: Aqara presence with PIR detection
- **WHEN** the Aqara FP300 reports presence with `pir_detection: true`
- **THEN** the payload SHALL be assignable to `AqaraPresencePayload` with `presence: true` and `pir_detection: true`

#### Scenario: Aqara presence detection mode
- **WHEN** the Aqara FP300 is configured with `presence_detection_options: "both"`
- **THEN** the payload SHALL be assignable to `AqaraPresencePayload` with `presence_detection_options: "both"`

#### Scenario: Aqara AI interference self-identification
- **WHEN** the Aqara FP300 has AI interference source self-identification enabled
- **THEN** the payload SHALL be assignable to `AqaraPresencePayload` with `ai_interference_source_selfidentification: "ON"`

#### Scenario: Aqara detection range composite
- **WHEN** the Aqara FP300 reports zone-based detection with `detection_range_composite: { "detection_range_0": true, "detection_range_5": true }`
- **THEN** the payload SHALL be assignable to `AqaraPresencePayload` with those zone booleans

### Aqara-specific presence sensor set command

The system SHALL provide an `AqaraPresenceSetCommand` interface in `src/types/zigbee/aqara.ts` that extends `PresenceSetCommand` with FP300-specific writable configuration and write-only commands.

#### Scenario: Configure Aqara presence detection options
- **WHEN** constructing a set command for an Aqara FP300
- **THEN** the command SHALL accept an optional `presence_detection_options` field of type `"both" | "mmwave" | "pir"`

#### Scenario: Configure Aqara AI features
- **WHEN** constructing a set command for an Aqara FP300
- **THEN** the command SHALL accept optional `ai_interference_source_selfidentification` and `ai_sensitivity_adaptive` fields of type `"ON" | "OFF"`

#### Scenario: Configure Aqara detection range
- **WHEN** constructing a set command for an Aqara FP300
- **THEN** the command SHALL accept an optional `detection_range` of type `number` and `detection_range_composite` of type `Record<string, boolean>`

#### Scenario: Aqara write-only commands
- **WHEN** constructing a set command for an Aqara FP300
- **THEN** the command SHALL accept optional write-only fields `spatial_learning` (`"Start Learning"`), `restart_device` (`"Restart Device"`), `identify` (`"identify"`), and `track_target_distance` (`"start_tracking_distance"`)

### Re-exports from type index

The system SHALL re-export `PresencePayload`, `PresenceSetCommand`, `AqaraPresencePayload`, and `AqaraPresenceSetCommand` from `src/types/zigbee/index.ts` and `src/index.ts`.

#### Scenario: Type import from barrel
- **WHEN** an automation imports from the zigbee types barrel
- **THEN** `PresencePayload` and `AqaraPresencePayload` SHALL be importable from `../../types/zigbee/index.js`
