# Automations

## Purpose

The automation system is the core extensibility mechanism. Users write TypeScript classes extending `Automation` that react to triggers and orchestrate devices. The `AutomationManager` discovers, loads, and manages their lifecycle.

## Requirements

### Requirement: Automation Base Class

The system MUST provide an abstract `Automation` class with:

**Abstract members (must be implemented):**
- `abstract readonly name: string` — Unique identifier, used in logs and cron job IDs
- `abstract readonly triggers: Trigger[]` — Trigger(s) that cause execution
- `abstract execute(context: TriggerContext): Promise<void>` — The automation logic

**Optional members:**
- `readonly requiredServices?: readonly string[]` — Services validated at registration time
- `async onStart(): Promise<void>` — Lifecycle hook called after dependency injection
- `async onStop(): Promise<void>` — Lifecycle hook called on shutdown

**Injected dependencies (available after `_inject()`):**
- `protected mqtt: MqttService`
- `protected http: HttpClient`
- `protected state: StateManager`
- `protected logger: Logger`
- `protected config: Config`
- `protected get services(): ServiceRegistry`
- `protected get deviceRegistry(): DeviceRegistry | null`

**Convenience methods:**
- `protected require<T>(key: string): T` — Non-null service retrieval (validated at startup)
- `protected async notify(options: NotificationOptions): Promise<void>` — Push notification (no-ops if service absent)

### Requirement: Trigger Types

The system MUST support 7 trigger types:

#### 1. MQTT Trigger
```ts
{ type: "mqtt"; topic: string; filter?: (payload: Record<string, unknown>) => boolean }
```
Fires when a message arrives on the given MQTT topic. Supports `+` and `#` wildcards. Optional `filter` narrows which payloads trigger execution.

#### 2. Cron Trigger
```ts
{ type: "cron"; expression: string }
```
Fires on a cron schedule (e.g. `"0 7 * * *"` = daily at 7 AM).

#### 3. State Trigger
```ts
{ type: "state"; key: string; filter?: (newValue: unknown, oldValue: unknown) => boolean }
```
Fires when a state key changes. Reacts to changes made by other automations.

#### 4. Webhook Trigger
```ts
{ type: "webhook"; path: string; methods?: ("GET" | "POST" | "PUT" | "DELETE")[] }
```
Fires on `POST /webhook/<path>` (methods configurable, default: POST only). Requires `HTTP_PORT > 0`.

#### 5. Device State Trigger
```ts
{ type: "device_state"; friendlyName: string; filter?: (state: Record<string, unknown>, device: ZigbeeDevice) => boolean }
```
Fires when a tracked device's state changes. Requires `DEVICE_REGISTRY_ENABLED=true`.

#### 6. Device Joined Trigger
```ts
{ type: "device_joined"; friendlyName?: string }
```
Fires when a Zigbee device joins. Optional `friendlyName` scopes to a specific device. Requires `DEVICE_REGISTRY_ENABLED=true`.

#### 7. Device Left Trigger
```ts
{ type: "device_left"; friendlyName?: string }
```
Fires when a Zigbee device leaves. Optional `friendlyName` scopes to a specific device. Requires `DEVICE_REGISTRY_ENABLED=true`.

### Requirement: Trigger Context

The `execute()` method receives a discriminated union based on trigger type:

| Type | Context fields |
|------|---------------|
| `mqtt` | `type`, `topic`, `payload: Record<string, unknown>` |
| `cron` | `type`, `expression`, `firedAt: Date` |
| `state` | `type`, `key`, `newValue: unknown`, `oldValue: unknown` |
| `webhook` | `type`, `path`, `method`, `headers`, `query`, `body` |
| `device_state` | `type`, `friendlyName`, `state`, `device: ZigbeeDevice` |
| `device_joined` | `type`, `device: ZigbeeDevice` |
| `device_left` | `type`, `device: ZigbeeDevice` |

### Requirement: Dependency Injection

The system MUST inject dependencies via `Automation._inject(context: AutomationContext)` before calling `onStart()`. The `AutomationContext` includes:
- `mqtt`, `http`, `state`, `logger`, `config` (always present)
- `deviceRegistry` (`null` when disabled)
- `services` (shared ServiceRegistry)

### Requirement: Required Services Validation

If an automation declares `requiredServices`, the system MUST validate at registration time that every listed key exists in the `ServiceRegistry`. Missing services cause a thrown `Error` with a descriptive message listing the automation name and missing key. This validation happens BEFORE `onStart()` is called.

### Requirement: Automation Manager

The Automation Manager MUST discover, register, and clean up automations, and MUST release any resources created during a partially-failed `onStart()`.

#### Discovery

The system MUST discover automation files via `discoverAndRegister(automationsDir, recursive)`:
- List all `.ts` and `.js` files (excluding `.d.ts`) in the directory
- Dynamically `import()` each file
- Check that `module.default` is a class extending `Automation`
- Skip files with no valid default export (log warning)

#### Registration

For each discovered automation, `register(automation)` MUST:
1. Detect duplicate names (throw `Error` if duplicate)
2. Create child logger with `{ automation: name }`
3. Call `_inject()` with the `AutomationContext`
4. Validate `requiredServices`
5. Wire each trigger to the appropriate service:
   - `mqtt` → `mqtt.subscribe(topic, handler)`
   - `cron` → `cron.schedule(jobId, expression, callback)`
   - `state` → `state.onChange(key, handler)`
   - `webhook` → `httpServer.registerWebhook(path, methods, handler)`
   - `device_state` → `deviceRegistry.onDeviceStateChange(friendlyName, handler)`
   - `device_joined` → `deviceRegistry.onDeviceAdded(handler)`
   - `device_left` → `deviceRegistry.onDeviceRemoved(handler)`
6. Call `automation.onStart()`
7. If `onStart()` throws, unwind all wired triggers, call the automation's `onStop()` (best-effort, errors caught and logged) so any timers or listeners created during the partial `onStart()` are released, and remove the automation from the registry

#### Lifecycle Cleanup

`stopAll()` MUST:
1. Unsubscribe all MQTT handlers
2. Unsubscribe all state handlers
3. Remove all webhook routes
4. Unsubscribe all device state/joined/left handlers
5. Remove all cron jobs for the automation
6. Call `automation.onStop()`
7. Process in reverse registration order

Errors in `onStop()` are logged but do not prevent other automations from stopping.

#### Query API

The system MUST expose these query methods for the debug API:
- `listAutomations()` — All registered automations with trigger summaries
- `getAutomation(name)` — Single automation details, or `null` if not found
- `triggerAutomation(name, context)` — Manual trigger via debug API

#### Scenario: onStart failure releases partial resources

- **WHEN** an automation's `onStart()` creates a timer or listener and then throws
- **THEN** registration rollback unwinds the wired triggers, calls the automation's `onStop()` to release those resources, and removes the automation — leaving no orphaned timer or listener

### Requirement: Execution Error Handling

The system MUST catch errors from `execute()` and log them via the automation's child logger. Errors from one trigger execution MUST NOT affect other triggers or automations.

### Requirement: Disabled Service Warnings

When a trigger references a disabled service (e.g., webhook trigger with `HTTP_PORT=0`, device_state trigger with `DEVICE_REGISTRY_ENABLED=false`), the system MUST log a warning and skip the trigger registration. The automation still registers; only the unsupported trigger is ignored.

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
