## Why

The web UI is a read-only window onto the engine. You can watch devices and
automations, but you cannot control a device, disable an automation, or read
what an automation actually does. The gap is not the frontend — it is the
control plane: `GET /api/devices` deliberately strips the Zigbee `exposes`
schema, `MqttService.publishToDevice()` is unreachable over HTTP, no
enable/disable concept exists anywhere in `AutomationManager`, and the
automation source file path is computed during discovery and immediately
discarded.

The delivery model compounds this. Roughly 1 MB of JS and CSS is inlined into
every dashboard response with no caching, no code splitting, and no dev
server, so every UI change costs a full rebuild and restart, and every added
kilobyte is paid on every page load.

This change rebuilds the web UI as a real control surface, and builds the
server-side capability it needs to be one.

## What Changes

**Asset delivery**
- Serve the compiled bundle from content-hashed, immutably cached routes
  instead of inlining it into the HTML shell. The shell becomes small.
- Compress the assets with gzip. Nothing in the server compresses anything today,
  so that 1 MB is shipped verbatim; compressed it is roughly a quarter of the
  size. The compressed body is produced at build time and stored in the asset
  manifest, so it costs nothing per request. gzip rather than brotli because
  browsers offer brotli only on secure origins and this dashboard is normally
  reached over plain HTTP on a local network.
- Hold first paint to a stated transferred-bytes budget, enforced at build time,
  so the mobile-first claim is measured rather than asserted and the rebuilt
  interface cannot quietly grow past it.
- Enable code splitting so incidental features (syntax highlighting) load on
  demand rather than on first paint.
- Add a development workflow that does not require a rebuild-and-restart cycle
  for frontend changes.
- Add an error boundary, which the app currently has nowhere, so a failure in one
  view cannot take down the whole dashboard. This lands first because it is
  independent of every other part of the change and limits the damage of the
  rest of it.

**Unified device model**
- Promote the HomeKit accessory-source pattern into a general device source
  abstraction covering Zigbee, Shelly, Nanoleaf, and configured state toggles:
  enumerate, command, and subscribe to state.
- Configured state toggles, today visible only as HomeKit switches, become
  ordinary devices in the shared model, so they are controllable from the web UI
  and can be placed in rooms. Their configuration moves from the HomeKit service
  to the engine, since they are no longer HomeKit-specific. **BREAKING** for any
  deployment passing `stateToggles` under the HomeKit service options.
- The shared source carries a rich payload; the HomeKit layer narrows it to HAP
  characteristics. Existing HomeKit behaviour is preserved exactly, including
  accessory UUID derivation, so no re-pairing is required. **BREAKING** for any
  consumer importing from `src/core/services/homekit-sources/` directly.
- Stop stripping `definition.exposes` from the devices API and give it a real
  type in place of `unknown[]`, so the UI can render controls generically. That
  type is a source-neutral capability vocabulary rather than a Zigbee one, since
  Shelly, Nanoleaf, and state toggles describe themselves in the same terms; the
  Zigbee2MQTT description is mapped into it.
- Add device command endpoints so a device can be actuated over HTTP.
- Add `getDevices()` to `NanoleafService`, which is currently not enumerable.
- Remove the Zigbee-only device endpoints rather than repurposing them, serving
  the unified device API from new source-scoped paths. Both existing clients
  already handle a failed device fetch by reporting devices unavailable; keeping
  the old paths with a changed shape would return success and defeat that
  handling. **BREAKING** — `GET /api/devices` and `GET /api/devices/:name` are
  removed.

**Automation control**
- Retain each automation's source file path during discovery.
- Extract the existing onStart-failure rollback into a reusable unwire routine
  and add per-automation stop and restart, so disabling an automation fully
  deregisters its triggers and runs `onStop()`, and enabling it re-imports a
  fresh instance.
- Persist the enabled/disabled flag, surviving an abrupt process kill, and discard
  a stored flag whose automation no longer exists — guarded so that a discovery
  that saw no automations at all discards nothing, since an unreadable
  automations directory would otherwise re-enable every disabled automation.
- Refuse manual execution of a disabled automation, so the off switch holds on the
  manual path as well as the trigger path.
- Expose an automation's source over HTTP for display in the UI.

**Rooms**
- Introduce user-defined rooms as a UI-local grouping, since Zigbee2MQTT
  supplies no area data. A device belongs to at most one room, and assignments
  key on a stable per-source hardware identifier so that renaming a device in
  Zigbee2MQTT does not orphan its room.
- Rooms span sources: one room holds Zigbee, Shelly, and Nanoleaf devices alike.

