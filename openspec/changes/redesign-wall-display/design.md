# Design — Wall Redesign (Hearth)

## Context

The full-bleed wall (`/wall/:name`) is rendered by `packages/web-ui/src/app/views/WallView.tsx`,
which is lazily imported from `App.tsx` (`import("./views/WallView.js")`), so the
wall already lives in a code-split chunk. Its presentation is:

- `wall/WallGrid.tsx` — the grid container; `wall/grid.ts` — the clamped row unit;
  `wall/frame.ts` + `wall/WidgetFrame.tsx` — per-widget chrome; `wall/registry.ts` —
  the declarative widget registry (grammar, defaults, min/max, config schema,
  renderer) and `WALL_MIN_TOUCH_TARGET`; `wall/scale.ts` + `wall/type-ramp.ts` — the
  wall type scale; `wall/widgets/**` — the eight widget renderers;
  `wall/editor/**` + `views/WallsView.tsx` — the admin editor.
- The wall device tile is the shared `components/DeviceTile.tsx` in its
  `size="wall"` mode (which imports `WALL_BODY_FONT_SIZE` / `WALL_METRIC_FONT_SIZE`
  from `wall/type-ramp.ts`). On the wall it selects a card archetype
  (`lib/card-archetype.ts`): `light` (an on/off control plus a brightness
  slider), `toggle`, `cover`, and `readout` (a chrome-less dominant value for a
  device with no actuatable property — how a temperature sensor renders today).
- The eight widget renderers (`wall/widgets/**`) are largely thin shells over
  shared primitives: e.g. `DeviceWidget`/`FavoritesWidget`/`RoomWidget` delegate
  to `WallDeviceTile`, `SceneWidget` draws a centred Play glyph over its label,
  and `StatusWidget` renders a metric grid.

Today the wall's colour/spacing/radius tokens come from the dashboard's Lumen
system (`src/app/styles/app.css`, imported once by `src/app/index.tsx`), and the
wall's own scale is a page override documented in
`design-system/ts-ha/pages/wall.md` (16 px body floor, `clamp(72px,…,112px)` row
unit).

Behaviour is fixed by `openspec/specs/wall-display/spec.md`. This change modifies
"Wall Glanceability", "Touch Operation", "Widget Catalog", and "Wall Device
Presentation", and adds "Wall Visual Language" and "On-Demand Wall Stylesheet";
the composition model, cover transport, scene triggers, live updates, and
always-on behaviour are unchanged. The widget *presentations* are redesigned, and
the catalog gains a temperature widget type, so the shared wall contract changes
additively (see D13).

The build (`scripts/build-web-ui.ts`) uses a single entry (`src/app/index.tsx`)
with `splitting: true` and marks an output `firstPaint: artifact.kind !== "chunk"`,
so anything reachable only through a dynamic import is already excluded from the
first-paint budget.

---

## D1 — Hearth: a wall-owned visual language

**Decision.** The wall adopts **Hearth**, a visual language of its own, in place
of the dashboard's Lumen. Hearth is dark-first and **true-black** (no glass, no
full-white surfaces), with a single accent for interactive affordance, a large
distance-sized type ramp, and a calm, low-emission composition suited to an
always-on panel. It is not a restyle of Lumen and does not consume Lumen's tokens.

**Why (design-intelligence grounding).** ui-ux-pro-max places this surface in its
`Digital Signage / Kiosk` profile — *Minimalism & Swiss Style + Dark Mode (OLED)*,
*Full-Screen Immersive* — with a palette focus of high contrast plus touch target
emphasis, and the `dark-mode-oled` style (deep black, low white emission,
eye-friendly, power-efficient) is the fit for a panel that is on all day. The
dashboard's Lumen (opaque coloured surfaces over a blue-grey canvas) is tuned for
a handheld/desktop operator and is the wrong starting point for a
glance-from-across-the-room wall; reusing it is exactly the "dashboard with bigger
text" outcome this change removes.

**Trade-off.** Diverging means the product ships **two** design systems and two
declaration sites, and the wall cannot reuse the dashboard's utilities. Accepted:
the wall is a genuinely distinct surface (touch-only, distance-read, always-on)
and the user explicitly chose divergence; the alternative — staying on Lumen —
cannot deliver a from-scratch wall concept.

## D2 — A wall-scoped token declaration site

