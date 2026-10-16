---
"@ts-ha/web-ui": minor
---

Let a `link` and a control-less device widget sit on a single wall row.

A `link` and a typed device widget whose bound device's card draws **no control of
its own** are now authorable at one grid row, beside the one-row scene the wall
already draws. The link's minimum drops to `2 × 1` and a read-only device's effective
minimum to `3 × 1`, so a dense row can carry a route and a read-only reading where it
previously forced two rows.

**The one-row rule is declared once.** Each widget type declares its slim behaviour in
the registry descriptor as `slim?: { min, when: "always" | "read-only" }`; the frame's
surface decision and the effective-minimum resolver both read that one declaration,
replacing the scene-specific branch. At one row the frame draws no surface and the
link draws a **flush** route — no border, no raised background, no inset — so the
whole cell is the link's touch target, at or above the wall's 42 px floor; at two rows
or more the framed labelled route returns.

**The minimum is device-aware.** A widget whose bound device's card draws no control
of its own — an `entity`, or a device whose only writable state is its on/off toggle
— is authorable at one row and composes a shared **slim** card form: a single inline
line, whole-cell actuation where the primary action is a toggle, and no observation
indicator. A widget whose card draws a control keeps its two-row minimum. The
same resolver drives the editor's placement clamp and the save validation, so
authoring and validation agree, and a hand-authored sub-minimum cell still renders the
wall's contained explanation rather than a clipped card.

This is not a wire or profile change: `WALL_PROFILE_VERSION` and the profile config
shape are untouched — a one-row link or read-only device is newly *authorable*, not
newly *loadable*. `@ts-ha/shared` and `@ts-ha/core` are unchanged.