**Automation observability**
- Establish an execution context around every automation run, so that runs and
  the state writes they perform can be attributed to the automation that caused
  them. Nothing records this today.
- Retain a short in-memory history of recent executions per automation —
  timestamp, triggering event, duration, and outcome.
- Export monotonic per-automation execution and failure counters through the
  existing Prometheus metrics service, so sustained failure is alertable even
  though the in-memory history is bounded and lost on restart.
- Surface each automation's declared required services, its related devices, the
  state keys it reads, and the state keys it has been observed writing.

**Realtime**
- Add a server-sent event stream carrying state, device, log, automation, and
  execution deltas, replacing the current five-second full refetch of six
  endpoints. The device categories arrive with the unified device model, since
  reachability and source-qualified identity do not exist before it.
- Bound what the stream buffers per connection. Replacing a poll with a push
  removes the self-limiting behaviour a poll had, so a client that reads slowly
  rather than failing outright is dropped back to a snapshot instead of
  accumulating in engine memory.

**State persistence**
- Replace shutdown-only persistence with a debounced flush so writes survive an
  abrupt kill. The debounce interval is configurable.
- Reserve an internal state namespace for rooms and automation enabled flags, and
  enforce it in the state store rather than at the HTTP layer. Public callers,
  including automations, cannot write these keys, and they are omitted from the
  state listing and from raw state events. Without this, deleting one key from
  the operator state view discards every room assignment, and writing an enabled
  flag directly sets it without stopping or starting the automation — an
  automation reported as disabled whose triggers are still wired.
- Enable state and device registry persistence by default. Rooms and automation
  enabled flags are user-authored data that the specs require to survive a
  restart, and both are stored through the state store; leaving persistence
  opt-in would make that guarantee false on a default install. **BREAKING** —
  `STATE_PERSIST` and `DEVICE_REGISTRY_PERSIST` change their default from `false`
  to `true`, so a default deployment begins writing state files.

**UI rebuild**
- Real URL routing with deep links, registered as an explicit allowlist of UI
  segments rather than a wildcard, so mounting the UI at `/` does not shadow
  health probes, webhooks, or the API.
- Split the interface by audience: a control-oriented home section built around
  rooms and devices, and an operator section holding automations, state, logs,
  and HomeKit. Navigation is grouped by that split.
- Mobile-first. The control surface is designed for a phone held in the room
  being controlled; the operator section is desktop-oriented and is not carried
  into the mobile navigation.
- The landing view is a device control surface, not engine status.
- Deeper information architecture: room and device lists with device detail
  pages, automation list with automation detail pages, in place of six flat
  sibling tabs.
- The operator views — state, logs, and HomeKit — are rebuilt rather than carried
  across. The data layer changes underneath them regardless when polling is
  replaced by the stream, and a ported tab inside the rebuilt shell would leave a
  permanently two-generation interface.
- Device detail renders controls generically from the capability schema. Device
  tiles present a single primary action and readout selected by a curated
  ranking over that same schema.
- Automation detail offers enable/disable, manual trigger, a syntax-highlighted
  source view, recent executions, required service status, related devices, and
  observed state keys.
- Controls actuate optimistically and revert on a deadline derived from the
  device's observation mode, so a push-backed device reverts promptly while a
  polled one is given until its next refresh. Continuous adjustment keeps at most
  one command per device and property outstanding, so a slider drag neither
  floods the transport nor snaps backwards when a superseded value is confirmed.

## Capabilities

### New Capabilities
- `device-sources`: A source-agnostic device abstraction — enumerate devices,
  issue commands, and subscribe to state changes — implemented for Zigbee,
  Shelly, Nanoleaf, and configured state toggles, and consumed by both the
  HomeKit bridge and the web UI.
- `automation-control`: Runtime enable/disable of individual automations with
  full trigger deregistration and lifecycle teardown, durable flag persistence,
  and retrieval of an automation's source.
- `realtime-events`: A server-sent event stream delivering incremental state,
  device, log, automation, and execution updates to connected clients.
- `device-rooms`: User-defined rooms grouping devices across sources, keyed on
  stable per-source hardware identifiers, with assignment, renaming, and
  retention of assignments for devices that are temporarily absent.
- `automation-observability`: Attribution of automation runs and the state
  writes they perform, a bounded in-memory history of recent executions per
  automation, and derived relationships between an automation and the devices
  and state keys it touches.

