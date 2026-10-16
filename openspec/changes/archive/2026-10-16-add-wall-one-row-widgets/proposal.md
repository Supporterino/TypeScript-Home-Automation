## Why

The wall display lets a scene be authored as a slim one-row tile, but a `link`
and a control-less device (an `entity`, or a `lock`/`climate`/`fan` that reports
no writable property) still force a two-row minimum, so they cannot sit on a
single dense row beside the widgets that can. This extends the scene's one-row
treatment to a route and to the read-only device cards that a one-row cell can
actually hold.

## What Changes

- **A `link` may be one row tall.** `link.min.h` drops from `2` to `1` and its
  minimum width stays `2`. At one row the link renders the same way a one-row
  scene does: the frame draws **no surface** and the link draws **flush** (no
  border, no raised background, no inset), so the whole cell is the link's touch
  target, at or above the wall's 42 px floor. At two rows or more the framed
  `WallCardRoute` pill returns.
- **A read-only device widget may be one row tall.** A typed device widget whose
  bound device presents **no controls** — an `entity`, or a device that reports a
  class but no writable property — gets a one-row minimum. A widget whose bound
  device *does* present controls keeps its two-row minimum. The effective
  minimum is therefore **device-aware**, not a fixed per-type number.
- **A shared `slim` card tier.** A one-row device cell composes a new smallest
  card form: a single inline line (`icon` + `name — state`), the whole cell
  actuating a toggle, no observation glyph. Every read-only-capable card
  composes it, not `entity` alone.
- **One declared slim rule.** Each widget type declares its one-row behaviour
  once, in the registry descriptor, as `slim?: { min, when: "always" | "read-only" }`.
  The frame's surface decision and the effective-minimum resolver both read it,
  replacing the scene-specific branch.
- **The device-aware minimum is single-sourced.** One resolver, fed by each
  card's own "presents no controls" readiness, drives the wall frame's
  too-small guard (which reads the store), the editor's placement clamp, and
  `validateProfileDraft` (which gains an optional device set).
- Docs and tests updated; one Changeset covering `@ts-ha/web-ui`.

This is **not** a wire or profile change: `WALL_PROFILE_VERSION`, the profile
config shape, and the shared contracts are untouched — a one-row link or
read-only device is newly *authorable*, not newly *loadable*.

## Capabilities

### New Capabilities

_None._ Every behaviour below refines the existing `wall-display` capability.

### Modified Capabilities

- `wall-display`: a one-row link (its minimum span and chrome-less composition);
  a device-aware one-row minimum for a control-less device widget and the
  `slim` card form that composition uses; and the registry-declared slim rule
  that both the frame's surface and the minimum resolver read.

## Impact

- **Packages:** `@ts-ha/web-ui` only. The registry, the widget frame, the editor
  model, the shared card composition and each typed card change. `@ts-ha/shared`
  is unchanged (the profile schema validates geometry only and never enforced a
  minimum); `@ts-ha/core` and `@ts-ha/cli` are untouched.
- **Docs:** `design-system/ts-ha/pages/wall.md` (the widget span table, the
  grammar note, and the Scene/Link/device-card prose) and `docs/http/web-ui.md`
  (the grammar and widget-type paragraphs).
- **Tests:** `wall-registry`, `wall-single-surface`, `wall-span`, `wall-frame`,
  `wall-editor`, `wall-scene-tile`, and the wall harness tests.
- **Changeset:** one, covering `@ts-ha/web-ui`.

## Non-Goals

- **No change to the wall touch-target or type-ramp floors.** One row stays
  chrome-less precisely so the 42 px floor holds; the floors themselves do not
  move.
- **No new widget types, profile version, or profile-config shape.** A one-row
  placement is newly authorable; no persisted profile migrates.
- **No one-row minimum for a widget whose device presents controls.** A light,
  cover, fan, climate, lock, number, or select that carries controls keeps its
  two-row minimum, and a hand-authored sub-minimum cell still renders the
  wall's contained explanation.
- **No change to paged tiles.** A room, favorites, or device-grid tile still
  composes at two rows.
- **No `@ts-ha/shared`, `@ts-ha/core`, or `@ts-ha/cli` change.**
