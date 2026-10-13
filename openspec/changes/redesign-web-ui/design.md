# Design — Web UI Redesign (Lumen)

## Context

`@ts-ha/web-ui` serves a client-rendered React dashboard from the engine's HTTP
server. It is a pure client of the engine's `/api/*` JSON endpoints and the SSE
event stream. Its current frontend is React 19 + Mantine v9, styled by a Mantine
theme (`src/app/theme.ts`) over a token stylesheet
(`src/app/styles/tokens.css`), documented as the "Ambient Glass" system in
`design-system/ts-ha/MASTER.md`, and compiled by `Bun.build` in
`scripts/build-web-ui.ts` into content-hashed, code-split, pre-compressed asset
modules with a ≤250 KB gzip first-paint budget.

The dependency direction is fixed: `shared` ← `web-ui`, and `web-ui` MUST NOT
import `@ts-ha/core`. The data layer (`src/app/lib/**`) — routing, the data
store, optimistic actuation hooks, capability ranking, coalescing, revert
deadlines — is framework-agnostic and is **kept**, not rewritten. This change is
a presentation-layer redesign plus the stack migration that makes it possible.

---

## D1 — Migrate to Tailwind CSS v4 + Radix UI + lucide-react

**Decision.** Replace Mantine and `@tabler/icons-react` with Tailwind CSS v4 for
styling, Radix UI headless primitives for accessible interactive components, and
`lucide-react` for icons. React 19, `Bun.build`, and the existing asset pipeline
are unchanged.

**Why.**
- Mantine's component geometry, layout primitives (`AppShell`, `Group`, `Stack`),
  and theming model are what make the current UI read as "stock Mantine". A real
  redesign has to own layout and component geometry.
- Tailwind v4 is a CSS-first engine: tokens are declared once in `@theme` and
  become utilities, so the token layer *is* the utility layer — there is no
  theme-object-to-CSS bridge to keep in sync (the thing `theme.ts` +
  `tokens.ts` + `tokens.css` currently do, and which `theme.test.ts` exists to
  police).
- Radix supplies the hard, accessibility-sensitive behaviour (focus traps,
  roving tabindex, typeahead, ARIA wiring) for dialog, drawer, menu, tabs,
  switch, slider, tooltip, select, popover, toggle group — without imposing
  visual styling, so the design system stays ours.
- Dropping Mantine removes its stylesheet and runtime overhead, which helps the
  first-paint budget rather than threatening it.

**Trade-offs.** Migrating off Mantine is the largest possible rewrite of
`src/app/**` and requires reworking the presentational tests. The alternatives
were: (a) stay on Mantine and reskin — rejected because it does not deliver a
genuinely new design system and the user explicitly permitted migration; (b)
vanilla CSS Modules with hand-rolled primitives — rejected because it forfeits
Tailwind's token-to-utility ergonomics and means hand-writing every accessible
interactive primitive that Radix provides.

**Impact.** New deps in `packages/web-ui/package.json`. `theme.ts`, `tokens.ts`
and `styles/tokens.css` are replaced (see D3). No dependency-direction change.

---

## D2 — Tailwind integration in the `Bun.build` pipeline

**Decision.** Add `bun-plugin-tailwind` to `scripts/build-web-ui.ts` and make the
Tailwind stylesheet the CSS entry. Keep the rest of the pipeline — content
hashing, `splitting: true`, the `development` condition for `@ts-ha/shared`, the
externalised/rewritten self-hosted font, per-asset `gzip` compression,
`firstPaint` flagging, and the manifest emission — exactly as it is.

Concretely:
- `Bun.build({ plugins: [tailwind], ... })` alongside the existing options.
  (`bun-plugin-tailwind@0.1.x` default-exports the plugin **instance**, not a
  factory — so it is passed as `[tailwind]`, not `[tailwind()]`.)