**Decision.** Hearth's tokens are declared in a new wall stylesheet,
`packages/web-ui/src/app/wall/hearth.css`, as `--hearth-*` custom properties under
a wall root scope. Dark is authoritative; light is a designed scheme under
`[data-theme="light"]` (the theme attribute is applied globally on `<html>`, so
the wall must define both). The wall's tokens do **not** alias Lumen's `--bg`,
`--surface`, … and `styles/app.css` (Lumen) is left untouched.

Hearth reuses the existing self-hosted display face (Plus Jakarta Sans, declared
in `app.css` and emitted as a content-hashed `.woff2` by the build) and sets its
own ramp on top of it, rather than adding a second font download.

**Why.** The spec's new "Wall Visual Language" requirement makes the wall the
owner of its tokens; a separate file is the single declaration site the
"Tokens are the single source" rule expects, and keeps the dashboard system from
being the wall's transitive dependency. Reusing the existing face avoids a new
font asset and a second download for a panel that already loads the entry
stylesheet.

**Trade-off.** No token is shared with the dashboard, so the two systems can
drift. Mitigated by keeping the divergence deliberate and documented in
`design-system/ts-ha/pages/wall.md`, and by confining Hearth to the wall display
(D8).

## D3 — Distance type ramp and a re-derived body floor

**Decision.** `wall/type-ramp.ts` is rewritten for Hearth. The ramp is
distance-sized (hero/clock readouts well above the dashboard's 34 px ceiling;
metric readouts for weather/energy/status; a label tier; a body tier). The body
floor is **re-derived from the ramp** (target ≥ 18 px) and replaces the current
hard 16 px rule; the compact status-chip exception is retained.

**Why.** "Wall Glanceability" is modified to require that the ramp own its floor.
The 16 px value was inherited from the dashboard's body scale and is not a
distance-legible floor; the re-derived floor is a deliberate, wall-only value.

**Trade-off.** Raising the floor reduces how much text fits in a small span;
mitigated by the existing span-derived row unit (`grid.ts`) and per-type min/max
dimensions in `registry.ts`, which already prevent undersized placements.

## D4 — Kiosk touch targets

**Decision.** Raise `WALL_MIN_TOUCH_TARGET` (`wall/registry.ts`, currently `48`)
to **56**, and keep at least an 8 px separation between adjacent controls.

**Why.** "Touch Operation" is modified to require a kiosk-class target. The
ui-ux-pro-max touch guidance for a kiosk-class surface is 56 px with ≥ 8 px
spacing; the previous 48 px was the touch-standard minimum, sized for a handheld,
not a wall.

**Trade-off.** Larger targets constrain how many controls fit in a small span;
handled as in D3 via the registry's per-type minimum dimensions.

## D5 — On-demand wall stylesheet delivery

**Decision.** `hearth.css` is imported by the wall **surface** modules (not by the
entry `index.tsx`). Because `WallView.tsx` is reached only through a dynamic
import in `App.tsx`, `Bun.build`'s `splitting: true` emits the wall's CSS as a
separate `chunk` asset, which `build-web-ui.ts` already marks `firstPaint: false`.
No build-script change is expected; the behaviour is verified, and the asset test
is extended.

**Why.** The "On-Demand Wall Stylesheet" requirement states the wall stylesheet
loads only with the wall and never on the dashboard's first paint. The existing
pipeline already supports split CSS; the work is placement, not new machinery.

**Risk / trade-off.** If `hearth.css` is also imported from the editor
(`wall/editor/**`, `views/WallsView.tsx`) — which is in a *different* lazy chunk —
Bun may hoist it into a shared chunk reachable earlier. Mitigated by keeping the
editor on Lumen (D8) and importing `hearth.css` **only** from the wall-display
modules, then asserting its absence from the first-paint assets in
`tests/web-ui-assets.test.ts`, mirroring the existing `WALL_CHUNK_MARKER`
(`registry.ts`) guard.

## D6 — Grid, gutter, and composition model retained

**Decision.** The author-placed, fixed-column grid (`grid.ts`), the clamped row
unit and single gutter (`WallGlanceability`), the centered-short-profile rule, the
ambient-vs-control widget grammar (`registry.ts` + `WidgetFrame.tsx`), and the
opt-in title rule are all retained. Hearth changes the wall's *presentation* —
tokens, ramp, targets, surfaces, and the widgets' own composition (D11) — not its
composition *model*.

