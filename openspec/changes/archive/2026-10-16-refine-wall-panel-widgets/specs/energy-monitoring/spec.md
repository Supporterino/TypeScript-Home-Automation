## MODIFIED Requirements

### Requirement: Energy Endpoint Contract

The aggregated energy view MUST be readable by an authenticated client as a
single response containing the current instantaneous power, the cumulative
consumption total, the home's usage over a rolling window together with that
window's length and coverage, the per-device breakdown, the availability of each
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

#### Scenario: The rolling-window usage is reported with its coverage

- **WHEN** the endpoint responds on a deployment whose devices report cumulative
  energy
- **THEN** the response carries the home's usage over the rolling window, that
  window's length, and the extent to which the window has been covered

## ADDED Requirements

### Requirement: Rolling-Window Usage

The system MUST derive the home's usage over a rolling window from the
cumulative-energy readings the reachable devices report, and MUST expose that
usage together with the window's length and its coverage. Coverage MUST be
reported so a client can distinguish a full window from a partial one, and the
system MUST NOT report a full-window figure or a false zero for a window it has
not covered. A device that is not contributing — because it is unreachable or
declares no cumulative reading — MUST be excluded rather than counted as having
consumed nothing.

#### Scenario: A full window's usage is the cumulative change

- **WHEN** the retained samples cover the whole rolling window
- **THEN** the reported usage is the change in the home's cumulative energy over
  that window, reported with the window's length and a coverage equal to the
  window

#### Scenario: A partial window is distinguishable

- **WHEN** the retained samples cover less than the whole rolling window
- **THEN** the usage is reported with a coverage below the window's length, so a
  client can tell it is partial

#### Scenario: An uncovered window is absent, not zero

- **WHEN** no retained sample precedes the covered window
- **THEN** the usage is reported as absent rather than as a zero or a
  full-window figure

#### Scenario: A non-contributing device is excluded

- **WHEN** a device that reports cumulative energy becomes unreachable
- **THEN** its consumption is not folded into the window's usage as a zero