### Modified Capabilities
- `web-ui`: Asset delivery moves from inlined to content-hashed cached routes;
  the app gains an error boundary, URL routing, audience-split navigation,
  room-based grouping, device controls, and automation management. Requirements
  covering the dashboard shell, build process, routes, technology stack, and data
  sources all change.
- `http-server`: New endpoints for device commands, automation enable/disable,
  automation source retrieval, room management, automation execution history,
  and the event stream. The unified device endpoints carry the `exposes` schema
  the Zigbee-only ones stripped. The Zigbee-only device endpoints are removed in
  favour of source-scoped paths, the state listing omits reserved internal keys
  from both its map and its count, and manual execution of a disabled automation
  is refused with a conflict rather than run. The endpoint inventory itself is
  restated rather than only added to, so the removals and status changes land in
  the specification rather than sitting beside a table that still describes the
  old routes.
- `state-management`: Persistence changes from shutdown-only to debounced
  write-behind with a configurable interval, and is enabled by default. Writes
  performed during an automation run are attributed to that automation. A
  reserved internal namespace is added, which public callers may not write and
  which is omitted from enumeration.
- `prometheus-metrics`: Adds per-automation execution and failure counters
  alongside the existing device gauges.
- `automations`: `AutomationManager` retains discovery file paths and gains
  per-automation stop and restart alongside the existing all-or-nothing
  `stopAll()`.
- `device-registry`: The z2m `exposes` schema becomes typed and readable rather
  than an opaque `unknown[]`, and registry persistence is enabled by default.
- `nanoleaf-service`: Gains device enumeration.
- `homekit`: Accessory sources are re-expressed on top of the shared device
  source abstraction, including state toggles, whose configuration relocates to
  the engine. Observable HomeKit behaviour is unchanged.
- `homekit-state-toggles`: Toggles become general devices rather than a
  HomeKit-only feature, controllable from the web UI and placeable in rooms.
  Configuration moves to engine level and accessory UUIDs are unchanged.
- `configuration`: New environment variables for the state flush interval and
  the device source refresh intervals, changed defaults for state and device
  registry persistence, the relocation of state toggle configuration, and
  rejection of reserved internal keys in the state toggle allowlist.
- `automation-observability` (new, listed above): the set of observed state
  writes retained per automation is capped, mirroring the execution history
  bound rather than growing without limit.
- `logging`: `LogBuffer` gains a subscription so the stream's log category can
  deliver entries as they are written rather than polling `query()`, with
  notification deferred past the write call so fan-out does not run inside
  pino's synchronous sink. A second, stdout-only logger is added for the
  stream's delivery path, because a log emitted while delivering a log event
  otherwise produces another log event indefinitely.
- `engine`: `stateToggles` becomes an engine option; the four device sources and
  the aggregate accessor are constructed and torn down by the engine at defined
  points in the startup and shutdown sequences; the HomeKit factory context
  loses its Zigbee and transport members in favour of the shared accessor; and
  the stdout-only logger is constructed alongside the primary one.
- `cli`: no CLI code changes, but the specification is corrected to record that
  `getDevices()`, `getDevice(name)`, `ts-ha devices`, and the dashboard's
  Devices tab do not work against an upgraded engine. The requirements are
  amended in place rather than deleted, so the follow-up change has something to
  restore against.

## Impact

**Code**
- `src/core/web-ui/**` — substantially rewritten, including `app/`,
  `components/html-shell.ts`, `index.ts`, and the generated `assets/`. Every
  existing tab component and the polling hook are deleted.
- `scripts/build-web-ui.ts` — emits hashed, pre-compressed asset files rather
  than string constants, and enforces the first-paint budget; the `prebuild`
  contract changes.
- `src/types/` — a new source-neutral capability vocabulary module, which
  `src/types/zigbee/bridge.ts` maps into rather than defines.
- `src/core/http/http-server.ts` — new routes, the `exposes` passthrough, removal
  of the Zigbee-only device endpoints, and reserved-key filtering of the state
  listing.
- `src/core/automation-manager.ts` — file path retention, unwire extraction,
  stop/restart, execution context and execution history.
- `src/core/state/state-manager.ts` — debounced flush, write attribution,
  reserved namespace enforcement and an internal write path.
- `src/core/logging/log-buffer.ts` — a subscription alongside `write()` and
  `query()`, with notification deferred past the write call.
- `src/core/engine.ts` — device source construction and teardown at defined
  points in the startup and shutdown sequences, the `stateToggles` option, and
  the second stdout-only logger.
- `src/core/zigbee/device-registry.ts`, `src/types/zigbee/bridge.ts` — exposes
  mapped into the shared vocabulary.
