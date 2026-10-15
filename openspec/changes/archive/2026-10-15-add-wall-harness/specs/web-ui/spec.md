## MODIFIED Requirements

### Requirement: Build Process

The web UI source is a separate React project within the `@ts-ha/web-ui`
package:

- Built via the package's own build script
- Compiles the Tailwind stylesheet as part of the same bundle step, without a
  separate PostCSS pipeline whose output would bypass the asset manifest
- Produces content-hashed JS and CSS assets embedded in the package as generated
  modules, so the package ships without a separate static asset directory
- Produces more than one JS asset where the application is split, so that
  features not required for first paint are not loaded on first paint
- Produces a compressed representation of each asset alongside the uncompressed
  one, so that compression is a build product rather than a per-request cost
- Fails when the assets required for a first paint exceed the transferred-size
  budget
- Resolves its workspace imports (notably `@ts-ha/shared`, whose runtime
  capability helpers the app uses) to source by passing the `development` exports
  condition to `Bun.build`, so the asset build does not require a prior build of
  the shared package
- These generated files are git-ignored
- The build runs automatically as a `prepublishOnly`/`prebuild` hook of the
  `@ts-ha/web-ui` package, not as a hook of the core package
- A development workflow MUST exist that applies frontend source changes without
  requiring a full rebuild and engine restart. That workflow MUST resolve
  workspace imports to source by passing the `development` exports condition
  explicitly, since the condition is not selected by `NODE_ENV` or configuration
- The shipped build MUST compile only the application entrypoint's transitive
  closure. A development-only module — such as a render harness that renders
  components against fixture data in isolation — MUST NOT be an entrypoint of
  that build and MUST NOT be reachable from the application entrypoint, so
  neither the module nor the data or stylesheets it imports contributes an asset
  to the manifest or a dependency to first paint.

#### Scenario: Assets are content-addressed

- **WHEN** the frontend is built
- **THEN** each emitted asset's URL incorporates a hash of its contents, so a
  changed build produces a different URL

#### Scenario: Package needs no static directory

- **WHEN** the built `@ts-ha/web-ui` package is installed as a dependency
- **THEN** the web UI serves its assets without requiring any file outside the
  installed module

#### Scenario: Core build does not build the UI

- **WHEN** `@ts-ha/core` is built or type-checked
- **THEN** the web UI asset build is not invoked

#### Scenario: Asset build does not depend on a shared build

- **WHEN** the web UI asset build runs before `@ts-ha/shared` has been compiled
- **THEN** it succeeds, resolving `@ts-ha/shared` to source through the
  `development` condition

#### Scenario: Frontend iteration does not require a restart

- **WHEN** a developer edits frontend source in the development workflow
- **THEN** the change is observable in the browser without rebuilding and
  restarting the engine

#### Scenario: The stylesheet goes through the asset manifest

- **WHEN** the frontend is built
- **THEN** the compiled design-system stylesheet is emitted as a content-hashed,
  pre-compressed asset served by the asset routes, rather than through a build
  step whose output the manifest does not know about

#### Scenario: A development-only module does not reach the shipped build

- **WHEN** the frontend is built
- **THEN** no emitted asset contains the development render harness or its
  fixture data, and the harness is not reachable from the application entrypoint

#### Scenario: A development-only module adds no first-paint dependency

- **WHEN** the dashboard is loaded without opening the development render harness
- **THEN** no asset fetched for first paint originates from that harness, and the
  first-paint transferred-size budget is unchanged by its existence

### Requirement: Data Sources

The dashboard is a pure client of the engine's API. It MUST obtain its initial
snapshot from the JSON API endpoints (`/api/*`) and thereafter maintain it from
the event stream, refetching only on reconnection or explicit user request.

