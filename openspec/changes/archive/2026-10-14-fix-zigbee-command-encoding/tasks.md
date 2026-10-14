# Tasks

## 1. Web UI — descriptor ingestion preserves the declared contract

- [x] 1.1 Carry the declared on/off values through `normalizeCapability` in `packages/web-ui/src/app/utils/normalize.ts`: copy `valueOn`/`valueOff` when each is a string, number, or boolean, and leave it absent otherwise so an undeclared encoding keeps its existing `?? true`/`?? false` fallback (Shelly, Nanoleaf, state toggles are unchanged). Verify `bun run --filter @ts-ha/web-ui typecheck` passes and a scratch call to `normalizeCapability` with `valueOn: "ON"` returns it.
- [x] 1.2 Extend `packages/web-ui/tests/web-ui-normalize.test.ts`: a `device_appeared` frame whose boolean capability declares a string encoding retains `valueOn`/`valueOff` through `normalizeStreamEvent`; a room member's descriptor retains them too; a malformed `valueOn` (object/array/null) degrades to absent. Verify `bun test packages/web-ui/tests/web-ui-normalize.test.ts --conditions=development` passes.
- [x] 1.3 Add the drift guard to the same file: a stream-ingested descriptor keeps every field the declared `Capability` contract requires — `property`, `valueType`, `access`, `unit`, `permittedValues`, `range`, `step`, `valueOn`, `valueOff` — including inside nested `features`, so a field added to the contract later fails here instead of reaching a device. Verify the test passes and fails if `valueOn` is dropped again (remove it locally, observe the failure, restore).

## 2. Web UI — reconciliation survives a settled send

- [x] 2.1 In `packages/web-ui/src/app/lib/command-coalescing.ts`, add the predicate the optimistic hook actually needs — whether a newer request for a key exists, independent of whether one is in flight — with a doc comment stating that `isLatest` answers a different question and that this one does not become false merely because the send settled. Verify `bun run --filter @ts-ha/web-ui typecheck` passes.
- [x] 2.2 Extend `packages/web-ui/tests/command-coalescing.test.ts`: after a send settles, the newest request is not superseded; a request whose successor is queued is superseded; a superseded request stays superseded after its successor settles. Verify `bun test packages/web-ui/tests/command-coalescing.test.ts --conditions=development` passes.
- [x] 2.3 In `packages/web-ui/src/app/lib/use-optimistic-property.ts`, gate both the confirmation listener and the revert deadline on that predicate plus the override's own token comparison — the same identity rule `clearOverride` in `lib/data-store.tsx` already uses — so a settled command still reverts at its deadline and still yields to a device report, while a superseded request still cannot move the control. Verify `bun run --filter @ts-ha/web-ui typecheck && bun run --filter @ts-ha/web-ui test` passes; the behavioural check is task 5.2/5.3.

## 3. Core — an accepted command is dispatched in the declared encoding

- [x] 3.1 Add a dispatch-side translation step over a validated command's properties: resolve each property's capability with `flattenByProperty` (`packages/core/src/device-sources/command-validation.ts`) and compose a boolean through `composeBooleanCapabilityValue` (`@ts-ha/shared`), leaving non-boolean and already-declared values untouched. Verify `bun run --filter @ts-ha/core typecheck` passes and a unit test over the helper covers: real boolean → declared value, declared value → unchanged, no declared encoding → unchanged.
- [x] 3.2 Apply it in the two sources that build their transport payload straight from the request — `packages/core/src/device-sources/zigbee-source.ts` and `zigbee-group-source.ts` (both publish `properties` via `mqtt.publishToDevice`) — and verify their tests assert the published payload carries the capability's declared value (`"ON"`/`"OFF"`) when a real boolean was commanded, in `packages/core/tests/device-source-zigbee.test.ts` and `device-source-zigbee-group.test.ts`.
- [x] 3.3 Confirm the other three sources already express their declared encoding (`state-source.ts` calls `state.set(deviceId, properties.on)`; `shelly-source.ts` calls `turnOn`/`turnOff`; `nanoleaf-source.ts` builds its own payload) and change nothing there beyond routing them through the step if their payload would otherwise pass a value through verbatim; verify `bun run --filter @ts-ha/core test` passes with no existing assertion changed.