- `docs/**` — `api-reference.md`, `http/web-ui.md`, `configuration.md`,
  `state.md`, `device-registry.md`, `services/homekit.md`, and
  `services/nanoleaf.md` all describe behaviour this change alters.
- `src/core/services/homekit-sources/**` — relocated or re-expressed onto the
  shared abstraction.
- `src/core/services/nanoleaf-service.ts` — enumeration.
- `src/config.ts` — new settings and changed persistence defaults.
- `src/index.ts` — barrel exports for any newly public types.

**Out of scope**
- `src/cli/` — the CLI dashboard reads `/api/devices` and `/api/devices/:name`
  (`src/cli/client.ts:103-108`) and keys on `friendly_name`. Removing those
  endpoints breaks its device views, which degrade to "unavailable" rather than
  crashing because the dashboard already tolerates a failed device fetch.
  Realigning the CLI with the unified device model is deliberately left to a
  follow-up change so that this one stays scoped to the engine and the web UI.
  The existing web UI's device and HomeKit tabs degrade the same way, from the
  device-sources work until the UI rebuild replaces them. The `cli` specification
  is nonetheless amended to record the degradation, so that no main spec is left
  asserting behaviour this change removes.
- `AutomationContext` — automations do not gain the unified device model. They
  keep `deviceRegistry: DeviceRegistry | null`, which stays Zigbee-only, and the
  per-family service APIs (`shelly.turnOn()`, the Nanoleaf service, and so on).
  The abstraction ships with two consumers, the HomeKit bridge and the web UI,
  and is deliberately not offered to the third. Automations are typed against a
  known device family at authoring time and lose little from the specific API,
  whereas exposing the aggregate accessor to them would put command validation on
  the automation path and widen the framework's public surface before there is
  any evidence of what automations actually want from it. A follow-up change can
  add it once the abstraction has been exercised by the sinks that motivated it.
- Custom device sources — the source set is fixed at Zigbee, Shelly, Nanoleaf,
  and configured state toggles. `DeviceSource` is exported so the shape is
  inspectable and testable, not as a registration point; there is no engine
  option that adopts a caller-supplied source.

**Risks**
- HomeKit accessory UUIDs derive from `device.ieee_address`, and the bridge
  UUID from the configured username. The source refactor must not perturb
  either, or every user re-pairs.
- The automation source endpoint is readable on instances with no token
  configured, which is a supported deployment. Automation source frequently
  contains device names, hostnames, notification topics, and API keys.
- Serving assets from separate routes rather than inline means the dashboard is
  no longer a single self-contained HTTP response.
- Debounced persistence increases disk write frequency relative to today's
  shutdown-only behaviour.
- The execution context sits on the hot path of every automation run. It must
  not measurably slow execution or leak context between concurrent runs.
- Room assignments are user-authored data the engine has not held before, and
  are the first thing in the system that can be orphaned by an external rename.
- Enabling persistence by default makes a default deployment write to disk where
  it previously did not, and silently changes restart behaviour for existing
  installations that never set `STATE_PERSIST`.
- State toggles becoming general devices means a state key is now writable from
  the home control surface, not only from the operator state view.
- Rooms and automation enabled flags share the state store with user-facing keys,
  where the operator state view already offers full CRUD and automations can
  write freely. A reserved namespace guards them, and that guard has to hold on
  writes and on every surface that enumerates keys.
- The device views of both existing clients report devices unavailable between
  the device-sources work and the UI rebuild.
- No browser test harness exists and none is added, so the rebuilt interface —
  including the error boundary that caps the blast radius of the rest of the
  change — is verified by hand. The mitigation is a design rule, not a test:
  every decision the UI makes lives in a pure module reachable by `bun test`, and
  components render a value already decided elsewhere.
- Rebuilding the operator views enlarges the phase that already had no partial
  value, and it is also the phase with the least automated verification.
- The stream's log category can feed itself. Every log becomes an event, the
  delivery path logs when it fails, and that log becomes an event. Deferring the
  emit only spreads the loop across event-loop turns — a silent hot spin rather
  than a stack overflow — so the delivery path must also log somewhere the buffer
  cannot see. That boundary covers everything reachable from a notification, not
  a single function, so it is asserted rather than reviewed.
- Confining the stdout-only logger to the delivery path keeps stream lifecycle
  visible in the log view, at the cost of a boundary that is easy to cross by
  reaching for the ambient logger.

**Dependencies**
- A lightweight syntax highlighter for the source view, loaded on demand.
- No new server-side runtime dependencies anticipated; Hono supports event
  streaming natively.