When the event stream delivers a device snapshot on connect, the dashboard MUST
reconcile it into its device map keyed by qualified identifier rather than
replacing the map wholesale, so a value that arrived from the read endpoints or
a stream event before or after the snapshot is not lost. When a device event
arrives for an identifier the dashboard does not currently hold, it MUST recover
by refetching that device rather than discarding the event; an incremental delta
for an unknown device carries no full descriptor and would otherwise be dropped
silently.

Descriptors ingested from either path MUST carry the complete declared
capability contract through to the components that consume them. A device
snapshot is not a display payload that may be narrowed: every field a control
reads from a capability — including the values a boolean property declares for on
and off — MUST survive ingestion, so a device the dashboard learns about only
from the stream is exactly as controllable as one it read from the read
endpoints. A normaliser that reconstructs a capability from a fixed field list
MUST NOT omit a field the declared contract requires, and MUST be extended rather
than left behind whenever that contract grows; a declared field silently dropped
at ingestion is indistinguishable to the user from a device that does not support
it.

The dashboard MUST NOT poll all endpoints on a fixed interval while the event
stream is healthy.

The data layer MUST additionally accept a fixture set — devices, state, rooms, and
the ambient readings (weather, energy) that the wall's widgets would otherwise
source themselves — supplied explicitly by the calling code, so that components
can be rendered against known data with no engine present. Fixture use MUST be
explicit at the call site and MUST NOT be selectable at runtime: no environment
variable, configuration key, request parameter, or other deployment-time
condition may cause a dashboard to read fixture data in place of the API, and a
dashboard run without caller-supplied fixtures MUST source its data exactly as it
does today.

A wall widget that sources a reading outside the data layer — the wall's weather
and energy widgets — MUST render a caller-supplied fixture for that reading when
one is present, and MUST source it exactly as it does today when none is supplied,
so a fixture-backed render issues no request for it.

#### Scenario: Snapshot then stream

- **WHEN** the dashboard loads
- **THEN** it reads its initial data from the API endpoints and then holds the
  event stream open for updates

#### Scenario: Degraded transport is visible

- **WHEN** the event stream is unavailable and the dashboard falls back to
  periodic refresh
- **THEN** the interface reports the degraded connection state to the user

#### Scenario: The stream's device snapshot is reconciled by identifier

- **WHEN** the stream sends a device snapshot while the dashboard already holds
  device state
- **THEN** each device is merged by its qualified identifier rather than
  replacing the whole map

#### Scenario: A delta for an unknown device recovers it

- **WHEN** a device event arrives for an identifier the dashboard does not hold
- **THEN** the dashboard refetches that device instead of discarding the event

#### Scenario: A device known only from the stream keeps its declared encoding

- **WHEN** the dashboard learns a device from the event stream's snapshot, or
  from a recovery refetch, whose boolean capability declares string on and off
  values
- **THEN** the capability the controls receive still declares those values, and a
  control for that device reads and composes through them

#### Scenario: Ingestion does not narrow a declared capability

- **WHEN** a descriptor is ingested from the read endpoints or from the event
  stream
- **THEN** every field the declared capability contract requires survives
  ingestion, so the same device is controllable whichever path it arrived on

#### Scenario: Components render from an explicitly supplied fixture set

- **WHEN** a caller supplies a fixture set of devices, state, and rooms to the
  data layer
- **THEN** the components render that data without any request to the engine

#### Scenario: A deployment cannot select fixture data

- **WHEN** a dashboard runs without caller-supplied fixtures
- **THEN** it reads its data exclusively from the API endpoints and the event
  stream, and no environment variable, configuration key, or request parameter
  can cause it to read fixture data instead

#### Scenario: Supplying fixtures does not change the API path

- **WHEN** no fixture set is supplied
- **THEN** snapshot-then-stream sourcing, reconciliation, and degraded-transport
  behaviour are unchanged

#### Scenario: A widget that sources its own reading prefers the fixture

- **WHEN** a caller supplies a fixture set carrying the reading a widget would
  otherwise fetch for itself
- **THEN** the widget renders the supplied reading and issues no request for it