## 4. Documentation and release bookkeeping

- [x] 4.1 Update `docs/api-reference.md`'s device command endpoint: a boolean property accepts either a real boolean or the capability's declared on/off value, and either is dispatched to the device in its own declared encoding. Verify the page states it and no other sentence contradicts it (`grep -rn "device-catalog" docs/`).
- [x] 4.2 Note the same rule in `docs/device-classes.md` or `docs/device-types.md` where a capability's on/off encoding is described, if that page currently implies only one spelling is valid; verify `docs/zensical.toml` navigation stays in sync (no new page).
- [x] 4.3 Add a Changeset for `@ts-ha/web-ui` and one for `@ts-ha/core` describing the fix. Verify the files exist under `.changeset/` and name both packages.

## 5. Integration verification

- [x] 5.1 Run the full workspace gate — `bun run typecheck && bun run check && bun run test` — and verify all three pass, including `guard-deps` and `guard-contracts` (no shared contract changed, so both stay green).
- [ ] 5.2 Manual, against a running engine and a real string-encoded device (a Zigbee lamp): reload the dashboard so the map comes from the event stream's snapshot, then toggle the lamp from the device list **and** from the wall. Verify the lamp actually changes, the control settles rather than resisting, and the Zigbee2MQTT log no longer reports `At least one of "brightness" or "state" must have a value`. This is the check no automated gate in this repository can perform — `packages/web-ui/tests` has no DOM harness.
- [ ] 5.3 Manual: verify the unconfirmed path reverts — with the device unable to confirm (its source stopped, or the transport unavailable), toggle a control and verify it returns to the last reported state at its deadline instead of holding the optimistic value indefinitely, and that a rejected command still surfaces its error inline.
- [x] 5.4 Re-read the modified requirements against the delivered behaviour: `web-ui` "Data Sources" (ingestion does not narrow a declared capability) and "Device Control Interface" (a settled command still reconciles and still reverts), and `device-sources` "Command Dispatch" (an accepted command is never published untranslated). Verify `openspec validate fix-zigbee-command-encoding --strict` passes.

## 6. Review-driven scope expansion — attribute a device report by value

- [x] 6.1 Add a pure predicate `reportedValueConfirms(requested, reported)` in a new module under `packages/web-ui/src/app/lib/` (a pure module the hook wires together, like `revert-deadline.ts`): a report equal to the requested value confirms the override and any other value does not; primitives compare exactly, arrays and objects structurally. Cover it in `packages/web-ui/tests/reconcile-report.test.ts`. Verify `bun run --filter @ts-ha/web-ui typecheck` and `bun test packages/web-ui/tests/reconcile-report.test.ts --conditions=development` pass.
- [x] 6.2 In `packages/web-ui/src/app/lib/use-optimistic-property.ts`, gate the confirmation listener on that predicate — clear the override only when the report carries the override's requested value and leave a report carrying any other value to the deadline (drop the listener's `isSuperseded` check, which is always `false` for the override's own token; keep the deadline's token-identity plus `isSuperseded` guard). Verify `bun run --filter @ts-ha/web-ui typecheck && bun run --filter @ts-ha/web-ui test` passes.
- [x] 6.3 Re-run the full workspace gate — `bun run typecheck && bun run check && bun run test` — and `openspec validate fix-zigbee-command-encoding --strict`; all must pass.

## Workflow follow-up

- Archive this change with `/opsx-archive` once tasks 1–6 are complete and the manual verification has been performed.
- `redesign-wall-display` re-skins the same device tile path; when it lands, re-check tasks 5.2 and 5.3 there, since the wall is the surface where a control that lies is least likely to be noticed.
