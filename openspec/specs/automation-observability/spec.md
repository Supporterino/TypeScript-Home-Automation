# Automation Observability Specification

## Purpose

Attribution of automation activity — what ran, when, for how long, whether it
succeeded, and which state it touched — so that an operator can see what an
automation actually does at runtime rather than inferring it from its source.

## Requirements

### Requirement: Automation Execution Context

The system MUST establish an execution context around every automation run, such
that work performed during that run can be attributed to the automation that
caused it.

The context MUST survive asynchronous suspension: an automation that awaits and
then performs work MUST still have that later work attributed to it.

Concurrent runs of different automations MUST NOT observe each other's context.
Work performed outside any automation run MUST NOT be attributed to an
automation.

The context MUST NOT alter the observable behaviour of an automation, and MUST
NOT require automation authors to change how they write automations.

#### Scenario: Work after an await is still attributed

- **WHEN** an automation awaits a service call and then writes state
- **THEN** the write is attributed to that automation

#### Scenario: Concurrent runs do not cross-attribute

- **WHEN** two automations run concurrently and both write state
- **THEN** each write is attributed to the automation that performed it

#### Scenario: Non-automation work is unattributed

- **WHEN** state is written by an API request rather than by an automation
- **THEN** the write is not attributed to any automation

#### Scenario: Existing automations are unaffected

- **WHEN** an existing automation runs with the context in place
- **THEN** its behaviour and output are unchanged

### Requirement: Execution History

The system MUST retain a bounded, in-memory history of recent executions for
each automation. Each record MUST include when the run started, what triggered
it, how long it took, and whether it completed successfully or raised an error,
including the error message when it failed.

Retention MUST be a small fixed number of records per automation, with the
oldest discarded first. History MUST NOT be persisted and is expected to be lost
on restart.

An automation that has not run MUST report an empty history rather than an
error.

Recording an execution MUST NOT fail an automation run: an error while recording
MUST be logged and swallowed.

#### Scenario: A successful run is recorded

- **WHEN** an automation executes successfully
- **THEN** a record is retained with its start time, trigger, duration, and
  success outcome

#### Scenario: A failed run is recorded with its error

- **WHEN** an automation's `execute()` throws
- **THEN** a record is retained marking it failed and carrying the error message

#### Scenario: History is bounded

- **WHEN** an automation runs more times than the retention limit
- **THEN** only the most recent records are retained, oldest discarded first

#### Scenario: Never-run automation has empty history

- **WHEN** history is read for an automation that has not executed
- **THEN** an empty history is returned

#### Scenario: Recording failure does not fail the run

- **WHEN** recording an execution fails
- **THEN** the error is logged and the automation run is unaffected

### Requirement: Observed State Writes

State writes performed during an automation run MUST be attributed to that
automation, and the set of state keys an automation has been observed writing
MUST be readable per automation.

Observed writes MUST be presented as observations accumulated since startup, not
as a complete description of what the automation can write. A consumer MUST be
able to distinguish observed relationships from declared ones.

The number of distinct keys retained per automation MUST be bounded by a small
fixed maximum, evicting the least recently written first. State keys are
frequently composed at runtime — from a device name, a timestamp, or a payload
field — so an unbounded set grows for as long as the process runs, in memory, on
the automation execution path, to populate a display panel. The bound mirrors the
one already required of execution history rather than introducing a second
retention policy.

When the retained set has been truncated, that MUST be evident to a consumer, so
a truncated list is not read as the automation's complete observed behaviour.
This compounds with the accumulated-since-startup framing above: an observed
write list may be incomplete both because the automation has not yet run and
because older keys have been evicted, and MUST NOT be presented as authoritative
in either case.

#### Scenario: A write is recorded against its automation

- **WHEN** an automation sets a state key during a run
- **THEN** that key appears in the automation's observed writes

#### Scenario: Observed writes accumulate

- **WHEN** an automation writes different keys across several runs
- **THEN** all of those keys appear in its observed writes

#### Scenario: Observed writes are bounded

- **WHEN** an automation writes more distinct keys than the retention limit
- **THEN** the retained set does not exceed the limit and the least recently
  written keys are evicted first

#### Scenario: Truncation is evident

- **WHEN** an automation's observed writes have been truncated
- **THEN** the reported set indicates that it is incomplete rather than
  presenting as the full set of keys the automation has written

#### Scenario: Never-run automation shows no observed writes

- **WHEN** observed writes are read for an automation that has not executed
- **THEN** an empty set is returned, distinguishable from "writes nothing"

### Requirement: Declared Relationships

The system MUST expose, for each automation, the relationships that can be
derived from its declarations without executing it:

- the services it declares as required, and whether each is currently registered
- the devices its triggers reference, derived from device and MQTT triggers
- the state keys its triggers watch, derived from state triggers

These MUST be reported as complete, in contrast to observed relationships which
are reported as partial.

#### Scenario: Required services report their availability

- **WHEN** an automation declaring required services is read
- **THEN** each declared service is listed with whether it is currently
  registered

#### Scenario: Referenced devices are derived from triggers

- **WHEN** an automation declares device or MQTT triggers naming devices
- **THEN** those devices are reported as related to the automation

#### Scenario: Watched state keys are derived from triggers

- **WHEN** an automation declares state triggers
- **THEN** the watched keys are reported, separately from observed writes

#### Scenario: Declared relationships need no execution

- **WHEN** relationships are read for an automation that has never run
- **THEN** its required services, referenced devices, and watched state keys are
  still reported in full

### Requirement: Execution Overhead

The execution context and history recording MUST NOT measurably degrade
automation execution. Attribution MUST be correct under concurrent execution;
incorrect attribution is worse than no attribution.

#### Scenario: Overhead is not measurable

- **WHEN** an automation is executed repeatedly with the context in place
- **THEN** execution time is not measurably worse than without it

#### Scenario: Overlapping runs attribute correctly

- **WHEN** the same automation is triggered again while a previous run is still
  in flight
- **THEN** both runs are recorded and their writes are attributed to that
  automation without loss or duplication
</content>
