# Automations

## Purpose

The automation system is the core extensibility mechanism. Users write TypeScript classes extending `Automation` that react to triggers and orchestrate devices. The `AutomationManager` discovers, loads, and manages their lifecycle.

## Requirements

### Automation Base Class

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

### Trigger Types

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

### Trigger Context

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

### Dependency Injection

The system MUST inject dependencies via `Automation._inject(context: AutomationContext)` before calling `onStart()`. The `AutomationContext` includes:
- `mqtt`, `http`, `state`, `logger`, `config` (always present)
- `deviceRegistry` (`null` when disabled)
- `services` (shared ServiceRegistry)

### Required Services Validation

If an automation declares `requiredServices`, the system MUST validate at registration time that every listed key exists in the `ServiceRegistry`. Missing services cause a thrown `Error` with a descriptive message listing the automation name and missing key. This validation happens BEFORE `onStart()` is called.

### Automation Manager

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
7. If `onStart()` throws, unwind all wired triggers and remove the automation

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

### Execution Error Handling

The system MUST catch errors from `execute()` and log them via the automation's child logger. Errors from one trigger execution MUST NOT affect other triggers or automations.

### Disabled Service Warnings

When a trigger references a disabled service (e.g., webhook trigger with `HTTP_PORT=0`, device_state trigger with `DEVICE_REGISTRY_ENABLED=false`), the system MUST log a warning and skip the trigger registration. The automation still registers; only the unsupported trigger is ignored.
