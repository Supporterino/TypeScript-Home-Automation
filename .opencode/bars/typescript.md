# TypeScript Bar — TypeScript Home Automation

This document is the canonical, language-level TypeScript bar for this workspace. It is cited by the `ts-developer` and `ts-reviewer` agents and is deliberately scoped to TypeScript the language — not to any framework or package.

It distils the [TypeScript Handbook — Do's and Don'ts](https://www.typescriptlang.org/docs/handbook/declaration-files/do-s-and-don-ts.html) and the [Google TypeScript Style Guide](https://google.github.io/styleguide/tsguide.html), adapted to this repo's Biome configuration and conventions. Where the two sources or the formatter disagree, the root `AGENTS.md` and `biome.json` win.

**Framework and package idioms are owned elsewhere.** Do not restate them here. Read:

- the root `AGENTS.md` for class patterns (`Automation`, `requiredServices`/`require()`, `ServicePlugin`, `ServiceRegistry`, the device-source abstraction, device-specific abstracts), automation file shape, error handling, test patterns, and the CLI dashboard;
- the affected package's `README.md` and `package.json` for its commands and exports;
- `docs/` for the published architecture and configuration reference.

The security bar is `.opencode/bars/security.md`. The dependency-direction and shared-contract invariants are `.opencode/bars/security.md` § Invariants and `scripts/guard-deps.ts` / `scripts/guard-contracts.ts`.

## Types

- **No `any`.** Use a precise type, a generic, or `unknown` plus a narrowing check. `any` silently disables the compiler and is only acceptable with a written justification in a comment on the same line. `unknown` at a trust boundary followed by a schema parse is the correct pattern.
- **Prefer `unknown` at trust boundaries.** Parse external input (MQTT payloads, HTTP responses, files, env) with a schema rather than asserting a type. `context.payload as unknown as SomePayload` is the existing convention for MQTT payloads in automations; keep it local and documented by the payload type.
- **Use primitives, never wrapper objects.** Use `number`, `string`, `boolean`, and `symbol`; use `object` for the non-primitive. Never `Number`, `String`, `Boolean`, `Symbol`, or `Object`.
- **Model states with unions, not flags.** Prefer a discriminated union over optional fields that can represent impossible states. `TriggerContext` (discriminated on `type`) and the `DeviceSource` union are the in-repo exemplars.
- **Handle unions exhaustively.** Every `switch` over a union ends with an `assertNever`-style default so a new variant becomes a compile error, not a silent fallthrough. Capability kinds and device-source families rely on this.
- **Avoid non-null assertions (`!`).** They are for cases the compiler genuinely cannot prove, and each one should be a last resort. Prefer a guard, an early return, or a local `const` that narrows once. The one sanctioned use is definite assignment on injected automation dependencies (`_inject`), which the `Automation` base class documents.
- **Every generic type parameter must be used.** A generic that ignores its parameter is a design error, not a shorthand.
- **Explicit public return types.** Exported functions, methods on classes, and public APIs declare their return type. Inferred types are fine for local helpers and callbacks.
- **Callback return types: `void` when the value is ignored.** Never `any`. A `void` return makes an accidentally-consumed return value a compile error.
- **No floating promises.** `async` calls are `await`ed, returned, or explicitly handled. Fire-and-forget requires an explicit `void` (or `.catch(...)`) and a comment saying why it is safe to ignore.

### Function overloads

- **Order specific before general.** TypeScript picks the first matching overload, so a general signature placed first hides the specific ones.
- **Prefer optional parameters over trailing-parameter overloads** when every overload shares a return type.
- **Prefer a union parameter over overloads that differ in one argument's type.**
- **Do not write overloads that differ only in callback arity.** Write one signature with the maximum arity; callbacks may always ignore parameters.
- **Only mark a callback parameter optional when it truly may be omitted.** Optional callback params change the accepted arity, which is rarely intended.

## Declarations, imports, and exports

- **ES modules only.** No `namespace`, no `import x = require('...')`, no `/// <reference path="...">`. Semantically namespace code with separate files.
- **Always use `.js` extensions in relative imports** (`from "./automation.js"`), and the `node:` prefix for Node built-ins (`from "node:fs/promises"`). This is a hard repo rule — see the root `AGENTS.md` § Runtime & Module System.
- **Use `import type` / `export type` for type-only symbols** so transpile-only builds drop them; use regular imports for values. Biome organizes the import groups.
- **Barrel files use explicit named re-exports, never `export *`.** `packages/core/src/index.ts` is the reference: grouped by category with section comments, `export type { ... }` for type-only symbols, alphabetical within each group.
- **Minimize the exported surface.** Export only what other modules use; keep helpers module-local.
- **No mutable exports.** `export let` is disallowed — expose a getter function instead.
- **No container classes.** Do not group constants and helpers behind `class Container { static ... }`; export individual constants and functions. The `Engine` factory (`createEngine`) returns an object literal with closures, not a class instance — follow that pattern.

## Values, literals, and control flow

- **`const` by default, `let` when reassigned, never `var`.** One variable per declaration, and never use a variable before its declaration.
- **No `Array()` or `Object()` constructors.** Use literals (`[]`, `{}`); use `Array.from` for sized arrays.
- **No non-numeric properties on arrays.** Use a `Map` or plain object instead.
- **Spread only matching kinds.** Spread iterables into arrays and objects into objects; never spread primitives, `null`, or `undefined`.
- **Iterate objects safely.** Use `for...of Object.keys(...)` / `Object.entries(...)`; an unfiltered `for...in` walks the prototype chain and is disallowed. Biome disables `noForEach`, but prefer `for...of` in practice.
- **Braces are always required** around control-flow bodies.
- **Parse numbers with `Number()` and check for `NaN`.** Never use unary `+`, and never `parseInt`/`parseFloat` except for a non-base-10 radix (after validating the digits).
- **Coerce with `String()`, `Boolean()`, `!!`, or a template literal** — never by string concatenation. Do not boolean-coerce enum values (including unions with enums): compare them explicitly against the enum members.
- **String literals use the formatter's quotes** (Biome enforces this); use template literals instead of complex concatenation; never use line continuations.

## Classes

- **TypeScript visibility, not `#private`.** Use `private`/`protected`; `#private` fields are disallowed. Never bypass visibility with `obj['foo']`.
- **Mark never-reassigned members `readonly`,** initialize members where declared, and use parameter properties instead of plumbing obvious assignments through the constructor. Services are `private readonly` constructor parameters (see the root `AGENTS.md` § Service classes).
- **No unnecessary constructors.** Omit an empty constructor or one that only delegates to `super(...)`; keep constructors that use parameter properties, visibility modifiers, or parameter decorators. Constructor calls always use parentheses.
- **Avoid the `public` modifier** except on non-`readonly` parameter properties — TypeScript members are public by default.
- **No `this` in a static context,** and do not dispatch static methods dynamically through a class value or subclass.
- **Getters must be pure** (no observable side effects); do not define pass-through accessors only to hide a field. The device-specific abstracts use `get triggers()` as a getter deliberately — abstract properties are not available during `super` construction; that is the sanctioned use.
- **Do not manipulate `prototype`s.** No mixins, no builtin prototype patching.

## Functions

- **Prefer function declarations for named functions;** use arrow functions for callbacks and nested functions.
- **No function expressions** (`function () {}`) — use arrows. The only exceptions are generators and functions that intentionally rebind `this`.
- **Never rebind `this`** with `bind`, `const self = this`, or a method reference; use an arrow function or an explicit parameter.
- **Pass an arrow wrapper to callbacks** rather than a bare named function, so arguments are forwarded explicitly (e.g. `['1', '2'].map((n) => Number(n))`, never `.map(parseInt)`).
- **Default parameter initializers must be side-effect free** and should be simple.
- **Use rest/spread, not `arguments` or `Function.prototype.apply`.**
- **Avoid arrow-function class properties** except for event handlers that must be uninstallable; call instance methods from an arrow wrapper instead.

## Schemas

- **Zod is the shared validation source of truth.** Pure browser-safe validation schemas live in `@ts-ha/shared` and are consumed by `core`, `web-ui`, and `cli`. A shared contract has exactly one declaration site under `packages/shared/src` — see `.opencode/bars/security.md` § Invariants and `scripts/guard-contracts.ts`.
- **Validate at the boundary, then trust the type.** Parse once where data enters the app (config load, HTTP request body, MQTT payload, CLI input); do not re-validate the same shape deeper in the tree.

## Naming and layout

- **Files are kebab-case** (`mqtt-service.ts`, `state-manager.ts`). JSX files use `.tsx`.
- **Types, interfaces, classes, and enums are PascalCase;** functions, variables, and properties are camelCase. Module-level constants are `SCREAMING_SNAKE`; private class config is `private readonly` + `SCREAMING_SNAKE`; booleans are descriptive camelCase (`lightsAreOn`).
- **No `I` prefix on interfaces.**
- **Zigbee type naming:** `{Capability}Payload` for device state, `{Capability}SetCommand` for commands.
- Full tables live in the root `AGENTS.md` § Naming Conventions — do not duplicate them.

## Formatting

Formatting is owned by **Biome** (`bun run format` / `bun run lint` / `bun run check`); do not hand-format. Biome enforces 2-space indent, 100-char line width, LF endings, and import organization. `packages/web-ui/src/app/**` has linting disabled via Biome overrides; the rest of the tree does not.

## Compiler variance

- **One strict base config.** `tsconfig.base.json` is strict; each package extends it via its own `tsconfig.json` / `tsconfig.build.json`. Treat a strict-mode error as a real defect, not noise.
- **`@ts-ha/web-ui` has a second config.** Its `typecheck` runs `tsc --noEmit` for the server and `tsc --noEmit -p src/app/tsconfig.json` for the React app. The app is compiled by `Bun.build`, not `tsc`, at build time.
- **The `development` condition** resolves package imports to `src` for build-free dev/test; it is selected only when passed explicitly (`bun --conditions=development`, `bun test --conditions=development`, `customConditions: ["development"]`). Do not rely on it in published code.

## Verification

Run the workspace gate before declaring work done:

```bash
bun run typecheck && bun run check && bun run test
```

`bun run check` is Biome **plus** `guard-contracts` **plus** `guard-deps` — a dependency-direction or shared-contract violation fails the gate. When the React frontend changed, also run `bun run --filter @ts-ha/web-ui build:web-ui`. See the `ts-developer` agent for the per-package commands.
