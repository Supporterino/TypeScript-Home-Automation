## MODIFIED Requirements

### Requirement: Shared Owns The Contracts

`@ts-ha/shared` MUST be the single definition site for the domain and wire
contracts consumed by more than one package. This includes the capability
vocabulary, device descriptor and observation shapes, trigger context, execution
record shapes, room shapes, log entry, and the realtime stream event union.

These contracts MUST NOT be re-declared in `@ts-ha/web-ui` or `@ts-ha/cli`.
`@ts-ha/core` MAY re-export them so that its own public API is stable, but the
definition MUST live in `@ts-ha/shared`.

`@ts-ha/shared` MUST contain no runtime code beyond trivial type guards,
constants, or pure helpers that encode a rule two or more packages must agree
on. Such contract constants include cross-package runtime literals two or more
packages must agree on, such as the session cookie name; such pure helpers
include the capability boolean read/compose rule. Source-specific transformation
logic (for example, mapping Zigbee2MQTT `exposes` into the capability
vocabulary) MUST remain in `@ts-ha/core`.

The inventory of shared contracts MUST be derived from the actual cross-package
usage of `@ts-ha/core`, `@ts-ha/web-ui`, and `@ts-ha/cli` — both types imported
across a boundary and wire-response DTOs a consumer declares locally that name a
payload the engine or a service produces — not from a hand-maintained list. A
type referenced by a consumer package that is not a private implementation
detail of one package MUST have exactly one definition site in `@ts-ha/shared`.

Because the CLI consumes the unified device descriptor, automation summary, and
capability vocabulary, the legacy Zigbee-only wire DTOs `SerializedDevice`,
`DeviceInfo`, and `AutomationInfo` MUST NOT be defined in `@ts-ha/shared` or
anywhere else: they had no consumer remaining once the CLI stopped addressing the
removed `/api/devices` endpoints.

Purely client-private view state (for example dashboard aggregation or
optimistic-update bookkeeping that names no wire payload) is exempt and MAY
remain local to its package.

`@ts-ha/shared` MUST also own the type subpaths formerly exported from the root
package — `/types`, `/types/shelly`, `/types/nanoleaf`, `/types/weather`, and
`/types/notification` — re-exported at `@ts-ha/shared/types[/...]`.

#### Scenario: A wire type has one definition

- **WHEN** `LogEntry` or `StreamEvent` is referenced from core, web-ui, or cli
- **THEN** all three resolve to the same declaration originating in
  `@ts-ha/shared`

#### Scenario: Shared has no heavy runtime

- **WHEN** `@ts-ha/shared` is imported by a browser bundle
- **THEN** it contributes only types and contract constants, not engine, HTTP, or
  framework runtime

#### Scenario: A pure contract helper has one definition

- **WHEN** the web UI bundle and a core consumer interpret a boolean capability's
  declared on/off encoding
- **THEN** both use the same helper declared in `@ts-ha/shared`

#### Scenario: A reserved-namespace literal has one definition

- **WHEN** a core runtime path and the browser bundle both determine whether a
  state key belongs to the reserved internal namespace
- **THEN** the prefix literal both derive from is declared in `@ts-ha/shared`,
  even though the server-side guard and the client-side predicate may be
  implemented separately

#### Scenario: Source-specific mapping stays in core

- **WHEN** `mapZ2MExposes` is referenced
- **THEN** its declaration lives in `@ts-ha/core` (re-exported from core's
  barrel) and not in `@ts-ha/shared`

#### Scenario: A consumed contract has one definition

- **WHEN** `@ts-ha/web-ui` or `@ts-ha/cli` references a contract type that
  `@ts-ha/core` also uses
- **THEN** the definition is found in `@ts-ha/shared` and neither consumer
  re-declares it

#### Scenario: The web UI does not mirror the stream contract

- **WHEN** the web UI app needs `LogEntry` or `StreamEvent`
- **THEN** it imports the declaration from `@ts-ha/shared` rather than declaring a
  parallel copy in its browser source

#### Scenario: The CLI does not mirror wire contracts

- **WHEN** the CLI needs a wire response shape such as `LogEntry`,
  `HomekitStatus`, `Automation`, `DeviceDescriptor`, or a capability
- **THEN** it imports the declaration from `@ts-ha/shared` rather than declaring a
  parallel copy in `packages/cli/src`

#### Scenario: Legacy Zigbee-only DTOs are retired

- **WHEN** `SerializedDevice`, `DeviceInfo`, or `AutomationInfo` is referenced
- **THEN** no declaration exists, because the CLI consumes the device descriptor,
  automation summary, and capability vocabulary instead

#### Scenario: Client-private view state may stay local

- **WHEN** a package declares a shape that is derived client-side and names no
  engine- or service-produced payload
- **THEN** it may remain local to that package

#### Scenario: Type subpaths move to shared

- **WHEN** a consumer imports the former root type subpaths
- **THEN** the same types resolve from `@ts-ha/shared/types[/...]`
