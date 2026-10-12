## 1. Phase 1 — Repair the device surface

- [x] 1.1 Replace `listDevices`/`getDevice` in `client.ts` with `getDeviceCatalog()` (`GET /api/device-catalog`) and `getDevice(qualifiedId)` (`GET /api/device-catalog/:qualifiedId`), typed with `DeviceDescriptor`; verify `bun run --filter @ts-ha/cli typecheck` passes and the client test covers the new paths
- [x] 1.2 Add a device-resolution helper that accepts a `qualifiedId` or a case-insensitive display-name substring, returning a single match, listing candidates on ambiguity, and reporting absence; verify unit tests cover exact-id, unique-name, ambiguous-name, and missing cases
- [x] 1.3 Rewrite `commands/devices.ts` and the device formatter in `format.ts` for `DeviceDescriptor` (source, display name, reachability, state, capabilities); verify the devices command test asserts catalog rows and no longer references `friendly_name`/`interview_state`
- [x] 1.4 Rewrite `components/devices-tab.tsx` and the device shape in `components/types.ts` to render the catalog (source, name, reachability, state-key count, capability count) and drop the "registry disabled" framing; verify the tab renders a multi-source fixture without the legacy fields
- [x] 1.5 Migrate the automations tab and `components/types.ts` from `AutomationInfo` to the shared `Automation` type; verify `bun run --filter @ts-ha/cli typecheck` passes
- [x] 1.6 Remove `SerializedDevice`, `DeviceInfo`, and `AutomationInfo` from `packages/shared/src/wire.ts`; verify `rg "SerializedDevice|DeviceInfo|AutomationInfo" packages` returns no source references and the workspace typechecks
- [x] 1.7 Add a Changeset recording the `@ts-ha/shared` breaking removal and the `@ts-ha/cli` bump; verify the changeset file exists and names both packages

## 2. Phase 2 — Read surfaces and the live stream

- [x] 2.1 Add client methods for `automations/:name/history`, `automations/:name/relationships`, `GET /api/energy`, `GET /api/weather` (unavailable markers on 404/400), `GET /api/rooms`, `GET /api/rooms/:id`, `GET /api/walls`, `GET /api/walls/:name`; verify client tests cover each path and the weather-unavailable mapping
- [x] 2.2 Implement the realtime stream reader: fetch `GET /api/events` with the auth header, parse `data:` frames, ignore `: keep-alive` comments, surface `401`, and reconnect with backoff; verify unit tests parse a multi-event frame buffer, a keep-alive, and a chunk split mid-frame
- [x] 2.3 Add `automations history <name>`, `automations relationships <name>`, `energy`, and `weather` subcommands with table/JSON output; verify command tests assert formatted output and the weather-unavailable message
- [x] 2.4 Rewire `commands/dashboard.tsx` to snapshot-then-stream: initial full snapshot, apply stream deltas per category, slow-poll HomeKit/energy/weather, and re-snapshot on `fell_behind`; verify a dashboard data-model test drives a synthetic event sequence and asserts the patched state
- [x] 2.5 Add Energy and Weather dashboard tabs (or fold both into the Overview tab) fed by the slow poll; verify the tab renders a fixture and an unavailable weather marker
- [x] 2.6 Extend `USAGE` in `index.ts` and the shortcuts in `components/help-modal.tsx` for the new commands and tabs; verify `ts-ha --help` lists them

## 3. Phase 3 — Control

- [x] 3.1 Add client methods `sendDeviceCommand`, `setDeviceHidden`, `assignDeviceRoom`/`unassignDeviceRoom`, `createRoom`/`renameRoom`/`deleteRoom`/`sendRoomCommand`, and wall `create`/`update`/`delete`; verify client tests cover each method and its error mapping
- [x] 3.2 Add `devices command|hide|unhide|assign|unassign` subcommands that resolve the device argument via 1.2 and report the engine outcome; verify command tests cover a successful command, an unknown device, and a refused command
- [x] 3.3 Add `rooms ls|get|create|rename|rm|command|assign|unassign` subcommands that report per-member batch outcomes; verify command tests cover CRUD and a mixed-outcome batch response
- [x] 3.4 Add `walls ls|get|create|update|rm` subcommands (administration only, no rendering); verify command tests cover create/update/delete against a stub
- [x] 3.5 Add inline device controls to the Devices tab, projecting each flattened writable `Capability` to a toggle/adjuster/cycler/editor and using the shared boolean read/compose helpers; verify tests cover the boolean-encoding case, a read-only capability, and an unreachable device
- [x] 3.6 Add a Rooms tab listing rooms and members with a batch control per room; verify the tab renders a fixture and issues a room command

## 4. Verification

- [x] 4.1 Run the full gate `bun run typecheck && bun run check && bun run test` and fix any failures
- [x] 4.2 Smoke-test `ts-ha devices`, `ts-ha rooms`, `ts-ha energy`, `ts-ha weather`, `ts-ha devices command`, and `ts-ha dashboard` against a running engine, confirming live stream updates appear without waiting for the refresh interval
