# AGENTS.md — TypeScript Home Automation

A lightweight, fully typed home automation framework built on MQTT and Bun. This
repository is a Bun workspace of four independently published packages under
`packages/`; it ships as npm packages (`@ts-ha/core`, `@ts-ha/cli`, …) and runs
from source with `ts-ha run`.

This file is the authoritative reference for cross-package boundaries, coding
conventions, and agent decision-making. Read it first, then the package or
document it points to.

---

## Packages

| Package | Responsibility |
|---|---|
| `@ts-ha/shared` | Domain/wire contracts, contract constants, pure helpers, and pure browser-safe validation schemas (no runtime deps beyond a pure validator) |
| `@ts-ha/core` | Engine, services, device sources, HTTP server, MQTT, state, scheduling |
| `@ts-ha/web-ui` | Hono routes + React/Tailwind app + compiled asset manifest |
| `@ts-ha/cli` | `DebugClient`, OpenTUI dashboard, target config, and `ts-ha run` |

Dependency direction is one-way: `shared` ← `core`, `shared` ← `web-ui`,
`cli` → {`core`, `shared`}. `core` never references `web-ui`; `web-ui` never
references `core` (not even `import type`). `scripts/guard-deps.ts` enforces this.

Each package owns its `package.json`, `tsconfig.json`, `tsconfig.build.json`, and
test scope. Its `exports` map carries a `development` condition resolving to
`src` (build-free dev/test) and a default resolving to `dist` (publish). A custom
condition is selected only when passed explicitly — `bun --conditions=development`
and `bun test --conditions=development` — and `tsc` selects it via
`customConditions: ["development"]` (there is no `tsc --conditions` flag).

---

## Docs Index

Read the referenced document before touching the relevant surface. Reference
material lives in `docs/` and `openspec/specs/`, not inline here.

| Fact / surface | Canonical source |
|----------------|------------------|
| Architecture map, data flow, package boundaries | `docs/architecture.md` |
| Configuration and the full env schema | `docs/configuration.md`, `packages/core/src/config.ts` |
| HTTP API reference (routes, SSE events, auth) | `docs/api-reference.md` |
| Writing automations | `docs/writing-automations.md` |
| Device base classes, device types, device registry | `docs/device-classes.md`, `docs/device-types.md`, `docs/device-registry.md` |
| Services and custom service plugins | `docs/services/`, `docs/service-plugins.md` |
| State management and the reserved namespace | `docs/state.md` |
| CLI reference | `docs/cli.md` |
| Deployment and operations | `docs/deployment.md` |
| Capability inventory (which specs exist) | `openspec/specs/` — enumerate via `openspec list` |
| TypeScript bar | `.opencode/bars/typescript.md` |
| Security bar | `.opencode/bars/security.md` |
| Dependency direction and shared contracts | `scripts/guard-deps.ts`, `scripts/guard-contracts.ts`, `scripts/contract-inventory.json` |
| Human overview, quickstart, install | `README.md` |

**Single source of truth per fact:** the architecture is `docs/architecture.md`,
the capability inventory is `openspec/specs/`, and the tech stack is the root
`README.md`. All other documents link to these rather than restating them; when
two documents disagree, the canonical source named above is authoritative.

---

## Agent Responsibilities & Boundaries

### When to Modify Which Package

| Trigger | Package(s) | Action |
|---------|------------|--------|
| New or changed cross-package contract (type, constant, validation schema) | `shared` | Declare it once under `packages/shared/src`; update `scripts/contract-inventory.json` if it is a tracked contract |
| Engine behaviour, service, device source, HTTP route, MQTT, state, scheduling | `core` | Modify the owning subfolder; keep it free of any `web-ui` reference |
| Dashboard route, React/Tailwind view, asset manifest | `web-ui` | Modify `src/` (server) or `src/app/` (frontend); never import `@ts-ha/core` |
| CLI command, `DebugClient`, dashboard, target config | `cli` | Add a command under `src/commands/`; reuse `DebugClient` and the shared schemas |
| Guard scripts, dev script, contract inventory | `scripts/` | Update and re-run `bun run check` |
| Example automations | `docs/examples/` | Add/modify a type-checked example (compiled against core source) |
| User-facing documentation | `docs/` | Edit the relevant page and keep the `docs/zensical.toml` nav in sync |
| Design-system page | `design-system/` | Edit the relevant page under `design-system/ts-ha/` |

