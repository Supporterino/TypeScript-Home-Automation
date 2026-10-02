## Purpose

Cross-device energy awareness: it aggregates the instantaneous power and
cumulative consumption a home's devices report, keeps a bounded recent history,
and exposes both to clients so the dashboard can show what the home is drawing
and what it has used.

## ADDED Requirements

### Requirement: Power And Energy Telemetry Aggregation

The system MUST derive a home-wide energy view from the device descriptors it
already holds, without requiring a separate device-specific integration.

Instantaneous power MUST be the sum of every reachable device's declared
instantaneous-power reading, in watts. A device that does not declare a
power reading MUST be excluded from the sum rather than treated as zero.

Cumulative consumption MUST be the sum of every reachable device's declared
cumulative-energy reading, converted to a single unit. Each device's cumulative
reading MUST be attributed to that device so a per-device breakdown can be
produced.

The aggregation MUST distinguish a device that is contributing no reading
because it is unreachable from one that is contributing a genuine zero, so that
an outage does not silently reduce the home's apparent consumption.

#### Scenario: Instantaneous power is the sum of reporting devices

- **WHEN** three reachable devices report 10 W, 25 W, and 0 W
- **THEN** the home's instantaneous power is 35 W and the devices are each
  broken down individually

#### Scenario: A device without a power reading is excluded

- **WHEN** a device declares no instantaneous-power reading
- **THEN** it does not contribute to the home's power total and is not counted
  as consuming zero

#### Scenario: An unreachable device is not silently dropped

- **WHEN** a device that normally reports power becomes unreachable
- **THEN** the home's total excludes it and the response reports it as
  unavailable rather than as a zero-watt device

#### Scenario: Cumulative consumption is comparable across units

- **WHEN** two devices report cumulative energy and their declared units differ
- **THEN** both are converted to a single unit before being summed

### Requirement: Rolling Energy History

The system MUST retain a bounded, rolling history of the home's instantaneous
power total, sampled on a configurable interval, so a client can render a recent
trend rather than only a current value.

The history window and the sampling interval MUST be configurable. When the
history is disabled by configuration, the system MUST report the current totals
without a history rather than failing.

History MUST be bounded, so that a long-running engine does not grow without
limit. A sample MUST carry the time at which it was taken.

The retention model is in-memory; surviving an engine restart is explicitly out
of scope for this capability.

#### Scenario: History accumulates samples over time

- **WHEN** the engine has been running longer than several sampling intervals
- **THEN** the energy view reports a series of timestamped power samples in
  chronological order

#### Scenario: History is bounded

- **WHEN** the engine runs far longer than the configured window
- **THEN** the retained number of samples does not exceed the window divided by
  the interval

#### Scenario: Disabled history still reports totals

- **WHEN** history is disabled by configuration
- **THEN** the current power and cumulative totals are still reported and the
  series is empty

### Requirement: Energy Endpoint Contract

The aggregated energy view MUST be readable by an authenticated client as a
single response containing the current instantaneous power, the cumulative
consumption total, the per-device breakdown, the availability of each
contributing device, and the rolling history when enabled.

The response MUST remain useful on a deployment where no device reports energy
at all, reporting zeroes and an empty breakdown rather than an error.

#### Scenario: A deployment with no metering devices still responds

- **WHEN** no device declares any power or energy reading
- **THEN** the endpoint responds successfully with zero totals and an empty
  breakdown

#### Scenario: The breakdown attributes consumption to devices

- **WHEN** several devices report cumulative energy
- **THEN** the response identifies each device and its share of the total
