## ADDED Requirements

### Requirement: Automation Execution Counters

The metrics service MUST export monotonic per-automation counters for automation
executions and for automation failures, labelled by automation name.

These counters are complementary to the bounded in-memory execution history
described by the `automation-observability` capability: the history answers what
recently happened, the counters survive as a monotonic series suitable for
alerting on sustained failure.

Counters MUST be derived from the same execution recording path as the history,
so the two cannot disagree.

An automation that has not executed MUST either be absent from the counters or
report zero; it MUST NOT report a spurious value.

Label cardinality is bounded by the number of registered automations. The
service MUST NOT introduce labels derived from trigger payloads, device names,
or state values.

#### Scenario: A successful execution increments the execution counter

- **WHEN** an automation executes successfully
- **THEN** its execution counter increases by one and its failure counter is
  unchanged

#### Scenario: A failed execution increments both counters

- **WHEN** an automation's execution raises an error
- **THEN** both its execution counter and its failure counter increase by one

#### Scenario: Counters are labelled per automation

- **WHEN** two different automations execute
- **THEN** the metrics output reports their counts under distinct automation
  labels

#### Scenario: Counters survive history eviction

- **WHEN** an automation executes more times than the in-memory history retains
- **THEN** its counters reflect every execution, not only the retained ones

#### Scenario: No unbounded labels are introduced

- **WHEN** automations execute with varying trigger payloads and device names
- **THEN** no metric label is derived from those values