### Core Rules

1. **Do not invent architecture.** Infer and align with existing patterns in each package.
2. **Respect the dependency direction.** `shared` ← `core`, `shared` ← `web-ui`, `cli` → {`core`, `shared`}. Never add a `core` ↔ `web-ui` edge.
3. **Keep shared contracts single-source.** A contract declared in `@ts-ha/shared` is never re-declared in a consumer; a re-export shim is fine.
4. **Prefer modifying existing modules** over creating new ones. Only create a new module for a genuinely new domain concept.
5. **Keep changes minimal, composable, and testable.** Avoid sweeping refactors when a targeted fix suffices.
6. **Always use `.js` extensions** in relative imports and the `node:` prefix for Node built-ins.
7. **Ensure backward compatibility** unless the task explicitly requests a breaking change. Add fields, deprecate before removing; record published-package changes with a Changeset.
8. **Never commit secrets or credentials.** `.env` is git-ignored; `.env.example` lists defaults only.
9. **Stay in OpenCode** for normal work.

### Cross-Package Change Checklist

When implementing a change that spans packages, read `docs/architecture.md` and
the relevant `openspec/specs/<capability>/spec.md` before starting, then:

- [ ] Shared contract added/changed in `packages/shared/src` (declared exactly once)
- [ ] `scripts/contract-inventory.json` updated if a tracked contract was added, renamed, or moved
- [ ] Core updated (owner of engine behaviour)
- [ ] Web UI server routes / React app updated if the surface changed
- [ ] CLI command / `DebugClient` / resource mapping updated if it consumes the contract
- [ ] `docs/` page(s) updated and `docs/zensical.toml` nav synced if user-facing behaviour changed
- [ ] `bun run typecheck` passes (every package + `docs/examples`)
- [ ] `bun run check` passes (Biome + `guard-contracts` + `guard-deps`)
- [ ] `bun run test` passes
- [ ] `bun run build` passes if the change affects the build
- [ ] A Changeset is added for a published-package change

---

## Build / Lint / Test Commands

```bash
bun install                  # Install workspace dependencies
bun install --frozen-lockfile # CI-style install (no lockfile mutation)
bun run dev                  # Workspace dev: build UI once, watch frontend, run engine --hot
bun run start                # Production run (ts-ha run)
bun run typecheck            # Every package's tsc --noEmit + docs/examples
bun run check                # Biome + guard-contracts + guard-deps
bun run format               # Format only
bun run lint                 # Lint only
bun run build                # Build every package in dependency order (shared → core/web-ui → cli)
bun run --filter @ts-ha/web-ui build:web-ui   # Build only the React web UI frontend
bun run --filter @ts-ha/web-ui harness        # Dev-only wall render harness; no engine, broker, or profile
bun run test                 # Run every package's tests in its own directory
bun run --filter @ts-ha/core test             # Run one package's tests
bun test packages/core/tests/state-manager.test.ts --conditions=development  # One test file
bun test --conditions=development --filter "topicMatches"                    # Filter by name
```

**Before committing, always run `bun run typecheck && bun run check && bun run test`.**

Other scripts: `format:check`, `lint:fix`, `docker:build/up/down`, `version`,
`publish` (Changesets).

### Build details

- **`typecheck`**: runs each package's `tsc --noEmit` (web-ui runs both its server
  and its nested app config) plus `tsc -p docs/examples/tsconfig.json --noEmit`.
  It does **not** trigger any asset build.
- **`build`**: runs each package's `build` in dependency order. `@ts-ha/web-ui`'s
  `build` emits its asset manifest first (its `prebuild`/`prepublishOnly` hooks)
  and then `tsc`, so its server modules compile against the generated manifest.
  Each package emits `dist/` with declarations and source maps.