**Why.** The user chose explicit, author-placed composition; the grid is correct
as it is. Retaining it keeps the change tight and the risk low, while the widget
presentations within each cell are redesigned (D11–D14) and the catalog gains one
type (D13).

**Trade-off.** Hearth cannot exploit an auto-composing ambient register (rejected);
accepted.

## D7 — Wall device tile behaviour retained, presentation redesigned

**Decision.** `components/DeviceTile.tsx` keeps its props and contracts, and the
dashboard's rendering is untouched. Its `size="wall"` mode moves onto Hearth and
its `light` archetype is redesigned (D12). Whole-card actuation for a plain
`toggle`, the suppressed favorite/hide/details affordances, the glyph-only
observation indicator, the full archetype set, capability ranking, and the
optimistic override are unchanged.

**Why.** The tile's behaviour is shared with the dashboard and must not fork; only
its wall appearance and the light card's controls change. "Wall Device
Presentation" is modified only for the light card's controls and the readout
card's presentation (D12, D13) — the rest is presentational.

## D8 — The editor stays on Lumen

**Decision.** `wall/editor/WallEditor.tsx`, `wall/editor/WidgetConfigFields.tsx`,
and `views/WallsView.tsx` remain on the dashboard's Lumen system. Hearth applies
to the full-bleed wall display only.

**Why.** The editor is an administration surface operated on a non-wall device,
not the wall; the request was to redesign the wall *display*. Keeping the editor
on Lumen also keeps Hearth's stylesheet out of the editor's chunk (D5).

**Trade-off.** Two visual systems appear on adjacent screens (the editor lists
profiles, then the wall renders them). Accepted as the correct scope; a future
change could bring the editor onto Hearth if desired.

## D9 — Tests

**Decision.**
- Wall presentation tests are re-pointed at Hearth, preserving each test's intent:
  `wall-type-ramp.test.ts` (new ramp + re-derived floor),
  `wall-scale.test.ts`, `wall-frame.test.ts`, `wall-grid.test.ts`,
  `wall-registry.test.ts` (56 px target + the temperature descriptor),
  `wall-card-archetypes.test.ts`, `wall-single-surface.test.ts`,
  `wall-read-only.test.ts`, plus the per-widget model tests where presentation is
  asserted.
- New tests cover the redesigned widgets: the temperature widget (config
  validation, reading presentation, and containment of an unknown device), the
  light card's icon-affordance toggle/brightness bar/colour controls (including
  that a control is omitted when the capability is absent), the redesigned readout
  card, and the redesigned scene tile (pressed/busy/error states preserved).
- Cover transport is covered end to end: a core test that each declared transport
  value reaches the matching Shelly RPC (and that a stop command is now accepted
  rather than rejected), and a web-ui test that a position-less cover renders
  transport while a cover that cannot stop still omits Stop (D15).
- `web-ui-assets.test.ts` gains a wall-stylesheet-not-in-first-paint assertion.
- Pure wall logic (`wall/*-model.ts`, `wall/live.ts`, `wall/clock.ts`) is
  unchanged and its tests keep passing.

**Why.** Behavioural guarantees live in the spec and must keep being asserted; only
the implementation detail under test changes.

## D10 — Supersession of `redesign-web-ui`'s wall work

**Decision.** This change supersedes the wall-surface work of the in-flight
`redesign-web-ui` change (its tasks 7.1/7.2 and the wall clauses of 3.1/4.1/8.1).
`redesign-web-ui` is **not** edited; it finishes and archives on its own, after
which its wall output is replaced by Hearth.

**Why.** `redesign-web-ui`'s non-goal was that the wall be "re-skinned, not
re-scoped"; this change deliberately reverses that for the wall, so the two must
not both own the wall's appearance. Keeping them separate preserves the near-final
change's history and review.

## D11 — Widget presentation vocabulary

**Decision.** Every wall widget is re-thought onto one Hearth card vocabulary so
the surface reads as a designed whole rather than a set of independent tiles: an
icon or glyph leading the card, a title, a primary metric sized on the wall ramp,
and — for control widgets — a clear action affordance. Ambient widgets
(`clock`, `weather`, `energy`, `status`, and the new `temperature` readout) keep
their chrome-less readout form but adopt the vocabulary's type and spacing;
control widgets (`room`, `favorites`, `device`, `scene`) share the
badge/metric/affordance grammar. The widget renderers in `wall/widgets/**` are
rewritten to this vocabulary rather than re-pointed at tokens.

