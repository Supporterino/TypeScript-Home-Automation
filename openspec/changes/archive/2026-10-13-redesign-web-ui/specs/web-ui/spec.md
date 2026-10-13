## MODIFIED Requirements

### Requirement: Technology Stack

The web UI MUST be built on the following stack:

- **Framework**: React
- **Styling**: Tailwind CSS, whose theme declares the design-system tokens as
  utilities, so a view composes the design system rather than the component
  library's defaults
- **UI primitives**: Radix UI (headless, accessible primitives for interactive
  components such as dialog, dropdown menu, collapsible, select, slider, switch,
  toggle group, tooltip, and scroll area)
- **Icons**: a tree-shakeable vector icon set (lucide-react); no icon fonts and
  no emoji as structural icons
- **Router**: Client-side routing over real URL paths, matched against the
  server's registered view segments
- **Build**: Bun.build, emitting content-hashed, code-split, pre-compressed
  assets as generated modules
- **Transport**: A server-sent event stream for incremental updates, with
  periodic refresh as a fallback

The UI library MUST NOT impose its own visual defaults on the interface; the
design system MUST own colour, spacing, radius, elevation, motion, and component
geometry.

#### Scenario: Client routing matches server-registered segments

- **WHEN** the client navigates to a view
- **THEN** the resulting URL corresponds to a view segment the server serves the
  shell for, so the link survives a page reload

#### Scenario: The design system owns component geometry

- **WHEN** a component is rendered
- **THEN** its colour, spacing, radius, elevation, and motion come from the
  design system's tokens rather than from a component library's defaults

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

### Requirement: Visual Design System

The dashboard MUST present a single designed visual system rather than
component-library defaults. The system MUST define, centrally and without
per-view hard-coded values, a color palette, typography scale, spacing rhythm,
elevation, corner radii, and motion durations.

The system MUST provide a dark scheme and a light scheme. The dark scheme is
authoritative and the light scheme MUST be designed for contrast in its own
right, not produced by mechanically inverting the dark one. Every scheme-specific
value MUST be defined per scheme rather than derived by inverting the other.

State MUST NOT be conveyed by color alone: an on/off or reachable/unreachable
condition MUST be distinguishable by at least one non-color channel such as an
icon, label, or shape, so the interface remains usable to a user who cannot
distinguish the hues.

Elevation and translucency MUST be applied sparingly enough that text contrast
and rendering performance are preserved with many device tiles on screen; text on
any surface MUST maintain at least the WCAG AA contrast ratio for its size in
both schemes.

Motion MUST be limited to non-essential transitions, MUST NOT shift layout
bounds of surrounding content, and MUST be suppressed when the user requests
reduced motion.

#### Scenario: Both schemes are usable

- **WHEN** the dashboard is rendered in either the dark or the light scheme
- **THEN** text meets the applicable contrast ratio and every state is
  distinguishable without relying on color alone

#### Scenario: The light scheme is designed, not inverted

- **WHEN** the light scheme's tokens are read
- **THEN** each value is declared for the light scheme explicitly, rather than
  computed by inverting the dark scheme

#### Scenario: Reduced motion is respected

- **WHEN** the user's system requests reduced motion
- **THEN** non-essential transitions are not played and content appears in its
  final state

#### Scenario: Tokens are the single source

- **WHEN** a view needs a color, spacing, or radius
- **THEN** it consumes a design-system token rather than a literal value

### Requirement: PWA Support

The web UI MUST function as a Progressive Web App:
- `manifest.json` with app name, icons, theme colors, display mode
- SVG icon (512x512) served as both `icon.svg` and `apple-touch-icon.svg`
- Standalone display mode
- Theme colors matching the design system: the manifest and document
  `theme-color` MUST use the dark scheme's background/theme colour so the
  installed app's chrome matches the authoritative scheme

#### Scenario: Theme colours match the design system

- **WHEN** the manifest and the document `theme-color` are read
- **THEN** both equal the dark scheme's background colour (`#0B0F17`), so the
  installed app's chrome matches the authoritative scheme

## ADDED Requirements

### Requirement: Theme Selection

The dashboard MUST let the user choose the active color scheme between light,
dark, and following the system preference, and MUST persist that choice across
reloads.

The choice MUST be stored in browser storage scoped to the dashboard, MUST
default to following the system preference when no choice has been made, and MUST
NOT require a server round trip.

#### Scenario: Following the system by default

- **WHEN** a user who has made no explicit choice opens the dashboard on a device
  set to dark mode
- **THEN** the dashboard renders in the dark scheme

#### Scenario: An explicit choice persists

- **WHEN** a user selects light and reloads the dashboard
- **THEN** the dashboard renders in the light scheme

### Requirement: No-Flash Theme Application

The active scheme MUST be applied to the document before the application's first
paint, so a reload never flashes a scheme other than the one selected.

#### Scenario: No flash of the wrong scheme

- **WHEN** the dashboard is reloaded with an explicit scheme selected
- **THEN** the served document applies that scheme before the application's first
  paint, without first rendering a different scheme
