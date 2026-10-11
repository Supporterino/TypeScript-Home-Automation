---
"@ts-ha/core": minor
"@ts-ha/shared": minor
---

Enumerate multi-channel Shelly devices as one logical device per switch/cover
component.

- `@ts-ha/shared`: wire contracts for the Shelly component inventory
  (`ShellyComponentKind`, `ShellyComponentStatus`, `ShellyComponentsStatus`,
  `ShellyDiscoveredComponent`)
- `@ts-ha/core`: component discovery via paged `Shelly.GetComponents`, fanning a
  multi-channel device out into one channel-scoped descriptor per switch/cover
  component with per-component metering, and MQTT-first startup so discovery can
  reach a live client