**Why.** The user asked for the widgets to be rethought, not re-skinned; the
current renderers each invent their own layout. One vocabulary makes the wall
coherent and makes the redesigned widgets (D12–D14) consistent with the rest.

**Trade-off.** A shared vocabulary can flatten widget-specific needs (e.g. a
cover's transport, a scene's press feedback). Handled by keeping the vocabulary
to the card's *frame* (badge, title, metric, affordance slot) and letting each
widget own what fills the affordance slot — exactly as `DeviceTile` already owns
its archetypes.

## D12 — Light card: icon-affordance toggle, brightness bar, colour controls

**Decision.** The wall `light` archetype is redesigned on the supplied reference:
the device-icon badge (top-left) is a distinct, touch-sized on/off affordance; the
device name and a percentage readout sit beside it; and a full-width brightness
bar below is the brightness value control. Where the device declares a
colour-temperature capability the bar renders that spectrum (blue→warm) and
drives it, and where the device declares a colour capability a colour control is
added. While the light is off the bar carries an off-state visual and activating
it turns the light on. State is not conveyed by colour alone (the badge changes
shape/fill, not only hue). Everything runs on the existing optimistic channels
(`useOptimisticDeviceProperty`), so reflection, reconciliation, and revert are
unchanged, and every affordance meets the 56 px target (D4).

**Why.** The reference expresses a light's state and level far more directly than
the current name + chip + slider rows, and the user asked for colour and
colour-temperature control. The change is confined to the wall mode, so the
dashboard tile and the shared ranking/override code are untouched (D7).

**Trade-off.** Colour-temperature and colour controls are added only when the
capability exists, so two lights of the same type can show different controls.
Accepted: a control the device cannot express would be inert, and the spec forbids
that. Existing capability helpers cover on/off and brightness; the colour and
colour-temperature selection is added beside them in the wall tile.

## D13 — Temperature widget and a redesigned readout

**Decision.** A dedicated **`temperature`** widget type is added to the catalog,
carrying a reading from a configured sensor device (config
`{ qualifiedId, title? }`). It is an additive shared-contract change: a
`temperature` member of `WALL_WIDGET_TYPES`, a `WallTemperatureWidgetConfig` type,
and its schema in `WALL_WIDGET_CONFIG_SCHEMAS` (`packages/shared/src/wall.ts`,
`wall-schema.ts`), plus a `WALL_WIDGET_REGISTRY` descriptor
(`wall/registry.ts`), a renderer (`wall/widgets/TemperatureWidget.tsx`), and an
editor field (`wall/editor/WidgetConfigFields.tsx`). Separately, the wall
`readout` archetype (`DeviceTile`) is redesigned onto the D11 vocabulary — a
leading glyph, the reading on the metric ramp, and a quiet label — for sensors
shown inside `device`/`favorites`/`room`.

**Why.** The user asked for a temperature widget and for the sensor readout to be
rethought. The widget is a renderer over existing device state and the existing
readout ranking (`capability-ranking.ts` already ranks `temperature`); it needs
no new backend, service, or endpoint. Adding one catalog type is the minimum
shared change.

**Trade-off.** A new widget type grows the shared contract, the editor, and the
test matrix, and it is a config-shape addition (`WALL_PROFILE_VERSION` stays 1 —
the change is additive). Accepted as the user's explicit request. Multi-sensor
composition is deliberately not supported (one configured device, like the
existing `device` widget).

## D14 — Scene tile redesign

**Decision.** `SceneWidget` is redesigned from the centred Play glyph into a
Hearth scene tile — a leading scene glyph and label composed per D11, with the
existing pressed/busy/error states preserved (paint-only, so the tile does not
shift while operated). The manual-trigger path
(`manualTriggerContext`/`triggerAutomation`) and the failure-surfacing behaviour
are unchanged.

**Why.** The user named `scene` among the disliked widgets; the behaviour is
specified elsewhere and correct, so only its presentation changes.

**Trade-off.** None material; the scene trigger contract is untouched.

## D15 — Cover transport: up/down/stop as a declared capability

