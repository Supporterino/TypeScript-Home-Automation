---
"@ts-ha/web-ui": patch
---

Preserve a capability's declared on/off encoding through dashboard ingestion and
reconcile a settled command.

The dashboard's descriptor normaliser now carries `valueOn`/`valueOff` through
`normalizeCapability`, so every device — including those delivered by the event
stream's per-connection device snapshot — keeps the encoding its capability
declares, and a control no longer misreads a reported `"ON"` or composes a bare
`true`. The optimistic override now reconciles a device report by the value it
carries — it clears the override only when that value matches what the newest
request asked for — and reverts an unconfirmed command at its deadline by
request identity, instead of gating both on whether the send is still in
flight. A command that is neither confirmed nor rejected within its deadline
therefore reverts instead of reporting an actuation that did not happen.