- The entry CSS (`src/app/styles/app.css`) begins with `@import "tailwindcss";`,
  followed by `@theme` token declarations and layer overrides. `index.tsx`
  imports this file (not Mantine's stylesheet).
- Tailwind v4 scans source files for class usage automatically; ensure the app
  directory is scanned (default content detection covers `src/app/**`). No
  `tailwind.config.js` is required by default; if one is needed for content
  globs, add `packages/web-ui/tailwind.config.ts`.
- No PostCSS pipeline, no `autoprefixer` (Tailwind v4 handles vendor concerns
  for its own output).

**Why.** `bun-plugin-tailwind` is the supported bridge between Tailwind v4's
engine and `Bun.build`, and it operates on the CSS entry the build already
bundles, so it does not disturb the asset/manifest machinery the server and the
first-paint gate depend on.

**Trade-off.** The plugin is version-pinned (`0.1.x`); if it proves unstable the
fallback is Tailwind's own CLI emitting a stylesheet the build script then feeds
through the existing pipeline. Documented here so the fallback is deliberate.

---

## D3 — The "Lumen" token architecture

**Decision.** Define the design system once, as semantic CSS custom properties
under `:root` (dark, authoritative) and `[data-theme="light"]` (designed, not
inverted), and expose them to Tailwind through `@theme inline` so utilities like
`bg-surface`, `text-muted`, `border-hairline`, `rounded-tile` resolve to the
tokens. Views use tokens/utilities; **no literal hex in a view.**

### Colour tokens

| Token | Dark (authoritative) | Light (designed) | Use |
|---|---|---|---|
| `--bg` | `#0B0F17` | `#F6F8FC` | app background |
| `--surface` | `#121826` | `#FFFFFF` | tiles / cards |
| `--surface-2` | `#1A2334` | `#EEF2F9` | raised / hover |
| `--surface-3` | `#222D42` | `#E3EAF5` | pressed / inset |
| `--hairline` | `rgba(255,255,255,0.08)` | `#DCE3EF` | borders, dividers |
| `--text` | `#F3F6FC` | `#0D1526` | primary text |
| `--text-muted` | `#9AA6BC` | `#5B6B85` | secondary text |
| `--on` | `#34D399` | `#059669` | device on / active |
| `--stale` | `#F59E0B` | `#B45309` | stale observation |
| `--danger` | `#F87171` | `#DC2626` | unreachable / failed |
| `--info` | `#5EA8FF` | `#2563EB` | informational |
| `--accent` | `#5EA8FF` | `#2563EB` | interactive accent |
| `--accent-fg` | `#0B0F17` | `#FFFFFF` | text on accent |
| `--focus` | `#7CB8FF` | `#1D4ED8` | focus ring |

Contrast rules (asserted by tests, mirroring the existing gate in
`tests/theme.test.ts`): `--text` on every surface ≥ 4.5:1; `--text-muted` on
`--surface`/`--surface-2` ≥ 4.5:1; `--on`/`--stale`/`--danger`/`--info` on
`--surface` ≥ 3:1; in **both** schemes.

> The exact hex values above are the starting palette; they may be tuned by the
> implementation to satisfy the contrast assertions in both schemes, provided
> the semantic role of each token is preserved and no scheme is a mechanical
> inversion of the other.

### Non-colour, radius, spacing, elevation, motion

- Radius: `--radius-input 12px`, `--radius-tile 16px`, `--radius-card 20px`,
  `--radius-pill 999px`.
- Spacing rhythm: 4 / 8 / 12 / 16 / 24 / 32 / 48 px.
- Elevation: `--e0 none`, `--e1` soft `0 1px 2px rgba(0,0,0,.28)`, `--e2`
  overlay `0 16px 40px rgba(0,0,0,.36)`; dark and light may differ.
- Motion: enter 200 ms fade + 8 px translate, 40 ms stagger; toggle/echo 130 ms
  colour/opacity only; easing `cubic-bezier(.22,1,.36,1)`; all non-essential
  motion suppressed under `prefers-reduced-motion: reduce`.
- Typography: display **Plus Jakarta Sans** (self-hosted, subset, content-hashed
  — kept from the current build), body = system stack (no download), mono =
  `ui-monospace` stack. Scale 12.5 / 14 / 16 / 18 / 22 / 28 / 34 px; numeric
  readouts may reach 34 px.

**Why.** A single declaration site for tokens is what the "Visual Design System"
spec already requires and what the anti-pattern list ("no per-view hard-coded
values") demands. Tailwind v4's `@theme` makes that declaration the utility
source, removing the drift the old `theme.ts`↔`tokens.css`↔`MASTER.md` triangle
could create.

---

## D4 — Theming without a vendor manager, without a flash

**Decision.** The active scheme is an attribute on `<html>`, `data-theme="dark" |
"light"`. A tiny inline script in the dashboard shell (`html-shell.ts`) sets it
before the first paint from `localStorage["ts-ha-theme"]`, falling back to
`prefers-color-scheme`. A React `useTheme()` hook reads the attribute, exposes
`theme`/`setTheme`/`resolvedTheme`, offers a three-way control
(light/dark/system), and persists the choice.

**Why.** Mantine's colour-scheme manager is removed with Mantine; the app must
own scheme selection. Applying it in the shell's `<head>` is the only way to avoid
a flash of the wrong theme, which the current Mantine setup avoids only by luck
of `getInitialValueInEffect`.

**Trade-off.** The inline bootstrap is a small amount of un-hashed inline script
in the shell; it is not part of the cached bundle, which is acceptable (it is a
few hundred bytes and the spec already permits the shell to be small and
tokenised, and forbids inlining the *bundles*, not a bootstrap snippet).

---

## D5 — Shared primitive layer and the component mapping

**Decision.** Introduce `src/app/ui/` — a small, styled, token-driven component
library wrapping Radix where behaviour is needed, split into:

- `ui/` layout & display: `Card`, `Stack`, `Row`, `Grid`, `Badge`, `Chip`,
  `Divider`, `Spinner`, `EmptyState`, `Stat`, `ScrollArea`.
- `ui/` interactive (Radix-backed): `Dialog`, `DropdownMenu`, `Switch`,
  `Slider`, `ToggleGroup`, `Select`, `Tooltip`, `Collapsible`.
- A `cn()` class-merge helper (`clsx` + `tailwind-merge`).

(The shipped set is exactly what the views consume. Primitives that no view
ended up needing — `Drawer`, `Tabs`, `Popover`, `Meter`, `Skeleton`, `Toast` —
were removed in review along with their now-unused `@radix-ui/*` dependencies,
rather than shipped as dead code.)

Mapping from the Mantine usage the app currently has:

| Mantine | Replacement |
|---|---|
| `AppShell` (+Header/Navbar/Footer/Main) | custom shell in `App.tsx` + `ui/` layout (D6) |
| `Paper`, `Card` | `ui/Card` |
| `Group`, `Stack`, `Box`, `SimpleGrid`, `Grid` | Tailwind flex/grid utilities with `ui/` helpers |
| `Text`, `Title`, `Anchor` | semantic elements + typography utilities |
| `Button`, `ActionIcon` | `ui/Button`, `ui/IconButton` |
| `NavLink`, `UnstyledButton` | `ui/NavItem`, `ui/Button variant="ghost"` |
| `ScrollArea` | `ui/ScrollArea` (thin styled scrollbar) |
| `Modal`, `Drawer` | `ui/Dialog` (Radix Dialog) |
| `Menu` | `ui/DropdownMenu` (Radix) |
| `Switch` | `ui/Switch` (Radix) |
| `Slider` | `ui/Slider` (Radix) |
| `SegmentedControl` | `ui.ToggleGroup` (Radix) |
| `Select`, `MultiSelect`, `Combobox` | `ui/Select` (Radix) or a styled native `<select>` where a popover is overkill |
| `Badge`, `Pill` | `ui/Badge`, `ui.Chip` |
| `Tooltip` | `ui.Tooltip` (Radix) |
| `Table` | styled `<table>` in `ui/` |
| `Loader` | `ui/Spinner` |
| `Notification`/toast | an inline banner in the view (no toast primitive) |
| `@tabler/icons-react` | `lucide-react` |

**Why.** A thin shared layer keeps every view consuming one vocabulary of
token-driven primitives, which is exactly the "single designed system, not
library defaults" requirement, and localises the Radix wiring so views stay
declarative.

**Impact.** The existing components (`DeviceTile`, `CapabilityControl`,
`CoverTransport`, `SourceViewer`, `ErrorBoundary`, `Nav`) are rebuilt against
`ui/*`. Their **props and behaviour contracts are preserved** so the pure logic
and the data-layer hooks they sit on do not change.

---

## D6 — Responsive, mobile-first shell and information architecture

**Decision.** One information architecture (control group + operator group),
presented appropriately per viewport, mobile-first:

- **Narrow (< md):** a sticky top app bar (title, transport indicator, theme
  control) that respects `env(safe-area-inset-*)`, and a bottom **control-first**
  tab bar with the control group's primary destinations (Home, Rooms, Devices)
  plus an overflow affordance for the remaining control entries — the primary
  device-control surfaces remain one tap away and are never behind a modal menu.
  Operator views are not promoted here; they stay reachable by URL. Content is
  inset above the tab bar so it is never obscured.
- **Wide (≥ md):** a persistent left navigation rail showing both groups, each
  collapsible, with the Favorites sub-list labelled distinctly from rooms when
  favourites exist.
- **Both:** active-state matching follows a detail route back to its collection
  entry; `/devices/unassigned` does not light "All devices".

**Why.** The spec ("Responsive Navigation", "Navigation and Information
Architecture") fixes the IA and the narrow/wide split; the current shell inherits
Mantine's `breakpoint: "sm"` boundary and desktop-first paddings, which is why
the phone experience feels like a shrunk desktop. Mobile-first Tailwind
breakpoints and safe-area insets fix that.

**Impact.** `App.tsx`, `components/Nav.tsx`, and the shell height constants are
replaced. `lib/router.ts` (`MOBILE_NAV_ITEMS`, `isUnder`, `isOverviewView`) is
kept.

---

## D7 — Icons

**Decision.** `lucide-react`, imported per-icon (named imports) so the bundler
tree-shakes to the icons actually used. No icon fonts, no emoji as structural
icons.

**Why.** Consistent stroke geometry, tree-shakeable, and replaces the Tabler set
1:1 well enough. The icon role (decorative vs meaningful vs control) is decided
per use: decorative icons beside text get `aria-hidden`; icon controls get an
accessible name; state icons pair with a label (D9).

---

## D8 — Motion

**Decision.** Motion stays CSS-only (no animation library, protecting the
first-paint budget). Enter/stagger/toggle tokens as in D3; every transition is
transform/opacity/colour only and never changes layout bounds; the token
stylesheet neutralises non-essential motion under `prefers-reduced-motion`.

**Why.** The spec's motion clause and the anti-pattern list both forbid an
animation library in first paint and any layout-shifting motion.

---

## D9 — Accessibility and state encoding

**Decision.** State is never colour alone: on/off pairs a filled/outline icon and
a label; stale pairs a clock icon with the age text; unreachable pairs a
slashed-plug icon and "unreachable". Focus is always visible (`:focus-visible`
ring using `--focus`); interactive targets meet WCAG target size with mobile
targets enlarged; overlays trap focus (Radix); controls have accessible names and
expose selected/pressed/expanded state.

**Why.** Spec "Visual Design System" requires non-colour state encoding and AA
contrast; the ui-ux-pro-max UX guidance adds target-size, focus, and
reduced-motion requirements.

---

## D10 — Fonts

**Decision.** Keep the self-hosted Plus Jakarta Sans display face and the
existing build-time font emission/rewrite (content-hashed `.woff2`, counted
against first paint). Body uses the system stack (no download). No third-party
font origin.

**Why.** Spec "Self-Hosted Typography" requires it, and the existing build
machinery already implements it — the change is only that the font is now
referenced from the Tailwind entry stylesheet rather than the token stylesheet.

---

## D11 — First-paint budget and code splitting

**Decision.** Preserve the ≤250 KB gzip first-paint budget and the enforcement
in the build. Keep `splitting: true`; the per-view lazy dynamic imports and the
lazy `prismjs` syntax highlighter stay lazy (loaded only when a source view is
opened). Tailwind's output replaces Mantine's stylesheet, which should reduce the
CSS contribution.

**Why.** Spec "Asset Delivery and Caching" and "Automation Management Interface"
(the highlighter MUST NOT load on first paint).

---

## D12 — Behaviour is preserved; only presentation changes

**Decision.** The data layer (`lib/data-store.tsx`, `lib/router*.ts`,
`lib/use-optimistic-property.ts`, `lib/command-coalescing.ts`,
`lib/revert-deadline.ts`, `lib/capability-ranking.ts`, `lib/card-archetype.ts`,
`lib/favorites.ts`, `lib/energy.ts`, `lib/weather.ts`, `lib/overview.ts`,
`lib/humanize-name.ts`, `wall/*-model.ts`, `wall/live.ts`, `wall/grid.ts`, and
the API client) is untouched in behaviour. Only their *consumers* (views and
components) are rebuilt. Components keep their props/contracts so this holds.

**Why.** The spec fixes a large amount of behaviour (snapshot-then-stream
reconciliation, optimistic actuation with per-descriptor revert deadlines,
per-property coalescing, capability-driven controls, hidden/operable filters,
group presentation). None of it is the subject of this change; re-typing it in a
new component style must not alter it.

---

## D13 — The wall surface

**Decision.** The full-bleed wall (`src/app/wall/**`) is re-skinned onto the
Lumen tokens and `ui/*` primitives but keeps its own grammar: chrome-less
ambient widgets, surface control widgets, clamped row unit, single clamped
gutter, its type ramp, and the wall-only device-tile mode (whole-card actuation,
no open-detail/management affordances). It is still not a navigation destination.

**Why.** The `wall-display` capability governs the wall; this change must not
re-scope it, only bring it onto the new system. The page override
`design-system/ts-ha/pages/wall.md` is updated to the Lumen tokens.

---

## D14 — Tests

**Decision.**
- Pure-logic tests (`lib/**`, `wall/*-model`, etc.) are unchanged.
- `tests/theme.test.ts` is rebound to the new token source: it parses the
  Tailwind entry stylesheet's `:root`/`[data-theme="light"]` blocks and asserts
  the same contrast rules; it asserts the new accent module (if any) is not
  Mantine's blue.
- Presentational tests that asserted Mantine internals are re-pointed at the new
  primitives/labels; their *intent* (e.g. "the tile presents a single primary
  action", "no `live`/`polled·` text on the wall card face") is preserved.
- `web-ui-assets.test.ts` / first-paint assertions are unchanged and must still
  pass.

**Why.** The behavioural guarantees live in the spec and must keep being
asserted; only the implementation detail under test changes.

---

## Risks

- **Scope**: this is a rewrite of `src/app/**` (~10.5k LOC) in one pass. Mitigated
  by keeping the data layer fixed and by the component-mapping table (D5) making
  the mechanical translation unambiguous.
- **Budget regression**: Tailwind *should* shrink CSS, but a naive per-icon import
  or an accidental first-paint import of Radix's larger primitives could regress
  the budget; the build gate catches this and the fix is to keep heavy views and
  the highlighter lazy.
- **Plugin stability**: `bun-plugin-tailwind@0.1.x`; the documented fallback
  (Tailwind CLI) avoids a dead end.
- **Theme flash**: mitigated by the shell bootstrap (D4) and covered by a manual
  check.
