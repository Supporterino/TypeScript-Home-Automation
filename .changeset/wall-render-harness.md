---
"@ts-ha/web-ui": patch
---

Change the shipped frontend assets with no exported API change.

The dashboard's data layer gains an explicit fixture seam, and the wall's weather
and energy widgets prefer a caller-supplied reading over their own fetch, so the
assets compiled into the package by `prepublishOnly` change. The development-only
wall render harness under `wall/harness/**` is not an entrypoint of the shipped
build and contributes no asset.
