# Design

## Context

See `proposal.md` — Why, for the failure and its user-visible shape.

The pieces this design has to work with:

- **The engine declares the encoding correctly.** The Zigbee2MQTT mapper produces
  a boolean capability with `valueOn`/`valueOff` (e.g. `"ON"`/`"OFF"`) for a
  lamp's `state`; Shelly produces a real boolean (`true`/`false`) for `on`. This
  is required by `device-sources` "Rich Device Descriptor" and is what the
  dashboard is supposed to consume.
- **The client's ingestion layer discards it.**
  `packages/web-ui/src/app/utils/normalize.ts` coerces every API and stream
  payload into a renderable shape. `normalizeCapability` rebuilds a `Capability`
  from an explicit field list (`kind`, `access`, `valueType`, `name`, `property`,
  `unit`, `step`, `range`, `permittedValues`, `features`) that does not include
  `valueOn`/`valueOff`. `normalizeDeviceDescriptor` is applied to
  `device_appeared` frames and to room members.
- **The stream snapshot made that path universal.** The REST read path
  (`api.ts` → `data-store.tsx` `refresh()`) stores descriptors unnormalised, so
  they kept the encoding. `be3d0f1` gave the event stream a per-connection device
  snapshot that delivers the full device set as `device_appeared` frames, so on
  every connect the normalised copy replaces the unnormalised one for *every*
  device. That is the regression: one ingestion path became the only one.
- **The optimistic layer cannot reconcile.** `isLatest` in
  `packages/web-ui/src/app/lib/command-coalescing.ts` is `false` for a request
  once `advance()` has deleted its token, and
  `use-optimistic-property.ts` uses it as the guard on both the confirmation
  listener and the revert deadline. The room-batch path already does this
  correctly with a token comparison (`data-store.tsx` `clearOverride`), so the
  repository contains both patterns.
- **Constraints.** `web-ui` MUST NOT import `core` (not even `import type`), and
  `core` MUST NOT import `web-ui`; the boolean encoding rule has exactly one
  declaration site, `packages/shared/src/capabilities.ts`; a contract declared in
  `shared` must not be re-declared in a consumer (`scripts/guard-contracts.ts`,
  `scripts/contract-inventory.json`).

## Goals / Non-Goals

**Goals:**

- A descriptor reaches a control with the declared capability contract intact,
  whichever ingestion path it arrived on.
- An accepted command can no longer be one the device ignores: what reaches the
  transport expresses the requested state in the form the device declares.
- An optimistic value can no longer outlive its deadline or its confirmation, so
  the interface cannot report an actuation that did not happen.
- Both fixes are reachable by `bun test` at the pure/engine layer, because the
  web-ui suite has no DOM harness and cannot observe an interaction.
- The command endpoint's accepted body values stay backward compatible.

**Non-Goals:**

- Redesigning coalescing, the deadline rule, or the room-batch override.
- Changing the `Capability` contract, the `guard-contracts` inventory, or the
  validation *acceptance* rule (a real boolean stays accepted).
- Any view, tile, wall, or styling change; the defect is beneath all of them.
- Replacing the client's defensive normalisation with trusting the payload.

## Decisions

### D1 — Preserve the declared encoding in `normalizeCapability`, and pin the contract with a test

`normalizeCapability` gains the declared on/off values, defensively coerced the
way its siblings are: a `valueOn`/`valueOff` that is a string, number, or boolean
is copied; anything else falls back to absent, so the existing `?? true`/`?? false`
behaviour is unchanged for a genuinely absent declaration (Shelly, Nanoleaf,
state toggles).

*Why not fix only the control?* The control is a renderer over the capability it
receives. Making `CapabilityControl`/`deviceTile-state` re-derive an encoding, or
branch on the property name (`state` ⇒ `"ON"`), would put source-specific
knowledge in the client — which both modified requirements forbid and which the
existing code comments explicitly warn against. The field is present in the
payload; the ingestion layer is what loses it.

