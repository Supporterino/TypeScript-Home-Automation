# Contributing

Contributions are welcome — bug reports, new device types, additional services, and documentation improvements.

---

## Development setup

**Requirements:** [Bun](https://bun.sh/) 1.x, an MQTT broker (Mosquitto).

```bash
git clone https://github.com/Supporterino/TypeScript-Home-Automation.git
cd TypeScript-Home-Automation

bun install
cp .env.example .env
# Edit .env with your MQTT broker details

bun run dev    # Start with hot-reload
```

---

## Commands

```bash
bun run dev             # Hot-reload development mode
bun run typecheck       # TypeScript type checking (tsc --noEmit)
bun run check           # Biome format + lint + import organise (auto-fix)
bun run build           # Build package to dist/
bun run build:web-ui    # Rebuild the web UI React frontend
bun test                # Run all tests
bun test --filter "name" # Run tests matching a pattern
```

Always run `bun run typecheck && bun run check && bun test` before opening a PR.

---

## Project conventions

Coding conventions, naming rules, test patterns, and import ordering are documented in [`AGENTS.md`](https://github.com/Supporterino/TypeScript-Home-Automation/blob/main/AGENTS.md) at the repo root. This file is the authoritative source for all code style decisions.

Key points:

- **Runtime:** Bun — use `Bun.serve()`, `bun:test`, `Bun.file()` etc.
- **Imports:** use `.js` extensions in relative imports; use `node:` prefix for Node built-ins
- **Formatting:** 2-space indent, 100-char line width, LF line endings (Biome enforces this)
- **Tests:** flat `tests/` directory, `*.test.ts` files, silent pino logger at module level

---

## Commit messages

This project uses Conventional Commits with Gitmoji:

```
feat: ✨ Add OpenWeatherMap weather service
fix(shelly): 🐛 Handle missing position field in cover status
docs: 📝 Add Nanoleaf pairing instructions
refactor: ♻️ Extract HTTP client retry logic
test: ✅ Add state trigger filter tests
```

| Prefix | Gitmoji | When |
|---|---|---|
| `feat:` | ✨ | New user-visible feature |
| `fix:` | 🐛 | Bug fix |
| `docs:` | 📝 | Documentation only |
| `refactor:` / `chore:` | ♻️ | Refactoring, deps, CI |
| `test:` | ✅ | Adding or updating tests |

---

## Adding a new device type

1. Identify the device's Zigbee2MQTT payload schema from [the z2m device page](https://www.zigbee2mqtt.io/supported-devices/)
2. Add types to the appropriate file in `src/types/` (brand-specific types) or extend a generic type
3. Export the new types from `src/index.ts`
4. Add an entry to `docs/device-types.md`

---

## Adding a new service

1. Create `src/core/services/<name>-service.ts` implementing the service class
2. Inject it via `createEngine()` options following the existing pattern (see `ShellyService` or `NanoleafService`)
3. Expose it on `this.<name>` inside automations via `_inject()`
4. Add a service documentation page under `docs/services/`
5. Export relevant types from `src/index.ts`

---

## Reporting issues

Please open an issue on [GitHub](https://github.com/Supporterino/TypeScript-Home-Automation/issues) with:

- Bun version (`bun --version`)
- Node/OS information
- Minimal reproduction case
- Expected vs actual behaviour
