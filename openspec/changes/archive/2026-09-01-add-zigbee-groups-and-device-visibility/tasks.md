## 1. Zigbee group discovery

- [x] 1.1 Add `ZigbeeGroup` to `src/types/zigbee/bridge.ts` (`id: number`,
  `friendly_name: string`, `members: { ieee_address: string; endpoint: number }[]`)
  and verify `bun run typecheck` passes with the type exported from the barrel it
  belongs to
- [x] 1.2 Subscribe `{prefix}/bridge/groups` in `DeviceRegistry.start()` and
  unsubscribe in `stop()`, and verify a test asserting both topics are subscribed
  and released
- [x] 1.3 Implement `handleBridgeGroups()` diff-reconciliation (add, update in
  place, remove missing) into a `groups: Map<number, ZigbeeGroup>`, and verify tests
  covering a group added, a group removed, and a group's members changing
- [x] 1.4 Guard malformed group payloads — non-array payload and entries with a
  non-numeric `id` or non-string `friendly_name` — and verify tests asserting a
  warning is logged, tracked groups are unchanged, and nothing throws (D1, spec
  "Group Discovery")
- [x] 1.5 Add `getGroups()` / `getGroup(id)` read accessors and `onGroupsChanged`
  listener registration, and verify a test that the listener fires once per
  `bridge/groups` message that changes the set
- [x] 1.6 Add a `groups` key to the registry snapshot in `save()`/`load()`,
  treating a missing key as empty, and verify tests that groups round-trip and that
  a snapshot written without `groups` loads with no error and no groups (D6)

## 2. Zigbee group device source

- [x] 2.1 Implement capability intersection in a pure, separately testable function
  (property present on every member, compatible `valueType` and `access`,
  intersected numeric `range` and enum `permittedValues`, matching `valueOn`/
  `valueOff`), and verify unit tests for identical members, a mixed group losing a
  property, a narrowed range, an empty range intersection dropping the property,
  and members with no shared property yielding `[]` (D3)
- [x] 2.2 Implement state derivation in a pure, separately testable function
  (any-on for booleans, mean over members currently on for numerics, omit when no
  member reports the property), and verify unit tests for any-on, all-off,
  averaging that excludes off members, and an omitted underivable property (D4)
- [x] 2.3 Create `src/core/device-sources/zigbee-group-source.ts` with
  `ZIGBEE_GROUP_SOURCE_ID = "zigbee-group"`, identity `String(group.id)`,
  `displayName` from `friendly_name`, `reachable: true`, push observation, and
  verify a test that `qualifiedId` is `zigbee-group:<id>` and survives a rename of
  the group (D2)
- [x] 2.4 Implement `list()` and `get()` over the registry's tracked groups, and
  verify tests that every tracked group is enumerated and that an unknown id
  returns undefined
- [x] 2.5 Implement the IEEE → group-ids index, rebuilt on `onGroupsChanged`, and
  per-member state subscription resolving IEEE to friendly name through the
  registry, and verify a test that a member state change recomputes only the groups
  containing that member and notifies once per affected group (D4)
- [x] 2.6 Implement `command()` — validate against the intersected capabilities,
  then publish once to the group's friendly name — and verify tests that one
  publish occurs (not one per member), that an undeclared property is rejected as
  invalid with nothing published, and that group state is not written
  optimistically (D5)
- [x] 2.7 Implement `available` as false when the registry is disabled, and verify
  a test that enumeration succeeds and returns no groups with the registry disabled
- [x] 2.8 Expose member qualified ids as metadata on the group descriptor without
  adding a parent/child relationship to `DeviceDescriptor`, and verify a test that
  the group carries its members' qualified ids and member descriptors are unchanged
  (D14)

## 3. Device visibility core

- [x] 3.1 Create `src/core/device-visibility.ts` with `HIDDEN_PREFIX =
  "$internal:hidden:"`, `hiddenKey(qualifiedId)`, `hide()`, `unhide()`,
  `isHidden()`, `listHidden()` over `setInternal`/`deleteInternal`/`keysInternal`,
  and verify tests for persistence across a reload, idempotent hide and unhide,
  absence meaning visible, and hiding a qualified id the system does not know (D7)
- [x] 3.2 Add `onChange(listener)` to `DeviceVisibility` emitting
  `{ qualifiedId, hidden }`, with per-listener try/catch, and verify a test that a
  listener that throws does not prevent others from being notified
- [x] 3.3 Verify that a qualified id containing a colon — a state toggle key —
  round-trips through `hiddenKey` and prefix-slicing in `listHidden()`, with a test
  asserting the recovered id matches
- [x] 3.4 Add `hidden: boolean` to `DeviceDescriptor` in `device-source.ts` and
  update all in-tree sources and test fixtures, and verify `bun run typecheck`
  passes
