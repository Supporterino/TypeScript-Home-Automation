# @ts-ha/web-ui

The TypeScript Home Automation web dashboard: a service plugin that registers
the shell, assets, PWA routes, and authentication on the engine's HTTP server,
plus the React + Mantine browser application.

Depends on `@ts-ha/shared` only; it implements the engine's plugin contract
structurally and never imports `@ts-ha/core`.

Part of the [TypeScript Home Automation](https://github.com/Supporterino/TypeScript-Home-Automation)
workspace. Licensed under GPL-3.0-only.
