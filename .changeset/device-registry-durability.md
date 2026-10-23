---
"@ts-ha/core": patch
---

Make the Zigbee device registry snapshot survive a torn write, and stop an empty
registry from erasing last-known device state.

- The registry snapshot is now written through the shared atomic temp-file /
  `fsync` / `.bak` / rename path, and recovered from `device-registry.json.bak`
  when the primary is torn or invalid; a single unserializable or malformed
  entry is skipped instead of discarding the whole snapshot.
- The Zigbee device and group sources seed a descriptor's state from the durable
  device-state store when the registry has no state for it, carrying the stored
  observation, and a group reports an observation no newer than its oldest
  member, so a first enumeration with an empty registry records the restored
  last-known state rather than clearing it.
- Startup reconciliation prunes stored device-state records only once the owning
  source has received its authoritative device list, so a transiently empty or
  stale Zigbee registry cannot wipe the store before that seed is read; a device
  removed while the engine was stopped is still pruned when the retained list
  arrives. The readiness signal is an optional `hasEnumerated` member on
  `DeviceSource` — omitted means not-yet-enumerated, so existing implementations
  keep compiling — and the aggregate's per-source status reports it as an
  additive `boolean` field. The registry also signals an applied authoritative
  device or group list, which sources expose as an optional `onDeviceSetChanged`
  callback, so removals and group-list changes reconcile and prune immediately.
