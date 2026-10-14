---
"@ts-ha/core": patch
---

Dispatch an accepted boolean command in the capability's declared on/off
encoding.

The two Zigbee sources translate an accepted real boolean into the target
capability's declared `valueOn`/`valueOff` before dispatch, through the shared
`composeBooleanCapabilityValue` rule. A real boolean sent to a string-encoded
device (a Zigbee2MQTT lamp declaring `"ON"`/`"OFF"`) is no longer published
verbatim and silently ignored; a value already in the declared encoding is
unchanged, and a source whose declared encoding is already a real boolean
(`true`/`false` — Shelly, Nanoleaf, state toggles) is byte-for-byte unchanged. A
real boolean stays accepted, so existing callers — HomeKit, automations, the
API, the CLI — keep working.
