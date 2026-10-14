# Proposal

## Why

Every Zigbee on/off command issued from the dashboard is silently ineffective:
the lamp does not change, no error is shown, and the control keeps displaying the
wrong state. A lamp whose capability declares `valueOn: "ON"` / `valueOff: "OFF"`
is commanded with a raw JSON boolean, which Zigbee2MQTT rejects
(`At least one of "brightness" or "state" must have a value: {"state":true}`).
Shelly devices are unaffected, because a true boolean happens to be their
declared encoding — so the failure looks family-specific and arbitrary.

The cause is a client-side ingestion defect introduced with the event stream's
per-connection device snapshot. `normalizeCapability`
(`packages/web-ui/src/app/utils/normalize.ts`) rebuilds each capability from an
explicit key list that omits `valueOn`/`valueOff`. Before the snapshot existed,
the device map came from the REST endpoints, which are not normalised; the
snapshot now delivers every device as a `device_appeared` frame, so **every**
device in the client map passes through the normaliser and loses its declared
encoding. Both consequences follow: the control misreads a reported `"ON"` as
off, and it composes `true` instead of `"ON"`.

A second, long-latent defect hides the failure and is fixed here because it is
what makes the first one undiagnosable: the optimistic override in
`use-optimistic-property.ts` gates both its confirmation listener and its revert
deadline on `CommandCoalescer.isLatest()`, which is `false` for a request once
that request has settled. An accepted-but-ineffective command therefore never
reverts and never reconciles — the interface reports a success that did not
happen, which is precisely the failure mode the `web-ui` spec calls out as the
most damaging a control surface can have.

## What Changes

- **Preserve the declared capability contract through client ingestion.** The
  dashboard's descriptor normaliser MUST carry `valueOn`/`valueOff` (and MUST NOT
  silently narrow any other declared `Capability` field) so a capability that
  reaches a control is the contract `@ts-ha/shared` declares, whether it arrived
  from the REST endpoints or from the event stream's device snapshot.
- **Reconcile a settled command.** The optimistic override MUST revert when a
  command is neither confirmed nor rejected within its deadline, and MUST
  reconcile when the device reports the value the most recent request asked for —
  including after that request's send has settled. A report carrying any other
  value (a superseded or ignored command) MUST NOT move the control. Currently
  neither reverting nor reconciling can happen.
- **Do not forward a validated command verbatim to the transport** (`core`). A
  real boolean is accepted for a boolean property by design, so that existing
  callers (HomeKit, automations, the API) keep working; when the capability
  declares a string encoding, the source MUST translate the accepted boolean to
  the capability's declared on/off value before it reaches the transport, using
  the single shared rule that already exists in `@ts-ha/shared`. This is
  defence in depth: it keeps the engine honest against `device-sources`
  "Command Dispatch" independently of any client bug, and it stops a payload the
  device will ignore from ever being published.
- **Add the regressions as unit tests.** `normalizeCapability` is a pure
  function, so the encoding drop is reachable by `bun test` — a test that would
  have caught this and that the existing `normalizeCapability` suite lacks,
  because it pins every field the implementation happens to copy and nothing
  that the contract requires.

No **BREAKING** change: the wire contract already declares the encoding, the
command endpoint's accepted values are unchanged (a real boolean remains
accepted), and no published signature moves.

## Capabilities

### New Capabilities
<!-- None. Both defects are violations of requirements the project already has. -->

### Modified Capabilities

- `web-ui`: **MODIFIED** "Data Sources" (ingestion — the API and stream snapshot
  paths MUST preserve the declared capability contract a control depends on) and
  "Device Control Interface" (a command that has been accepted but not confirmed
  MUST still revert at its deadline, and MUST still reconcile against a device
  report of the value the most recent request asked for — a report for any other
  value does not move the control; the most recent request owns reconciliation,
  settled or not).
- `device-sources`: **MODIFIED** "Command Dispatch" (a command's value MUST be
  translated into the capability's declared encoding before dispatch, so an
  accepted real boolean is never forwarded verbatim to a transport that does not
  accept it).

## Impact

- **Web UI app (`packages/web-ui/src/app`)**: `utils/normalize.ts`
  (`normalizeCapability` / `normalizeDeviceDescriptor`),
  `lib/use-optimistic-property.ts` (the reconciliation guards), and a new pure
  `lib/` module for attributing a device report by value. No view, tile, or wall
  code changes — the fix is in the layer beneath them.
- **Core (`packages/core/src/device-sources`)**: `command-validation.ts` and the
  `command()` implementations that publish a validated payload
  (`zigbee-source.ts`, `zigbee-group-source.ts`, `state-source.ts`,
  `shelly-source.ts`, `nanoleaf-source.ts`) — only where a boolean is translated
  into the declaring capability's encoding.
- **Shared (`packages/shared`)**: no change. `composeBooleanCapabilityValue` /
  `readBooleanCapabilityValue` already own the rule, and `Capability` already
  declares `valueOn`/`valueOff`; nothing is added or renamed, so
  `scripts/contract-inventory.json` is untouched.
- **CLI (`packages/cli`)**: no change. It consumes the same endpoint and inherits
  the engine-side translation.
- **Tests**: `packages/web-ui/tests/web-ui-normalize.test.ts` (the encoding must
  survive a `device_appeared` frame), `packages/web-ui/tests/command-coalescing.test.ts`
  (post-settle predicate), the new report-attribution predicate's test,
  `packages/core/tests/device-source-zigbee.test.ts` (a real boolean composes the
  declared encoding), plus whichever core source tests cover the translated
  dispatch.
- **Docs**: `docs/api-reference.md` — state plainly that a boolean property
  accepts either a real boolean or the capability's declared on/off value, and
  that either is translated to the device's own encoding. Note the same rule
  wherever the device command endpoint's body is documented.
- **Changeset**: one for `@ts-ha/web-ui` and one for `@ts-ha/core`.

## Non-Goals

- **Not a redesign of the optimistic layer.** Coalescing semantics, the revert
  deadline rule, and the room-batch override path stay as specified. Only the
  guards that decide *whether* and *by what* a settled request still reconciles
  change: the coalescer predicate, and attributing a device report by the value
  it carries.
- **Not the wall/Hearth redesign** (`redesign-wall-display`) and not the Lumen
  design system: neither is touched, and no styling changes here.
- **No new per-family knowledge in the client.** The fix removes a field from a
  key list; it does not introduce source-specific branches, which is exactly what
  the modified requirements forbid.
- **No `Capability` contract change** and no change to validation's acceptance
  rules: a real boolean stays accepted, so the change cannot break HomeKit or
  existing automations.
- **No CLI change**, and no change to the room-batch endpoint's contract.
- **The unticketed manual verification and the empty `HTTP_TOKEN`** observed on
  the deployment are noted as separate concerns, not addressed here.
