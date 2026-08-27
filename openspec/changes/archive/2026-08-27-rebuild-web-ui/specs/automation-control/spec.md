## Purpose

Runtime management of individual automations — disabling one so that it fully
stops acting on the house, re-enabling it with a fresh instance, and reading the
source of the file it was loaded from — so an operator can intervene without
editing files and restarting the engine.

## ADDED Requirements

### Requirement: Automation Enabled State

Every registered automation MUST have an enabled state, defaulting to enabled.
The system MUST expose the current enabled state of each automation and MUST
allow it to be changed at runtime for a single automation without affecting any
other automation.

Requesting a state change to the state an automation is already in MUST succeed
without side effects.

#### Scenario: Automations default to enabled

- **WHEN** an automation is discovered and registered at startup with no stored
  preference
- **THEN** it is enabled and its triggers are active

#### Scenario: Disabling one automation leaves others running

- **WHEN** one automation is disabled
- **THEN** every other automation continues to receive and handle its triggers

#### Scenario: Redundant state change is a no-op

- **WHEN** an already-enabled automation is enabled again
- **THEN** the request succeeds and the automation is neither stopped nor
  restarted

### Requirement: Disabling Fully Stops an Automation

Disabling an automation MUST deregister every one of its triggers — MQTT
subscriptions, cron jobs, state change listeners, webhook routes, and device
joined, left, and state listeners — and MUST then invoke the automation's
`onStop()` lifecycle hook so that any timer, interval, or listener the
automation created during `onStart()` is released.

A disabled automation MUST NOT execute for any trigger, MUST NOT run scheduled
work, and MUST NOT continue to act through resources it created while enabled.

Errors thrown from `onStop()` MUST be logged and MUST NOT prevent the automation
from being marked disabled.

#### Scenario: Triggers stop firing

- **WHEN** an automation with an MQTT trigger is disabled and a matching message
  arrives
- **THEN** the automation does not execute

#### Scenario: Scheduled work stops

- **WHEN** an automation with a cron trigger is disabled
- **THEN** its scheduled job no longer runs, rather than running and being
  ignored

#### Scenario: Internal timers are released

- **WHEN** an automation that started a repeating timer in `onStart()` is
  disabled
- **THEN** `onStop()` is invoked and the timer stops firing

#### Scenario: Webhook path is released

- **WHEN** an automation with a webhook trigger is disabled
- **THEN** requests to its webhook path are no longer routed to it

#### Scenario: Shared MQTT topic survives

- **WHEN** two automations subscribe to the same MQTT topic and one is disabled
- **THEN** the remaining automation continues to receive messages on that topic

#### Scenario: onStop failure still disables

- **WHEN** a disabled automation's `onStop()` throws
- **THEN** the error is logged and the automation is still recorded as disabled
  with its triggers deregistered

### Requirement: Disabling Also Blocks Manual Execution

A disabled automation MUST NOT execute on demand. A request to run one manually
MUST be refused with a conflict error naming the automation's disabled state,
and the automation's `execute()` MUST NOT be called.

Disabling deregisters every trigger and runs `onStop()`, and enabling constructs
a fresh instance, so a disabled automation has no wired triggers and no live
instance to run. Executing one on request would act on the house through an
automation the system reports as off — the same disagreement between a control
and its wiring that disabling exists to prevent, reached through the manual path
rather than through a guard flag.

Refusal MUST be distinguishable from the automation not existing, so an operator
can tell "this is switched off" from "this is gone".

A client offering both an enable control and a manual run control MUST NOT
present the run control as available while the automation is disabled.

#### Scenario: Manual run of a disabled automation is refused

- **WHEN** a disabled automation is manually triggered
- **THEN** the request is refused with a conflict error and the automation does
  not execute

#### Scenario: Refusal is distinct from absence

- **WHEN** a disabled automation and an unregistered name are each manually
  triggered
- **THEN** the disabled automation reports a conflict and the unregistered name
  reports not found

#### Scenario: Re-enabling restores manual execution

- **WHEN** a disabled automation is enabled and then manually triggered
- **THEN** it executes normally

### Requirement: Enabling Restores a Fresh Instance

Enabling a previously disabled automation MUST construct a fresh instance from
the automation's source file rather than reusing the stopped instance, so that
no state, timer, or accumulated context from the previous run survives.

The re-registration MUST wire triggers in the same declared order as the initial
registration, MUST validate required services, and MUST invoke `onStart()`.

If enabling fails — because required services are unavailable, because the
source file no longer provides a valid automation, or because `onStart()` throws
— the system MUST unwind any partially wired triggers, MUST report a descriptive
error, and MUST leave the automation disabled rather than half-registered.

#### Scenario: Re-enabled automation starts clean

- **WHEN** an automation that accumulated internal state is disabled and then
  enabled
