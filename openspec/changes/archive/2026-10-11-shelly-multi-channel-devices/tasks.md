## 1. Types and Contracts

- [x] 1.1 Add a component-inventory response type (`ShellyComponentsStatus`) covering `switch:N` / `cover:N` entries with key, channel, kind, configured name, and status in `packages/shared/src/types/shelly.ts`, and add an optional `channel` field plus effective component `type` to the service's `ShellyDevice` record in `packages/core/src/services/shelly-service.ts`; verify `bun run typecheck` passes.
- [x] 1.2 Verify the inventory type is re-exported where Shelly types are surfaced and that both `switch` and `cover` component entries type-check; verify `bun run typecheck`.

## 2. ShellyService Channel Support

- [x] 2.1 Add an internal (non-public) channel-registration path that materializes a channel-scoped device record carrying its `channel` and effective kind, held in a separate internal map so `getDevices()` stays registration-only, leaving the public `register()` overloads and `registerMany` signatures unchanged; verify existing single-component registration tests still pass.
- [x] 2.2 Keep the base registration as the inventory/device-level record; verify `getDeviceInfo`/`getSysStatus`/`reboot` still resolve against it and are channel-independent.
- [x] 2.3 Verify the internal channel-registration path does not re-fire `onDeviceRegistered` listeners, so discovery → registration cannot loop; verify a test.
- [x] 2.4 Thread the record's channel into switch RPC params (`id`) instead of the hardcoded `0` in `turnOn`/`turnOff`/`toggle`; verify a test asserts `id: 2` for a channel-2 record and `id: 0` for a default record.
- [x] 2.5 Thread the channel into cover RPC params for open/close/stop/go-to-position/relative/calibrate; verify a test asserts the channel id is sent.
- [x] 2.6 Thread the channel into `getStatus`/`getConfig` (component-scoped), leaving `getDeviceInfo`/`getSysStatus`/`reboot` device-scoped; verify tests distinguish the two scopes.
- [x] 2.7 Add a component-discovery method that calls `Shelly.GetComponents` over the device's transport with `include: ["status", "config"]`, **paging on `offset` until `offset + returned >= total`**, and returns recognized switch/cover components with channel, kind, configured name, and metering; verify a test covers a 4-switch response spanning two pages, a mixed switch/cover response, and a malformed/empty response.
- [x] 2.8 Verify MQTT RPC requests carry the channel in `params.id`; verify a test asserts the published frame for a non-zero channel.

## 3. ShellyDeviceSource Fan-Out

- [x] 3.1 Make `start()` await component discovery for every already-registered device before returning; verify enumeration is complete after `start()` resolves.
- [x] 3.2 Omit a device from `list()`/`get()` until its discovery resolves; discover a device registered after startup asynchronously and materialize it when resolved; verify a test that a device is absent before discovery and present after.
- [x] 3.3 Replace the per-name `tracked`/subscription keying with per-channel-entry keying; verify all existing single-device tests pass unchanged.
- [x] 3.4 Expand one registration into one channel-scoped service record per discovered component, excluding the base registration from enumeration when it expands into more than one channel; verify a 4-switch device yields four descriptors and a single-switch device yields exactly one (the base).
- [x] 3.5 Assign stable per-channel identities: single component → base name; multiple → configured name when present and unique across all registered devices, else `<base>_<channel>`, disambiguating collisions by channel; verify tests for each case, including the same configured name on two different devices.
- [x] 3.6 Generalize `handleNotifyStatus` to update every recognized `switch:N`/`cover:N` key present in a notification; verify a test that a `switch:2` notification updates only channel 2's logical device.
- [x] 3.7 Make HTTP polling fetch each component channel's status independently and normalize it into that channel's entry; verify a test with a 4-channel HTTP device populates all four.
- [x] 3.8 Route commands from a logical descriptor to the correct channel through `ShellyService` by resolving the channel entry; verify a test that a channel-1 command reaches channel 1 only.
- [x] 3.9 Handle removed channels: keep entries for channels absent from a later inventory and mark them unreachable (chosen default); verify a test covers a channel disappearing between discoveries.
- [x] 3.10 Reject commands naming the base registration of an expanded multi-component device (not found) while device-level queries still resolve against it; verify a test that a base-name command is rejected and channel commands succeed.

## 4. Capabilities and HomeKit Projection

- [x] 4.1 Extend `shellyCapabilitiesFor` to describe a single component channel (kind + that channel's metering), taking `outlet` from the registration type and switch/cover from discovery; verify metered vs non-metered and switch-vs-outlet channel tests.
- [x] 4.2 Confirm HomeKit fan-out produces one accessory per channel via existing descriptor plumbing with distinct persistence keys (`shelly:<id>`); verify a 4-switch device yields four accessories and that a component rename yields a new accessory (documented re-pair).

## 5. Documentation and Spec Sync

- [x] 5.1 Update `docs/services/shelly.md` with multi-component registration, per-channel addressing, awaited discovery, the identity scheme (single vs multi, fallback/collision), and the component-rename consequence.
- [x] 5.2 Sync the `shelly-service`, `device-sources`, and `shelly-multi-channel` main specs from the deltas after implementation; verify `openspec validate shelly-multi-channel-devices --strict` still passes.

## 6. Verification

- [x] 6.1 Run `bun run typecheck && bun run check && bun run test`; verify all pass with no regressions.
- [x] 6.2 Verify end-to-end that a simulated multi-component device (HTTP and MQTT) is enumerated per channel, each channel controls and reports state independently, and a single-component device is unchanged.
