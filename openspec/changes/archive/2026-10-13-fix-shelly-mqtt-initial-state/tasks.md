# Tasks

## 1. Ingest the full status

- [x] 1.1 Accept both `NotifyStatus` and `NotifyFullStatus` in the notification handler (`packages/core/src/device-sources/shelly-source.ts`) and dispatch each `switch:N` / `cover:N` key through the existing per-component path; verify with a unit test in `packages/core/tests/device-source-shelly.test.ts` that a `NotifyFullStatus` frame seeds `on` for a switch without any prior `NotifyStatus`
- [x] 1.2 Cover a multi-component full status; verify a test that a `NotifyFullStatus` naming `switch:0` and `switch:1` updates both logical devices and notifies subscribers for each

## 2. Seed status at first subscription

- [x] 2.1 On `start()` and on late registration, request each MQTT-transport logical entry's status via `shelly.getStatus()` / `shelly.getCoverStatus()` and apply it through the tracked-update path, isolated per device; verify a test that an MQTT device's descriptor reports `on` (and a cover's `position`/`state`) before any notification arrives
- [x] 2.2 Ensure a failed or timed-out seed is logged and non-fatal, leaving the device enumerable; verify a test with a rejecting status query that `start()` still resolves and the device is listed
- [x] 2.3 Confirm `normalize()`/merge never synthesizes an attribute the transport has not reported; verify a test that an unreported readable property is absent from `state`

## 3. Docs and contract note

- [x] 3.1 Update the `ShellyMqttNotification` doc comment in `packages/shared/src/types/shelly.ts` to name both notification methods; verify `bun run typecheck` passes
- [x] 3.2 Update `docs/services/shelly.md` to describe full-status ingestion and status seeding at subscription; verify the documented behaviour matches the implemented methods

## 4. Integration verification

- [x] 4.1 Run `bun run typecheck && bun run check && bun run test` and verify all pass
- [ ] 4.2 Against a running instance, verify `GET /api/device-catalog` shows a Shelly switch's `state.on` and a cover's `state.position`/`state.state` before any interaction (read-only)
  - **DEFERRED (coordinator, explicit user decision):** out-of-band manual verification against live Shelly hardware + MQTT broker. No broker/instance is available in this environment (nothing listening on 1883/8080, no running engine, no `.env`). Not performed and not claimed complete; to be run by the operator against a live instance.

## Workflow follow-up

- Archive the change after review requirements are satisfied and verify the archived result.