- [x] 3.5 Give `AggregateDeviceSource` a `DeviceVisibility` dependency and stamp
  `hidden` in `list()`, `get()`, and `notify()`, and verify tests asserting the
  field is correct on all three paths — including a subscription delivery, which is
  the path that bypasses `list()` (D8)
- [x] 3.6 Add `listVisible()` to `AggregateDeviceSource`, and verify tests that
  `list()` includes hidden devices and `listVisible()` excludes them (D9)
- [x] 3.7 Register `ZigbeeGroupDeviceSource` as the fifth source and construct
  `DeviceVisibility` between `StateManager` and `AggregateDeviceSource` in
  `createEngine()`, updating the ownership comment in `aggregate.ts`, and verify an
  engine-level test that group devices appear in the aggregate and hidden devices
  are stamped
- [x] 3.8 Confirm `RoomManager` and `device-event-bridge` still use total
  enumeration, and verify tests that hiding a device emits no `device_disappeared`
  and leaves its room membership intact (D9)

## 4. HomeKit

- [x] 4.1 Switch `DeviceCatalogSource` to `devices.listVisible()` in `start()` and
  `reconcileRemovals()`, and verify a test that an already-hidden device is never
  bridged at startup
- [x] 4.2 Give `DeviceCatalogSource` a `DeviceVisibility` dependency and subscribe
  `onChange` to add or remove the affected accessory, and verify tests that hiding
  removes the accessory with no intervening device notification and unhiding adds
  it back (D10)
- [x] 4.3 Verify accessory identity is unchanged across a hide/unhide cycle with a
  test asserting the re-added accessory's derived UUID matches the original, so no
  re-pairing is required
- [x] 4.4 Verify a group with mappable capabilities is bridged and commanding it
  dispatches one group command, and that a group whose intersected capabilities map
  to no HomeKit service is skipped and logged, with tests for each

## 5. HTTP and event stream

- [x] 5.1 Add hide and unhide endpoints addressed by a single percent-encoded
  qualified-id path segment, and verify tests for success, idempotency, an
  identifier containing a colon, and an unknown identifier succeeding
- [x] 5.2 Confirm `GET /api/device-catalog` continues to return hidden devices, now
  carrying `hidden`, and verify a test asserting hidden devices are present and
  marked (D9)
- [x] 5.3 Add `device_visibility` to the server-side `StreamEvent` union and emit
  it from the engine on `DeviceVisibility.onChange`, and verify a test that the
  event carries the qualified id and new visibility and that no state-key event is
  emitted for the reserved key (D11)
- [x] 5.4 Document the new endpoints in the `http-server.ts` route list comment and
  verify the comment matches the registered routes

## 6. Web UI

- [x] 6.1 Add `hidden` to the client `DeviceDescriptor` re-export and
  `device_visibility` to the client `StreamEvent` union, and verify
  `bun run build:web-ui` succeeds
- [x] 6.2 Handle `device_visibility` in `data-store.tsx` `applyEvent()` by setting
  `hidden` on the stored descriptor, and verify a test that a second client's
  change updates the store without a refetch
- [x] 6.3 Add hide and unhide calls to `app/api.ts` and expose them through the
  data store, and verify the store updates optimistically and reconciles on the
  resulting event
- [x] 6.4 Add a session-scoped "Show hidden" toggle alongside the existing
  operable-only filter in `DashboardView`, `DevicesView`, and `RoomView`, filtering
  hidden devices out by default, and verify the toggle resets on reload (D12)
- [x] 6.5 Visually distinguish revealed hidden devices in `DeviceTile`, and add a
  hide/unhide action to the tile and the device detail view that never exposes a
  qualified id
- [x] 6.6 Extend the existing `genuinelyEmpty` / `filteredEmpty` empty states to
  name hiding as the cause, and make member counts in `Nav` reflect what is visible
  under the current filters, and verify tests for an all-hidden room reporting its
  devices as hidden rather than absent
- [x] 6.7 Mark group devices as groups in listings and show a group's members in
  its detail view with links to each member, including hidden members, and verify
  a group offers only its intersected controls

## 7. Verification

- [x] 7.1 Run `bun run typecheck && bun run check && bun test` and verify all pass
- [x] 7.2 Run `openspec validate add-zigbee-groups-and-device-visibility --strict`
  and verify it reports the change as valid
- [ ] 7.3 Verify end to end against a live Zigbee2MQTT instance: a multi-bulb group
  appears as one device, hiding its members removes them from the dashboard and
  from the Home app without a restart, the group's on/off and brightness track the
  bulbs, and commanding the group changes all bulbs together
- [ ] 7.4 Verify a restart with `DEVICE_REGISTRY_PERSIST` enabled restores groups
  and hidden flags before the bridge republishes, and that an upgrade from a
  snapshot without a `groups` key succeeds
