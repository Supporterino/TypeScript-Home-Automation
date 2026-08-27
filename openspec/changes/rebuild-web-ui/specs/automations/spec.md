## ADDED Requirements

### Requirement: Automation Source Path Retention

Discovery MUST retain, for each successfully registered automation, the resolved
path of the file it was imported from, associated with the automation's name.

Because automation names are already required to be unique, the name is a valid
key for this association. The retained path MUST remain available for the
lifetime of the engine, including after the automation has been stopped.

Files that are skipped during discovery — because they export no valid
automation — MUST NOT contribute an entry.

#### Scenario: Path is retained after registration

- **WHEN** an automation is discovered and registered from a file
- **THEN** the path of that file is retrievable by the automation's name

#### Scenario: Path survives being stopped

- **WHEN** a registered automation is stopped
- **THEN** its retained path is still retrievable, so it can be restarted from
  the same file

#### Scenario: Skipped file contributes nothing

- **WHEN** a file in the automations directory exports no valid automation
- **THEN** no path entry is retained for it

### Requirement: Reusable Trigger Unwiring

The manager MUST provide a single reusable routine that releases every trigger
registration for one automation: MQTT subscriptions, cron jobs, state change
listeners, webhook routes, and device joined, left, and state listeners.

The same routine MUST be used by registration rollback on `onStart()` failure,
by full shutdown, and by stopping a single automation, so that no path can
release a different subset of resources than another.

Unwiring one automation MUST NOT disturb another. Where a resource is shared —
notably an MQTT topic subscribed by more than one automation — the shared
resource MUST remain active for the remaining subscribers.

#### Scenario: Every trigger type is released

- **WHEN** an automation declaring every trigger type is unwired
- **THEN** its MQTT subscriptions, cron jobs, state listeners, webhook route,
  and device listeners are all removed

#### Scenario: Shared MQTT topic survives

- **WHEN** two automations subscribe to the same MQTT topic and one is unwired
- **THEN** the other continues to receive messages on that topic

#### Scenario: Rollback and shutdown behave identically

- **WHEN** an automation is released by registration rollback, and separately by
  shutdown
- **THEN** the same set of resources is released in both cases

### Requirement: Per-Automation Stop and Restart

The manager MUST support stopping a single registered automation without
affecting others: unwiring its triggers, invoking its `onStop()` hook, and
recording that it is no longer active. An error thrown from `onStop()` MUST be
logged and MUST NOT prevent the stop from completing.

The manager MUST support starting a previously stopped automation again by
loading a fresh instance from its retained source path, rather than reusing the
stopped instance. Trigger wiring MUST follow the automation's declared trigger
order, required services MUST be validated, and `onStart()` MUST be invoked, on
the same terms as initial registration.

If starting fails at any point, the existing rollback behaviour MUST apply:
partially wired triggers are unwound, `onStop()` is invoked best-effort, and the
automation is left stopped rather than half-registered.

Re-registering an automation under a name that is currently stopped MUST NOT be
treated as a duplicate-name conflict.

#### Scenario: Stopping one leaves the rest running

- **WHEN** one of several registered automations is stopped
- **THEN** the others continue to receive and handle their triggers

#### Scenario: Restart produces a fresh instance

- **WHEN** a stopped automation is started again
- **THEN** a new instance is constructed from its source file and no state from
  the previous instance persists

#### Scenario: Trigger order is preserved on restart

- **WHEN** an automation declaring several triggers is stopped and started again
- **THEN** its triggers are wired in the same declared order as at initial
  registration

#### Scenario: Failed restart leaves it stopped

- **WHEN** starting a stopped automation fails because `onStart()` throws
- **THEN** partially wired triggers are unwound, the error is reported, and the
  automation remains stopped

#### Scenario: Stopped name is not a duplicate

- **WHEN** an automation is stopped and then started again under the same name
- **THEN** no duplicate-name error is raised

### Requirement: Webhook Path Ownership

Because webhook routes are keyed by path with no ownership record, stopping an
automation frees its path for another to claim. When starting an automation
whose declared webhook path is already registered by a different automation, the
system MUST fail with a descriptive error rather than silently replacing the
existing route.

#### Scenario: Conflicting webhook path fails loudly

- **WHEN** an automation is started whose webhook path is already claimed by
  another automation
- **THEN** starting fails with a descriptive error naming the conflict, and the
  existing route is left intact

### Requirement: Automation Enabled State Awareness

The manager MUST consult the persisted enabled state during discovery. An
automation recorded as disabled MUST be discovered and known to the query API,
but MUST NOT have its triggers wired and MUST NOT have `onStart()` invoked.

The query API MUST report each automation's enabled state alongside its trigger
summaries.

#### Scenario: Disabled automation is discovered but inert

- **WHEN** the engine starts and an automation is recorded as disabled
- **THEN** it appears in the query API marked disabled, its triggers are not
  wired, and `onStart()` is not invoked

#### Scenario: Query API reports enabled state

- **WHEN** the automation list is queried
- **THEN** each entry reports whether it is enabled