*Why not stop normalising devices?* The normaliser is the documented backstop for
malformed or unfamiliar payloads (`normalize.ts` header): a `null` field, a
mistyped value type, or a frame from a different engine version must produce a
renderable value rather than a throw inside a tile. Removing it trades a silent
drop for a render crash. The right fix is that ingestion does not *narrow* the
contract.

The deeper defect is that the copy is field-by-field, so the shape is declared a
second time in the client and can drift again. This design keeps that structure —
the fields are coerced, not passed through — and adds a test that asserts the
declared contract's fields survive ingestion, so the next field added to
`Capability` fails a test instead of reaching a user. Replacing the key list with
a contract-driven copy is left as an open question (D5, Open Questions) because it
is a refactor of the whole coercion layer, not of this defect.

### D2 — Translate an accepted boolean into the declared encoding at dispatch (engine, defence in depth)

Validation already accepts a real boolean for a boolean property, deliberately, so
that a caller with no source-specific knowledge (HomeKit, an automation, the API,
the CLI) can actuate any device. The dispatch step then publishes that value as
given. For a capability declaring `"ON"`/`"OFF"`, that publishes `true`, which
Zigbee2MQTT rejects; the acknowledgement the caller sees is real, and the device
never moves.

The engine therefore translates the command into the target capability's declared
encoding immediately before dispatch, through the same shared rule the rest of the
system uses (`composeBooleanCapabilityValue` in
`packages/shared/src/capabilities.ts`, already the single declaration site). The
per-property capability lookup is already available: `flattenByProperty` in
`packages/core/src/device-sources/command-validation.ts` walks nested `features`
and returns a property → capability map; it is exported for exactly this kind of
reuse and should be used rather than re-walked.

*Alternatives considered.* (a) **Tighten validation to reject a real boolean for a
capability that declares a string encoding.** Rejected: it matches a literal
reading of "a foreign encoding is rejected" but breaks every correct caller —
HomeKit (`homekit-descriptor-factory.ts` composes strings, but automations and
API users do not) and the CLI (`packages/cli/src/command-value.ts` parses a
command line, where `on=true` is the obvious spelling). It also converts a silent
failure into a hard one for callers that are behaving reasonably. (b) **Translate
in the HTTP handler.** Rejected: HomeKit reaches `AggregateDeviceSource.command`
without passing through the handler, so the same defect would survive there.
(c) **Translate in `AggregateDeviceSource.command`.** Rejected as the *only* place:
a source knows its own capabilities and any future transport adds its own payload
construction; the rule belongs where the payload is built. The shared helper makes
doing it in each source cheap and uniform.

Where this lands per source: `zigbee-source.ts` and `zigbee-group-source.ts`
publish `properties` straight through `mqtt.publishToDevice`, so they are the ones
that must translate; `state-source.ts`, `shelly-source.ts`, and
`nanoleaf-source.ts` already construct their own call from a typed boolean and
must be checked to confirm they express the capability's encoding (they do today,
because their capabilities declare `true`/`false`). The requirement is stated for
"any command that is accepted", so each source gets a test that asserts its
outgoing payload expresses the declared encoding.

### D3 — Reconcile on request identity, and attribute a device report by value

The hook's two guards ask `isLatest`, which conflates three questions: *is this
the newest request*, *is a newer one queued*, and *has this one been sent yet*.
After `advance()` the token is gone, so `isLatest` is `false` for the newest
request too, and both the confirmation and the deadline refuse to act.

The design separates the questions. `CommandCoalescer` gains the predicate the
hook actually needs — whether a *newer* request for the key exists, i.e. whether
this request has been superseded — and keeps `isLatest` for what it already
serves. The hook then reconciles on two rules:

- the **deadline** clears the override when it is still the newest request for
  that key, whether or not the send settled; `isSuperseded` keeps a superseded
  request's deadline from reverting a newer value;
- a **device report** clears the override only when it *confirms* it: the
  reported value for the property equals the value the newest request asked for.
  A `device_state` event carries no request token, so the report's value is the
  only thing that can tie it to a request. A report carrying any other value is a
  report for a superseded or ignored command; it MUST NOT move the control, and
  the newest request is left to its deadline.