**Decision.** A cover declares the transport it accepts in its capability
description — a writable action enum (`open`/`close`/`stop`) — wherever the source
can perform those actions, and the source translates a command naming that action
into its own transport primitive. Concretely:
`device-sources/shelly-capabilities.ts` gains a writable `action` enum
(`["open","close","stop"]`) beside the existing writable `position` and read-only
`state`, and `device-sources/shelly-source.ts`'s `command()` maps
`action: "open"|"close"|"stop"` to `ShellyService.coverOpen`/`coverClose`/
`coverStop` (`Cover.Open`/`Cover.Close`/`Cover.Stop`). A Zigbee cover already
declares a writable `state`/`action` enum and needs no change. The wall's cover
detection (`lib/card-archetype.ts`) is broadened so a device is a cover when its
primary action is a `position` **or** it declares a writable transport action —
so a position-less cover no longer falls back to a generic enum control — and
`components/CoverTransport.tsx` presents up/down/stop using the declared
transport action, falling back to the position extremes. Stop stays gated by
`coverStopCommand()` (`capability-ranking.ts`), which already finds a stop token
on any writable enum; it is now satisfied for a Shelly shutter. A cover that
genuinely cannot stop still omits Stop. The dashboard keeps its existing
presentation — transport remains wall-only.

**Why.** The investigation showed `ShellyService.coverStop()` exists and works,
but nothing upstream could ask for it: the Shelly cover's `state` is read-only and
`ShellySource.command()` dispatches only `position`, so `coverStopCommand()`
correctly found no stop and the wall omitted Stop. Declaring the transport as a
capability follows the descriptor's existing pattern for on/off encoding and
colour, keeps one source-neutral vocabulary, and needs no Shelly special-case in
the UI.

**Trade-off.** A Shelly cover gains a second writable property (`action`) beside
`position`; a consumer may set either. Accepted: `position` is go-to and `action`
is discrete transport, mirroring how HomeKit and the service already split
target-position from stop. A source that cannot stop omits `stop` from its
declared values rather than declaring then refusing it.

## Dependency direction and shared contracts

Hearth is presentational, and `@ts-ha/web-ui` remains a pure client of `/api/*`
and the event stream. The one shared change is additive: `temperature` joins
`WALL_WIDGET_TYPES` and gains a config type and schema in
`packages/shared/src/wall.ts` / `wall-schema.ts` (D13), so the server's write
validation and the editor resolve the new type from the same definition site.
`scripts/contract-inventory.json` is updated if the new type is a tracked
contract. The one core change is `@ts-ha/core`'s cover transport (D15):
`device-sources/shelly-capabilities.ts` declares the transport action and
`shelly-source.ts` dispatches it; no other core behaviour changes and no shared
capability type is added (the existing generic `Capability` contract carries the
action enum). There is no `@ts-ha/cli` change, and the `shared` ← `web-ui`
direction and the "no `core` import" rule are unchanged.

## Risks

- **Two-system drift**: Hearth and Lumen can diverge unintentionally. Mitigated by
  a wall-owned declaration site, the `design-system/ts-ha/pages/wall.md` override,
  and confining Hearth to the wall display (D8).
- **Chunk hoisting**: a stray Hearth import from the entry or the editor could pull
  the wall CSS into first paint. Caught by the extended `web-ui-assets.test.ts`
  assertion (D5).
- **Light-scheme dilution**: a true-black dark scheme can tempt a mechanical light
  inversion. The spec's "The light wall scheme is designed" scenario guards this.
- **Sparse colour capability coverage**: not every light declares colour
  temperature or colour, so the same archetype shows different controls per
  device. Mitigated by rendering a control only when the device declares the
  capability and never rendering it inert (D12).
- **Cover transport overstated**: a cover that cannot truly stop must not offer
  Stop. Mitigated by keeping Stop gated on the declared stop value — a source
  omits `stop` from its transport values when it cannot stop (D15).
- **Shared-contract growth**: the temperature widget adds a type and config to
  `@ts-ha/shared`, which the guard scripts and inventory must reflect. Mitigated
  by keeping the addition additive (`WALL_PROFILE_VERSION` unchanged) and fixing
  the contract at its single definition site (D13).
- **Scope creep into composition or runtime**: the composition model and any new
  backend/service remain non-goals; the only catalog change is the additive
  temperature widget. Anything beyond that is a separate change.
