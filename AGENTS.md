# AGENTS.md

Coding conventions and instructions for AI agents working in this repository.

## Build / Lint / Test Commands

```bash
bun install                  # Install dependencies
bun install --frozen-lockfile # CI-style install (no lockfile mutation)
bun run dev                  # Run with hot-reload (standalone mode)
bun run start                # Production run
bun run typecheck            # TypeScript type checking (tsc --noEmit)
bun run check                # Biome format + lint + import organize (auto-fix)
bun run format               # Format only
bun run lint                 # Lint only
bun run build                # Build package to dist/ (runs prebuild hook → web UI build first)
bun run build:web-ui         # Build only the React web UI frontend
bun test                     # Run all tests
bun test tests/state-manager.test.ts           # Run a single test file
bun test --filter "topicMatches"               # Run tests matching a name pattern
```

**Before committing, always run `bun run typecheck && bun run check && bun test`.**

Other scripts: `format:check`, `lint:fix`, `docker:build/up/down`, `prepublishOnly`.

### Build details

- **`typecheck`**: `tsc --noEmit` does **not** trigger the `prebuild` hook (`generate-icon` + `build-web-ui`).
- **`build`**: `tsc -p tsconfig.build.json` with `prebuild` hook. Excludes `src/standalone.ts`, `src/automations/**`, and `src/core/web-ui/app/**`. Produces `dist/` with declarations and source maps.
- **`build:web-ui`**: Compiles `src/core/web-ui/app/` (React + Mantine) via `Bun.build` into generated string constants at `src/core/web-ui/assets/app-js.ts` (git-ignored). The web UI subtree has its own `tsconfig.json` for IDE support.
- **Test runner**: `bun test` (uses `bun:test`), not Jest/Vitest.

## Runtime & Module System

- **Runtime:** Bun (not Node.js) — use `Bun.serve()`, `bun:test`, etc.
- **Module system:** ESM (`"type": "module"`)
- **TypeScript target:** ESNext with `"moduleResolution": "bundler"`
- **Always use `.js` extensions** in relative imports: `from "./automation.js"`
- **Use `node:` prefix** for Node built-ins: `from "node:fs/promises"`

## Project Structure

- `src/core/` — Framework core, organised into subfolders by responsibility:
  - `engine.ts`, `automation.ts`, `automation-manager.ts` — glue layer (flat)
  - `mqtt/` — `mqtt-service.ts`, `mqtt-utils.ts`
  - `http/` — `http-server.ts`, `http-client.ts`
  - `scheduling/` — `cron-scheduler.ts`
  - `state/` — `state-manager.ts`
  - `logging/` — `log-buffer.ts`
  - `services/` — `shelly-service.ts`, `nanoleaf-service.ts`, `ntfy-notification-service.ts`, `open-meteo-service.ts`, `openweathermap-service.ts`, `homekit-service.ts`, `service-registry.ts`, `service-plugin.ts`
  - `devices/` — `aqara-h1-automation.ts`, `ikea-styrbar-automation.ts`, `ikea-rodret-automation.ts`
  - `zigbee/` — `device-registry.ts` (Zigbee2MQTT device discovery and state tracking)
  - `web-ui/` — Web dashboard served by Hono
    - `web-ui/app/` — React + Mantine frontend (compiled by `Bun.build`, **not** `tsc`)
    - `web-ui/assets/` — Generated JS/CSS string constants (git-ignored, rebuilt by `build:web-ui`)
- `src/automations/` — Example automations (excluded from npm package build, included in standalone mode)
- `src/types/` — Device and service type definitions (Zigbee2MQTT brands, Shelly, Nanoleaf, Weather, Notifications)
- `src/cli/` — CLI tool (`ts-ha`) for managing running instances
  - `cli/commands/` — CLI command implementations (`.ts` and `.tsx`)
  - `cli/components/` — OpenTUI React components for the interactive dashboard
- `scripts/` — Build scripts (e.g. `build-web-ui.ts`)
- `tests/` — Unit tests (flat directory, `*.test.ts`)

## Key Environment Variables

Full schema in `src/config.ts`. `.env.example` lists defaults. Notable env vars:

| Variable | Default | Description |
|---|---|---|
| `MQTT_HOST` | `localhost` | MQTT broker hostname |
| `LOG_LEVEL` | `info` | `trace` · `debug` · `info` · `warn` · `error` |
| `HTTP_PORT` | `8080` | HTTP server port (`0` = disabled) |
| `WEB_UI_ENABLED` | `false` | Enable the web UI dashboard |
| `DEVICE_REGISTRY_ENABLED` | `false` | Enable Zigbee device discovery — controls `deviceRegistry` nullability in automations |
| `AUTOMATIONS_RECURSIVE` | `false` | Scan subdirectories recursively for automation files |
| `STATE_PERSIST` | `false` | Persist state to disk on shutdown |

## Formatting (Biome)

- **2 spaces** indent, **100 char** line width, **LF** line endings
- Biome auto-organizes imports — don't manually reorder
- `noForEach` is disabled but prefer `for...of` loops in practice
- Web UI source (`src/core/web-ui/app/**`) has linting disabled via biome overrides

## Import Conventions

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

## Naming Conventions

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

Services accepted by `createEngine()` can be instances or factory functions `(http: HttpClient, logger: Logger) => T`. The `homekit` service is special — its factory receives 4 args: `(http, logger, mqtt, deviceRegistry)`.

### ServicePlugin

Services implementing `ServicePlugin` (`src/core/services/service-plugin.ts`) receive lifecycle hooks (`onStart`, `onStop`) and can mount HTTP routes (`registerRoutes`) via `ServiceRegistry.startAll()/stopAll()/mountRoutes()`.

## Automation File Pattern

```ts
import { Automation, type Trigger, type TriggerContext } from "../core/automation.js";
import type { SomePayload } from "../types/zigbee/index.js";
import type { ShellyService } from "../core/services/shelly-service.js";

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

- Tests in `tests/*.test.ts` (flat, not colocated)
- Silent pino logger at module level
- Mock factory functions: `function createMockHttp(): HttpClient`
- Cast mocks: `{ method: mock(() => ...) } as unknown as ServiceType`
- Access mock calls: `(mock as ReturnType<typeof mock>).mock.calls[0]`
- Config objects use `satisfies Config` for type safety
- Max 2 levels of `describe` nesting
- Test names start with a verb: `"sets and gets a boolean"`

## CLI Dashboard (OpenTUI / React)

The interactive dashboard (`ts-ha dashboard`) uses `@opentui/core` and `@opentui/react` for a terminal UI.

- **JSX files** use `.tsx` extension — located in `src/cli/commands/` and `src/cli/components/`
- **`jsxImportSource`** is `@opentui/react` (set in `tsconfig.json`) — JSX elements are OpenTUI intrinsics (`<box>`, `<text>`, `<scrollbox>`), not HTML
- **Never call `process.exit()`** — use `renderer.destroy()` for cleanup
- **Text styling** uses nested modifier tags: `<strong>`, `<em>`, `<span fg="red">` inside `<text>`
- **Hooks**: `useKeyboard`, `useRenderer`, `useTerminalDimensions`, `useTimeline` from `@opentui/react`
- **Tab components** are separate files in `src/cli/components/` (one per tab)
- **Shared theme** in `src/cli/components/theme.ts` (Dracula color palette)
- **Shared types** in `src/cli/components/types.ts` (dashboard data interfaces)

## Exports (`src/index.ts`)

- Barrel file with explicit named re-exports (no `export *`)
- Grouped by category with section comments
- `export type { ... }` for type-only exports
- Alphabetical ordering within each group