- **`build:web-ui`**: lives in `@ts-ha/web-ui` and compiles `packages/web-ui/src/app/`
  (React + Tailwind CSS v4) via `Bun.build` into generated string constants under
  `packages/web-ui/src/assets/` (git-ignored). It passes `conditions: ["development"]`
  to `Bun.build` so the bundle resolves `@ts-ha/shared` to source with no prior build.
- **Test runner**: `bun test` (uses `bun:test`), not Jest/Vitest. Tests live in each
  package's `tests/` directory and run from that package with `--conditions=development`.

## Runtime & Module System

- **Runtime:** Bun (not Node.js) — use `Bun.serve()`, `bun:test`, etc.
- **Module system:** ESM (`"type": "module"`)
- **TypeScript target:** ESNext with `"moduleResolution": "bundler"`
- **Always use `.js` extensions** in relative imports: `from "./automation.js"`
- **Use `node:` prefix** for Node built-ins: `from "node:fs/promises"`

## Project Structure

- `packages/shared/src/` — `@ts-ha/shared`: contract types, contract constants
  (`SESSION_COOKIE`, `INTERNAL_STATE_PREFIX`), pure capability helpers, pure
  browser-safe validation schemas, and the `types/` subpaths
  (`@ts-ha/shared/types[/...]`). No `node:` builtins; the only runtime is a pure
  validator (`zod`).