Attribution is what makes the two requirements on a report compatible. "Reconcile
against the device's reported state when it arrives" and "a superseded
confirmation does not move the control" are otherwise contradictory for a report
whose value the newest request did not ask for: clearing on it snaps a drag
backwards to the value the user has already moved past. Attributing the report by
its value keeps the normal case — the device reports the state that was
requested — reconciling immediately, and keeps a stale or ignored report from
moving the control.

*Why not make `isLatest` remember the last settled token?* It would make the
method answer two different questions depending on history, and every existing
call site would silently change meaning. *Why not compare tokens only, dropping
the coalescer check?* A superseded request would then revert a newer value at its
own deadline — the reverse jump the spec's "superseded confirmation" scenario
exists to prevent. *Why not clear on any report?* It is what produced the
backwards snap: the confirmation for an intermediate value arrives before the
newest request's confirmation and moves the control to that intermediate value.

The room-batch override path is not touched: `clearOverride(key, token)` already
compares identity, and a room batch is a single request rather than a coalesced
drag, so its reconciliation stays as designed in D5.

### D4 — Test the pure layers, and state the manual verification

| Layer | Test | Asserts |
|---|---|---|
| `web-ui-normalize.test.ts` | pure | a `device_appeared` frame (and a room member's device) whose boolean capability declares string on/off retains `valueOn`/`valueOff`; a malformed declaration still degrades to absent |
| `command-coalescing.test.ts` | pure | after a send settles the newest request is not treated as superseded; a request with a queued successor is |
| `reconcile-report.test.ts` | pure | a report carrying the requested value confirms the override; a report carrying any other value does not |
| `device-source-zigbee.test.ts` (+ `-group`) | engine | a real boolean command publishes the capability's declared on/off value; a declared-value command is unchanged |
| manual | browser | toggle a string-encoded device from the dashboard **and** the wall: the device actuates, the control settles, and a command the device ignores reverts at its deadline |

The manual step is not decoration: `packages/web-ui/tests` is all source-text
assertions with no DOM harness, so no automated gate in this repository can
observe the interaction that broke. The two fixes chosen here are the parts that
*can* be pinned by `bun test`.

## Risks / Trade-offs

- **[A future declared capability field is dropped by the same normaliser the same
  way]** → the ingestion test asserts the contract's required fields for a
  stream-ingested descriptor; the structural fix is Open Question D5.
- **[Translation changes an outgoing payload for a device that genuinely accepts a
  real boolean]** → it applies only where the declared encoding differs from a
  real boolean; Shelly, Nanoleaf and state toggles declare `true`/`false` and are
  byte-for-byte unchanged, which their existing source tests assert.
- **[Restoring the deadline changes behaviour users have been living with]** → it
  is what `web-ui` "Device Control Interface" already requires, and it makes the
  single-device path agree with the room-batch path rather than introducing a new
  rule.
- **[The change is invisible to the workspace gate]** → `bun run typecheck && bun
  run check && bun run test` would pass both before and after; the added unit
  tests and the manual verification are the actual gates, and are tasks.
- **[Deployment observations mistaken for causes]** — the unticked manual
  verification on the Lumen change and the empty `HTTP_TOKEN` on the running
  instance are recorded in the proposal as separate concerns. Neither is a cause
  of this defect and neither is addressed here.

## Migration Plan

No data migration and no configuration change. `@ts-ha/web-ui` and `@ts-ha/core`
are published together; a client page reload picks up the client half, and the
engine half needs the normal engine restart. Rollback is reverting the two
changes. The persisted device-state file stores state and observation, not
capabilities, so it is unaffected; a client that has been running with a
normalised map simply starts receiving the declaration again on its next connect.

## Open Questions

- **Should the client's capability ingestion be derived from the declared contract
  rather than a hand-maintained key list?** The current structure is why this
  could drift silently, but replacing it touches every normalised payload (rooms,
  status, wall profiles) and is a refactor in its own right. Deferrable: the added
  test pins the regression meanwhile, and the specs, approach and task breakdown
  here do not depend on the answer.
