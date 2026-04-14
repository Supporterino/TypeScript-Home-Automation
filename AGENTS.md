# AGENTS.md

Coding conventions and instructions for AI agents working in this repository.

## Build / Lint / Test Commands

```bash
bun install                  # Install dependencies
bun run dev                  # Run with hot-reload (standalone mode)
bun run start                # Production run
bun run typecheck            # TypeScript type checking (tsc --noEmit)
bun run check                # Biome format + lint + import organize (auto-fix)
bun run format               # Format only
bun run lint                 # Lint only
bun run build                # Build package to dist/ (runs web UI build first)
bun run build:web-ui         # Build only the React web UI frontend
bun test                     # Run all tests
bun test tests/state-manager.test.ts           # Run a single test file
bun test --filter "topicMatches"               # Run tests matching a name pattern
```

Always run `bun run typecheck && bun run check && bun test` before committing.

Other available scripts: `bun run format:check` (format check without write), `bun run lint:fix` (lint with auto-fix), `bun run docker:build/up/down` (Docker Compose wrappers), `bun run prepublishOnly` (full build before npm publish).

> **Note on `typecheck`**: `tsc --noEmit` does not trigger the `prebuild` hook and does not
> compile `src/core/web-ui/app/**` (excluded from `tsconfig.json`). That subtree has its
> own `src/core/web-ui/app/tsconfig.json` for IDE support and is compiled exclusively by
> `scripts/build-web-ui.ts` via `Bun.build`.

## Project Structure

- `src/core/` — Framework core, organised into subfolders by responsibility:
  - `src/core/engine.ts`, `automation.ts`, `automation-manager.ts` — glue layer (flat)
  - `src/core/mqtt/` — `mqtt-service.ts`, `mqtt-utils.ts`
  - `src/core/http/` — `http-server.ts`, `http-client.ts`
  - `src/core/scheduling/` — `cron-scheduler.ts`
  - `src/core/state/` — `state-manager.ts`
  - `src/core/logging/` — `log-buffer.ts`
  - `src/core/services/` — `shelly-service.ts`, `nanoleaf-service.ts`, `ntfy-notification-service.ts`, `open-meteo-service.ts`, `openweathermap-service.ts`
  - `src/core/devices/` — `aqara-h1-automation.ts`, `ikea-styrbar-automation.ts`, `ikea-rodret-automation.ts`
  - `src/core/web-ui/` — Web dashboard served by Hono
    - `src/core/web-ui/app/` — React + Mantine frontend source (compiled by `Bun.build`, **not** `tsc`)
    - `src/core/web-ui/assets/` — Generated JS/CSS string constants (git-ignored, rebuilt by `build:web-ui`)
- `src/automations/` — Example automations (excluded from npm package build)
- `src/types/` — Device and service type definitions (Zigbee2MQTT brands, Shelly, Nanoleaf, Weather, Notifications)
- `src/cli/` — CLI tool (`ts-ha`) for managing running instances
  - `src/cli/commands/` — CLI command implementations (`.ts` and `.tsx`)
  - `src/cli/components/` — OpenTUI React components for the interactive dashboard
- `scripts/` — Build scripts (e.g. `build-web-ui.ts`)
- `tests/` — Unit tests (flat directory, `*.test.ts`)

## Runtime & Module System

- **Runtime:** Bun (not Node.js) — use `Bun.serve()`, `bun:test`, etc.
- **Module system:** ESM (`"type": "module"`)
- **TypeScript target:** ESNext with `"moduleResolution": "bundler"`
- **Always use `.js` extensions** in relative imports: `from "./automation.js"`
- **Use `node:` prefix** for Node built-ins: `from "node:fs/promises"`

## CLI Dashboard (OpenTUI / React)

The interactive dashboard (`ts-ha dashboard`) uses `@opentui/core` and `@opentui/react` for a terminal UI. Key conventions:

