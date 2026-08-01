## MODIFIED Requirements

### WindowCovering Support

The system MUST support Shelly 2PM covers as HAP `WindowCovering` accessories.
State translation MUST be:

- `current_pos` (0–100) → `CurrentPosition` (0 = closed, 100 = open)
- `state: "opening"` → `PositionState` INCREASING
- `state: "closing"` → `PositionState` DECREASING
- `state: "open" | "closed" | "stopped"` → `PositionState` STOPPED
- `TargetPosition` write → `ShellyService.coverGoToPosition(name, position)`

The accessory MUST keep the HAP `TargetPosition` characteristic truthful so
HomeKit controllers do not wedge the tile in a perpetual "Opening"/"Closing"
state:

- When the cover is **idle** (`state` is `"open"`, `"closed"`, or `"stopped"`),
  `TargetPosition` MUST be set to the same value as `CurrentPosition`.
- When the cover is **moving** (`state` is `"opening"` or `"closing"`),
  `TargetPosition` MUST be set to the Shelly `target_pos` when present, falling
  back to `CurrentPosition` when `target_pos` is absent.

The `WindowCovering` service MUST be created with initialized characteristic
values (`CurrentPosition` = 0, `TargetPosition` = 0, `PositionState` = STOPPED)
so the first controller read is never `undefined`.

When a cover reports `current_pos: null` (uncalibrated), the system MUST report
`CurrentPosition` as 0, log a warning suggesting calibration, and still expose
the accessory.

#### Scenario: Cover position reflected in HomeKit

- **WHEN** `Cover.GetStatus` reports `current_pos: 40, state: "stopped"`
- **THEN** `CurrentPosition` is 40, `PositionState` is STOPPED, and
  `TargetPosition` is also 40

#### Scenario: Moving cover reports direction

- **WHEN** `Cover.GetStatus` reports `state: "opening"`
- **THEN** `PositionState` is INCREASING

#### Scenario: Moving cover publishes its target position

- **WHEN** `Cover.GetStatus` reports `state: "closing", target_pos: 20`
- **THEN** `PositionState` is DECREASING and `TargetPosition` is 20

#### Scenario: Idle cover settles its target position

- **WHEN** `Cover.GetStatus` reports `current_pos: 75, state: "open"`
- **THEN** `TargetPosition` equals `CurrentPosition` (75) and `PositionState` is
  STOPPED

#### Scenario: Initial characteristic values are seeded

- **WHEN** a cover accessory is created but no status has been polled yet
- **THEN** `CurrentPosition`, `TargetPosition`, and `PositionState` read as 0, 0,
  and STOPPED respectively

#### Scenario: Uncalibrated cover falls back to zero

- **WHEN** `Cover.GetStatus` reports `current_pos: null`
- **THEN** `CurrentPosition` is reported as 0 and a calibration warning is logged