- **THEN** it runs with freshly initialised internal state

#### Scenario: Triggers are restored

- **WHEN** a disabled automation is enabled
- **THEN** all of its declared triggers are active again, in their declared order

#### Scenario: Failed enable leaves it disabled

- **WHEN** enabling an automation whose `onStart()` throws
- **THEN** partially wired triggers are unwound, the error is reported, and the
  automation remains disabled

#### Scenario: Conflicting webhook path fails loudly

- **WHEN** enabling an automation whose webhook path has been claimed by another
  automation while it was disabled
- **THEN** enabling fails with a descriptive error rather than silently
  overwriting the existing route

### Requirement: Enabled State Durability

The enabled state of each automation MUST be persisted and MUST be restored when
the engine next starts, so that an automation an operator disabled does not
resume acting on the house after a restart.

Persistence MUST survive an abrupt process termination, subject to the bounded
write-behind window described by the `state-management` capability.

A stored preference for an automation that no longer exists MUST be ignored
without error, and MUST then be discarded, so that a deleted automation does not
leave a preference behind permanently. Preferences live in the state store's
reserved internal namespace, which is hidden from the state listing and rejects
public writes, so a stale preference is otherwise unreachable by any operator
surface and can never be removed.

Discarding MUST be guarded, because the same observation — no automation of that
name was discovered — is produced both by a deleted file and by a discovery that
failed to see files that do exist:

- The system MUST NOT discard any preference when discovery yielded no
  automations at all. An empty scan is indistinguishable from an unreadable or
  unmounted automations directory, and treating it as "everything was deleted"
  would clear every preference and re-enable every deliberately disabled
  automation on the following start.
- Each discarded preference MUST be logged at warning level, naming the
  automation, because losing a deliberate operator decision is a change that
  needs to be discoverable later rather than silent.

The direction of the failure matters: a preference wrongly retained is invisible
cruft, while a preference wrongly discarded silently re-enables an automation and
lets it act on the house.

#### Scenario: Stale preference is discarded

- **WHEN** a stored preference names an automation whose file has been deleted,
  and other automations were discovered normally
- **THEN** startup proceeds, the preference is removed from the store, and its
  removal is logged with the automation's name

#### Scenario: An empty discovery discards nothing

- **WHEN** discovery yields no automations at all — for example because the
  automations directory is unreadable — and stored preferences exist
- **THEN** no preference is discarded, and a subsequent successful discovery
  finds every previously disabled automation still disabled

#### Scenario: Disabled automation stays disabled across restart

- **WHEN** an automation is disabled and the engine is restarted
- **THEN** the automation is discovered but its triggers are not wired and it
  reports as disabled

#### Scenario: Disabled state survives abrupt termination

- **WHEN** an automation is disabled and the process is killed without a graceful
  shutdown, after the write-behind window has elapsed
- **THEN** the automation is still disabled on next start

#### Scenario: Startup is not blocked by a stale preference

- **WHEN** a stored preference names an automation whose file has been deleted
- **THEN** startup proceeds normally and no error is raised

### Requirement: Automation Source Retention and Retrieval

The system MUST retain, for each discovered automation, the path of the file it
was loaded from, keyed by automation name.

The system MUST be able to return the current contents of that file, addressed
by automation name. A source request MUST be resolved only through the retained
mapping; a caller-supplied file path MUST never be accepted or used to locate a
file.

If the file can no longer be read, the system MUST report a descriptive error
rather than returning partial or empty content.

#### Scenario: Source is retrievable by name

- **WHEN** the source of a registered automation is requested by name
- **THEN** the current contents of the file it was loaded from are returned

#### Scenario: Unknown automation yields not found

- **WHEN** source is requested for a name that is not registered
- **THEN** the request fails with a not-found error

#### Scenario: Caller-supplied paths are not honoured

- **WHEN** a request attempts to address source by file path rather than
  automation name
- **THEN** no file is read and the request is rejected

#### Scenario: Deleted file reports an error

- **WHEN** an automation's source file has been deleted since discovery
- **THEN** the request fails with a descriptive error

### Requirement: Source Exposure Is Unauthenticated Where the Dashboard Is

Automation source is served at the same trust level as the rest of the
dashboard. Where no access token is configured, automation source MUST be
readable without authentication, consistent with every other read endpoint.

Because automation source routinely contains device names, hostnames,
notification topics, and credentials, this MUST be documented as an explicit
operator-facing consequence of running the dashboard without a token.

#### Scenario: Source is readable on an untokenised instance

- **WHEN** no access token is configured and automation source is requested
- **THEN** the source is returned, consistent with the other read endpoints

#### Scenario: Source requires the token when one is configured

- **WHEN** an access token is configured and automation source is requested
  without valid credentials
- **THEN** the request is rejected as unauthorised