- **JSX files** use `.tsx` extension — located in `src/cli/commands/` and `src/cli/components/`
- **`jsxImportSource`** is `@opentui/react` (set in `tsconfig.json`) — JSX elements are OpenTUI intrinsics (`<box>`, `<text>`, `<scrollbox>`), not HTML
- **Never call `process.exit()`** — use `renderer.destroy()` for cleanup
- **Text styling** uses nested modifier tags: `<strong>`, `<em>`, `<span fg="red">` inside `<text>`
- **Hooks**: `useKeyboard`, `useRenderer`, `useTerminalDimensions`, `useTimeline` from `@opentui/react`
- **Tab components** are separate files in `src/cli/components/` (one per tab)
- **Shared theme** in `src/cli/components/theme.ts` (Dracula color palette)
- **Shared types** in `src/cli/components/types.ts` (dashboard data interfaces)

## Formatting (Biome)

- **2 spaces** indent, **100 char** line width, **LF** line endings
- Biome auto-organizes imports — don't manually reorder
- `noForEach` is disabled but prefer `for...of` loops in practice

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
| Private class config | `private readonly` SCREAMING_SNAKE | `ALARM_STATE_KEY`, `LUX_THRESHOLD` |
| Private fields | `private` keyword, camelCase | `private connected`, `private store` |
| Methods | camelCase | `publishToDevice()`, `turnOn()` |
| Files | kebab-case | `mqtt-service.ts`, `state-manager.ts` |
| Automation names | kebab-case string | `"motion-light-schedule"` |
| State keys | snake_case, colon prefix for scoping | `"night_mode"`, `"motion-light:lights_on"` |
| Booleans | camelCase, descriptive | `lightsAreOn`, `skipLux`, `stillArmed` |

## Class Patterns

**Automation base class:** Abstract class with `abstract readonly name`, `abstract readonly triggers`, and `abstract execute()`. Dependencies injected via `_inject()` with definite assignment (`!`). Optional lifecycle hooks `onStart()`/`onStop()` have empty default implementations.

**Service classes:** Constructor DI with `private readonly` parameters. No interfaces for services themselves. Internal helpers under `// Internal` section separator.

**Device-specific abstracts** (e.g., `AqaraH1Automation`, `IkeaStyrbarAutomation`, `IkeaRodretAutomation`): Extend `Automation`, use `get triggers()` getter (not field) because abstract properties aren't available during super construction. Dispatcher pattern in `execute()` routing to `protected async` handler methods with no-op defaults.

**Factory functions:** `createEngine()` returns an object literal with closures, not a class instance.

## Automation File Pattern

```ts
import { Automation, type Trigger, type TriggerContext } from "../core/automation.js";
import type { SomePayload } from "../types/zigbee/index.js";

interface LocalConfig { /* file-scoped, not exported */ }

export default class MyAutomation extends Automation {
  readonly name = "my-automation";

  // ---- Configuration ----
  private readonly SOME_SETTING = "value";

  // ---- Internal state ----
  private timer: ReturnType<typeof setTimeout> | null = null;

  readonly triggers: Trigger[] = [/* ... */];

  async execute(context: TriggerContext): Promise<void> {
    if (context.type !== "mqtt") return;
    const payload = context.payload as unknown as SomePayload;
    // ...
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

## Type Organization

`src/types/` contains:
- `zigbee/` — Zigbee2MQTT types split by brand:
  - `common.ts` — primitives and generic payloads (`DeviceState`, `ColorXY`, `OccupancyPayload`, …)
  - `philips.ts` — Philips Hue specific types
  - `ikea.ts` — IKEA specific types
  - `aqara.ts` — Aqara specific types
  - `index.ts` — barrel re-exporting all of the above
- `shelly.ts` — Shelly Gen 2 RPC types
- `nanoleaf.ts` — Nanoleaf OpenAPI types
- `weather.ts` — `WeatherService` interface and data types
- `notification.ts` — `NotificationService` interface and option types

Zigbee type naming: `{Capability}Payload` for device state, `{Capability}SetCommand` for commands.

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

## Dependency Injection

- **Constructor injection** for services (via `private readonly` params)
- **`_inject(context: AutomationContext)` method** for automations (framework-internal, underscore-prefixed) — takes a single context object, not positional parameters
- **`T | null`** for optional services (`notifications`, `weather`), check before use
- **Child loggers** scoped per service: `logger.child({ service: "mqtt" })`
- **Factory function overload** for notifications/weather: accepts instance or `(http, logger) => Service`

## Exports (`src/index.ts`)

- Barrel file with explicit named re-exports (no `export *`)
- Grouped by category with section comments
- `export type { ... }` for type-only exports
- Alphabetical ordering within each group