- `packages/core/src/` — `@ts-ha/core`, organised into subfolders by responsibility:
  - `engine.ts`, `automation.ts`, `automation-manager.ts`, `room-manager.ts`, `device-visibility.ts`, `config.ts` — glue layer (flat)
  - `mqtt/` — `mqtt-service.ts`, `mqtt-utils.ts`
  - `http/` — `http-server.ts`, `http-client.ts`, `event-stream.ts`, `utils.ts`
  - `scheduling/` — `cron-scheduler.ts`
  - `state/` — `state-manager.ts`
  - `logging/` — `log-buffer.ts`
  - `observability/` — `execution-recorder.ts`, execution context
  - `events/` — `event-bus.ts`
  - `services/` — `shelly-service.ts`, `nanoleaf-service.ts`, `ntfy-notification-service.ts`, `open-meteo-service.ts`, `openweathermap-service.ts`, `homekit-service.ts`, `service-registry.ts`, `service-plugin.ts`
  - `devices/` — `aqara-h1-automation.ts`, `ikea-styrbar-automation.ts`, `ikea-rodret-automation.ts`
  - `device-sources/` — the source-neutral `DeviceSource` abstraction spanning Zigbee, Shelly, Nanoleaf, and state toggles (`device-source.ts`, `qualified-id.ts`, `zigbee-source.ts`, `shelly-source.ts`, `nanoleaf-source.ts`, `state-source.ts`, `aggregate.ts`) — exposed as `Engine.devices`, not a `ServiceRegistry` registration point
  - `zigbee/` — `device-registry.ts` and `z2m-mapper.ts` (Zigbee2MQTT `exposes` mapping, re-exported from core's barrel)
- `packages/web-ui/src/` — `@ts-ha/web-ui`:
  - `web-ui-service.ts` — the `WebUiService` plugin (structural; imports nothing from core)
  - `web-ui-routes.ts`, `asset-routes.ts`, `components/html-shell.ts` — Hono routes
  - `options.ts` — `WEB_UI_ENABLED` / `WEB_UI_PATH` parsing
  - `app/` — React + Tailwind CSS frontend (compiled by `Bun.build`, **not** `tsc`)
  - `app/wall/` — the lazy, full-bleed wall surface (own chunk; must stay out of first paint). A bounded row unit (`clamp(72px, (panelHeight − chrome) / occupiedRows, 112px)`, reserving padding + inter-row gutters) sizes cards to their span and centers a short composition (top-aligns + scrolls a taller one); a single `clamp(16px, 2vmin, 24px)` gutter; a larger type ramp (`wall/type-ramp.ts`, no wall body text below 16px); and an `ambient` (clock/weather/energy/status, chrome-less) vs `control` (room/favorites/device/scene, surface tile) grammar fixed per widget type in `wall/registry.ts`. Device tiles run the shared `components/DeviceTile.tsx` in a wall kiosk mode (`size="wall"`, `wall/scale.ts`) that suppresses favorite/hide-unhide/open-detail and makes the whole card actuate a toggle — a wall-only revisit of `add-wall-display` design D7; ranking, optimistic override, and state encoding stay single-source.
  - `assets/` — Generated JS/CSS string constants (git-ignored, rebuilt by `build:web-ui`)
- `packages/cli/src/` — `@ts-ha/cli`:
  - `commands/` — CLI command implementations (`.ts` and `.tsx`), including `run.ts`
  - `components/` — OpenTUI React components for the interactive dashboard
- `docs/examples/` — Type-checked example automations (compiled against `@ts-ha/core` source via a `customConditions` tsconfig).
- `scripts/` — `guard-contracts.ts`, `guard-deps.ts`, `dev.ts`, `contract-inventory.json`.
- `packages/*/tests/` — Unit tests, one package's tests in that package's scope.

## Key Environment Variables

Full schema in `packages/core/src/config.ts`. `.env.example` lists defaults. Notable env vars:

| Variable | Default | Description |
|---|---|---|
| `MQTT_HOST` | `localhost` | MQTT broker hostname |
| `LOG_LEVEL` | `info` | `trace` · `debug` · `info` · `warn` · `error` |
| `HTTP_PORT` | `8080` | HTTP server port (`0` = disabled) |
| `HTTP_TOKEN` | _(empty)_ | Bearer token / session secret for `/api/*` and the web UI. Empty = no auth. Automation source (`GET /api/automations/:name/source`) is readable under the same policy — document this prominently wherever `HTTP_TOKEN` is discussed (design.md D10, R4) |
| `WEB_UI_ENABLED` | `false` | Enable the web UI dashboard. Parsed by `@ts-ha/web-ui`, not core; `ts-ha run` reads it only as a raw import gate |
| `DEVICE_REGISTRY_ENABLED` | `false` | Enable Zigbee device discovery — controls `deviceRegistry` nullability in automations |
| `DEVICE_REGISTRY_PERSIST` | `true` | Persist the device list and capability schema to disk, restored before the bridge republishes (breaking default change — design.md D6, R14) |
| `AUTOMATIONS_RECURSIVE` | `false` | Scan subdirectories recursively for automation files |
| `STATE_PERSIST` | `true` | Persist state to disk (write-behind, debounced by `STATE_FLUSH_MS`); holds room definitions and automation enabled flags, which must survive a restart (breaking default change — design.md D6, R14) |
| `STATE_FLUSH_MS` | `1000` | Debounce window, in ms, between coalesced state saves. `0` saves on every write |
| `SHELLY_POLL_MS` | `10000` | Refresh interval for HTTP-transport Shelly devices in the unified device source layer |
| `NANOLEAF_POLL_MS` | `10000` | Refresh interval for the Nanoleaf device source |

---

## Cross-Package Coding Conventions

### Formatting (Biome)

- **2 spaces** indent, **100 char** line width, **LF** line endings
- Biome auto-organizes imports — don't manually reorder
- `noForEach` is disabled but prefer `for...of` loops in practice
- Web UI source (`packages/web-ui/src/app/**`) has linting disabled via biome overrides

### Import Conventions

Order (enforced by Biome):
1. Node built-ins (`node:fs/promises`, `node:path`)
2. Third-party packages (`pino`, `mqtt`, `zod`)
3. Internal/relative imports (`../config.js`, `./http-client.js`)

Use `import type` for type-only imports:
```ts
import type { Logger } from "pino";
import type { Config } from "../config.js";
import { type StateManagerOptions, StateManager } from "./state-manager.js";
```

### Naming Conventions

| Entity | Convention | Example |
|---|---|---|
| Classes | PascalCase | `MqttService`, `StateManager` |
| Interfaces | PascalCase, no `I` prefix | `EngineOptions`, `NotificationService` |
| Type aliases | PascalCase | `Trigger`, `TriggerContext`, `DeviceState` |
| Module-level constants | SCREAMING_SNAKE | `STATE_PREFIX`, `COLORS` |
| Private class config | `private readonly` with SCREAMING_SNAKE | `ALARM_STATE_KEY`, `LUX_THRESHOLD` |
| Private fields | `private` keyword, camelCase | `private connected`, `private store` |
| Methods | camelCase | `publishToDevice()`, `turnOn()` |
| Files | kebab-case | `mqtt-service.ts`, `state-manager.ts` |
| Automation names | kebab-case string | `"motion-light-schedule"` |
| State keys | snake_case, colon prefix for scoping | `"night_mode"`, `"motion-light:lights_on"` |
| Booleans | camelCase, descriptive | `lightsAreOn`, `skipLux`, `stillArmed` |

Zigbee type naming: `{Capability}Payload` for device state, `{Capability}SetCommand` for commands.

## Class Patterns

### Automation base class

Abstract class with `abstract readonly name`, `abstract readonly triggers`, and `abstract execute()`. Dependencies injected via `_inject(context: AutomationContext)` with definite assignment (`!`). Optional lifecycle hooks `onStart()`/`onStop()` have empty default implementations.

### Required services with `requiredServices` + `require()`

Declare services that must be registered at startup using `requiredServices` (with `as const` for literal type inference). The manager validates these are registered before `onStart`, so you can use `this.require<T>(key)` in `execute()` for a non-null return:

```ts
readonly requiredServices = ["shelly"] as const;

async execute(): Promise<void> {
  const shelly = this.require<ShellyService>("shelly");
  await shelly.turnOff("tv_plug");
}
```

### Optional services via `ServiceRegistry`

For optional services not listed in `requiredServices`, use the registry's three retrieval methods:

```ts
// nullable — you handle the absent case:
const svc = this.services.get<MyService>("my-service");
if (svc) await svc.doSomething();

// throws if missing (use for truly-required services):
const svc = this.services.getOrThrow<MyService>("my-service");

// callback wrapper — no-ops when absent (best for one-liners):
await this.services.use<MyService>("my-service", (s) => s.doSomething());
```

Convenience methods: `this.notify(options)` sends a push notification (no-ops if not configured). `this.deviceRegistry` is `null` when `DEVICE_REGISTRY_ENABLED=false` — always null-check.

### Device-specific abstracts

Extend `Automation`, use `get triggers()` getter (not field) because abstract properties aren't available during super construction. Dispatcher pattern in `execute()` routing to `protected async` handler methods with no-op defaults. Examples: `AqaraH1Automation`, `IkeaStyrbarAutomation`, `IkeaRodretAutomation`.

### Service classes

Constructor DI with `private readonly` parameters. No interfaces for services themselves.

### Engine factory

`createEngine(options)` returns an object literal with closures, not a class instance.

### ServiceFactory pattern

Services accepted by `createEngine()` can be instances or factory functions `(http: HttpClient, logger: Logger) => T`. The `homekit` service is special — its factory receives a single `HomekitServiceContext` object: `(ctx: { http, logger, mqtt, deviceRegistry, shelly }) => HomekitService`.

### ServicePlugin

Services implementing `ServicePlugin` (`packages/core/src/services/service-plugin.ts`) receive lifecycle hooks (`onStart`, `onStop`) and can mount HTTP routes (`registerRoutes`) via `ServiceRegistry.startAll()/stopAll()/mountRoutes()`.

## Automation File Pattern

```ts
import { Automation, type Trigger, type TriggerContext } from "@ts-ha/core";
import type { SomePayload } from "@ts-ha/shared/types";
import type { ShellyService } from "@ts-ha/core";

export default class MyAutomation extends Automation {
  readonly name = "my-automation";

  // ---- Configuration ----
  private readonly SOME_SETTING = "value";

  // ---- Required services (validated at startup) ----
  readonly requiredServices = ["shelly"] as const;

  // ---- Internal state ----
  private timer: ReturnType<typeof setTimeout> | null = null;

  readonly triggers: Trigger[] = [/* ... */];

  async execute(context: TriggerContext): Promise<void> {
    if (context.type !== "mqtt") return;
    const payload = context.payload as unknown as SomePayload;
    // Required services — non-null, validated at startup:
    const shelly = this.require<ShellyService>("shelly");
    await shelly.turnOn("plug");
  }

  async onStop(): Promise<void> {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
  }
}
```

## Error Handling

- **Structured logging:** `this.logger.error({ err, topic, device: name }, "message")`
- **Never re-throw** non-critical errors — log and continue
- **Throw `Error`** for programmer mistakes (e.g., unregistered device)
- **No custom error classes** — use plain `Error`
- **Zod `safeParse`** at config boundary with `process.exit(1)` on failure
- **Timer cleanup:** Always clear + null in `onStop()`
- **Expected FS errors:** Check `(err as NodeJS.ErrnoException).code === "ENOENT"`
- Timer types: `ReturnType<typeof setTimeout>` (not `NodeJS.Timeout`)

## Test Patterns

```ts
import { describe, it, expect, beforeEach, mock } from "bun:test";
import pino from "pino";

const logger = pino({ level: "silent" });

describe("ClassName", () => {
  let instance: MyClass;
  beforeEach(() => { instance = new MyClass(logger); });

  describe("method group", () => {
    it("does something specific", () => { /* ... */ });
  });
});
```

- Tests in each package's `tests/*.test.ts` (flat, not colocated)
- Silent pino logger at module level
- Mock factory functions: `function createMockHttp(): HttpClient`
- Cast mocks: `{ method: mock(() => ...) } as unknown as ServiceType`
- Access mock calls: `(mock as ReturnType<typeof mock>).mock.calls[0]`
- Config objects use `satisfies Config` for type safety
- Max 2 levels of `describe` nesting
- Test names start with a verb: `"sets and gets a boolean"`

## CLI Dashboard (OpenTUI / React)

The interactive dashboard (`ts-ha dashboard`) uses `@opentui/core` and `@opentui/react` for a terminal UI.

- **JSX files** use `.tsx` extension — located in `packages/cli/src/commands/` and `packages/cli/src/components/`
- **`jsxImportSource`** is `@opentui/react` (set in `tsconfig.json`) — JSX elements are OpenTUI intrinsics (`<box>`, `<text>`, `<scrollbox>`), not HTML
- **Never call `process.exit()`** — use `renderer.destroy()` for cleanup
- **Text styling** uses nested modifier tags: `<strong>`, `<em>`, `<span fg="red">` inside `<text>`
- **Hooks**: `useKeyboard`, `useRenderer`, `useTerminalDimensions`, `useTimeline` from `@opentui/react`
- **Tab components** are separate files in `packages/cli/src/components/` (one per tab)
- **Shared theme** in `packages/cli/src/components/theme.ts` (Dracula color palette)
- **Shared types** in `packages/cli/src/components/types.ts` (dashboard data interfaces)

## Exports (`packages/core/src/index.ts`)

- Barrel file with explicit named re-exports (no `export *`)
- Grouped by category with section comments
- `export type { ... }` for type-only exports
- Alphabetical ordering within each group

---

## Usage Rules for This Agent

1. **Read this file first** when starting work in this workspace.
2. **Read `.opencode/bars/typescript.md` and `.opencode/bars/security.md`** before changing TypeScript.
3. **Read the affected package's `README.md` and `package.json`** before modifying it.
4. **Follow the Cross-Package Change Checklist** for changes that span packages.
5. **Do not edit `scripts/guard-deps.ts`, `scripts/guard-contracts.ts`, or `scripts/contract-inventory.json` to silence a violation** — fix the cause in the source.
6. **Preserve the reserved internal state namespace.** `$internal:*` keys are not client-writable and must not appear in the State view.
7. **Never commit** unless the user explicitly asks.
8. **When uncertain**, state assumptions explicitly before proceeding.

## graphify

This project ships a graphify OpenCode plugin (`.opencode/plugins/graphify.js`).
When a knowledge graph exists at `graphify-out/`, use it before grepping raw
files.

Rules:

- For codebase questions, first run `graphify query "<question>"` when `graphify-out/graph.json` exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than `GRAPH_REPORT.md` or raw grep output.
- If `graphify-out/wiki/index.md` exists, use it for broad navigation instead of raw source browsing.
- Read `graphify-out/GRAPH_REPORT.md` only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
- When no `graphify-out/` exists, ignore this section and browse the source directly.
