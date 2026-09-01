## 1. Boolean encoding in the vocabulary

- [x] 1.1 Add the optional on/off value fields to `Capability` in
  `src/types/capabilities.ts`, documenting that absence means a real JSON boolean
  (design D1); verify `bun run typecheck` passes with no consumer changes yet.
- [x] 1.2 Add a pure helper pair beside the vocabulary — read a reported value to
  a boolean, and compose a command value from a boolean — both defaulting to
  `true`/`false` when the capability declares nothing (design D1); verify new
  cases in `tests/capabilities.test.ts` cover declared string encoding, declared
  boolean encoding, and the absent-declaration default.
- [x] 1.3 Populate the new fields in `mapZ2MExpose` from the published
  `value_on`/`value_off`, leaving them absent when the expose omits them (design
  D2, R1); verify `tests/capabilities.test.ts` asserts a binary expose declaring
  `"ON"`/`"OFF"` maps to a capability declaring those same two values, and that an
  expose omitting them maps to a capability declaring neither.
- [x] 1.4 Verify the Zigbee source's derived descriptions carry the encoding
  end-to-end by extending `tests/device-source-zigbee.test.ts` with a device whose
  binary expose declares string on/off values.

## 2. Command validation against the declaration

- [x] 2.1 Replace the hardcoded `"ON"`/`"OFF"` special case in
  `src/core/device-sources/command-validation.ts` with validation against the
  target capability's declared values, still accepting a real boolean regardless
  of declared encoding (design D3); verify the existing command-validation tests
  pass unchanged.
- [x] 2.2 Add cases verifying a value in the declared encoding is accepted, a
  value in a foreign encoding is rejected with a descriptive error, and a Shelly
  boolean property now rejects `"ON"` where it previously accepted it.

## 3. Sources declare their encoding

- [x] 3.1 Declare explicit boolean encoding on the authored capabilities in
  `shelly-capabilities.ts`, `nanoleaf-source.ts`, and `state-source.ts` (design
  D1); verify `tests/device-source-shelly.test.ts`,
  `tests/device-source-nanoleaf.test.ts`, and `tests/device-source-state.test.ts`
  assert the declaration is present in each emitted descriptor.

## 4. Web UI reads and writes booleans correctly

- [x] 4.1 Replace `Boolean(value)` in the boolean branch of
  `CapabilityControl.tsx` with the D1 read helper, so a device reporting a string
  off value displays as off.
- [x] 4.2 Replace the raw JSON boolean sent on toggle with the D1 compose helper,
  so the command carries the capability's declared off/on value.
- [ ] 4.3 **Verify against real hardware**: toggling a Zigbee light in the web UI
  turns the physical light off and on, and the switch settles in the correct
  state rather than reverting. This is the reported bug; do not proceed past this
  group until it is confirmed fixed (design — Migration Plan, step 3).
- [ ] 4.4 Confirm from the same hardware check whether real z2m binary exposes
  reliably publish `value_on`/`value_off`; if they do not, change the Zigbee
  mapper's fallback per design R1 and note it in the design's risk entry.

## 5. Output-kind ranking and filtering

- [x] 5.1 Add the exported `OUTPUT_KINDS` set to
  `src/core/web-ui/app/lib/capability-ranking.ts` (design D4).
- [x] 5.2 Gate only the enum and numeric fall-through branches of
  `selectPrimaryAction` on the candidate belonging to an output-kind capability,
  leaving the named branches ungated (design D4); verify new
  `tests/capability-ranking.test.ts` cases assert a motion sensor with a writable
  sensitivity enum yields no primary action, an enum-only actuator inside an
  output-kind container still yields one, and every existing ranking case is
  unchanged.
- [x] 5.3 Add a pure `isOperableDevice` predicate derived from the same set, and
  verify a test asserts it agrees with `selectPrimaryAction` returning non-null
  across the ranking fixtures — the equivalence the spec guarantees (design D4).
- [x] 5.4 Add the session-scoped "operable only" toggle to `DashboardView` and
  `DevicesView` as local component state, defaulting to showing all devices
  (design D5); verify by reloading the dashboard that the filter resets.
- [x] 5.5 Give the filtered-empty collection its own message, distinct from the
  genuinely-empty one (design R5).

## 6. Room presentation

- [x] 6.1 Add an optional action slot to `DeviceTile`, rendered in a corner
  without disturbing the existing whole-surface click target or the
  `stopPropagation` island around the control (design D6); verify the Dashboard
  renders unchanged when no action is passed.
- [x] 6.2 Add an unavailable variant to `DeviceTile` rendering the qualified
  identifier and an unavailable marker, with no control and no state readout
  (design D6).
- [x] 6.3 Replace `RoomView`'s `Stack`/`Group` member list with a `SimpleGrid`
  using the same column breakpoints as `DashboardView`, and remove the hardcoded
  260px tile width.
- [x] 6.4 Render unavailable members through the `DeviceTile` unavailable variant,
  deleting the parallel `Paper` render path, and update the file's header comment
  which currently documents that path as deliberate.
- [x] 6.5 Add room-level edit mode as local component state that reveals the
  unassign action in every member tile's slot, including unavailable members
  (design D7); verify the action is operable by tap with no hover interaction.
- [x] 6.6 Apply the operable-only filter to the room view's members as well, using
  the same predicate.

## 7. Verification

- [x] 7.1 Run `bun run typecheck && bun run check && bun test` and confirm all
  pass.
- [ ] 7.2 Walk each scenario added to the `web-ui` and `device-sources` delta
  specs against the running dashboard and confirm the observable behaviour
  matches — in particular the two string-encoded boolean scenarios, the sensor
  configuration scenario, and the filter reset-on-reload scenario.
- [ ] 7.3 Confirm HomeKit behaviour is unchanged: the existing HomeKit tests pass
  and a paired on/off accessory still actuates (design R3 keeps its special case
  in place deliberately).
- [ ] 7.4 Resolve the design's open question on `climate` in the filter set from
  the real device list, and record the answer in design.md.
