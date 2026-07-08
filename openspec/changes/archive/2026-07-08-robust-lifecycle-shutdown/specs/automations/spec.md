## MODIFIED Requirements

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
