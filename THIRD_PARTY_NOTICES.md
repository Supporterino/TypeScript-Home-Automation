# Third-party notices

TypeScript Home Automation is licensed under **GPL-3.0** — see [LICENSE](LICENSE).
This file records the third-party work whose design or values this repository
ports, with its licence and the terms of the reuse.

---

## piitaya/lovelace-mushroom — Apache-2.0

- **Project:** [piitaya/lovelace-mushroom](https://github.com/piitaya/lovelace-mushroom)
- **Licence:** [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0)
- **Contact:** https://github.com/piitaya/lovelace-mushroom

### What is ported

The wall's device cards (`packages/web-ui/src/app/wall/cards/**`,
`packages/web-ui/src/app/wall/hearth.css`) draw their anatomy, their metrics, and
their per-card options from Mushroom's device cards:

- **Card anatomy** — the state item (a leading icon affordance beside a name over a
  state or reading line), the shape icon, the actions row, and the slider with its
  bar thumb (Mushroom's `src/shared/{state-item,shape-icon,slider,card}.ts` and
  `src/utils/card-styles.ts`).
- **Token values** — the icon size and glyph ratio, the circle shape, the primary
  and secondary type ramps, the control height, radius, and spacing, the card
  padding and radius, and the slider's height, radius, and thumb (Mushroom's
  `src/utils/theme.ts`). These are re-declared as this repository's own
  `--hearth-card-*` tokens with the ported source recorded per line.
- **Device-colour handling** — `improveColorContrast` (Mushroom's
  `src/cards/light-card/utils.ts`): a saturation floor for a washed-out colour and a
  lifted value for a near-grey, drawn as the glyph colour over a 25 %-alpha fill and
  as the slider's colour over a 20 %-alpha field.
- **Per-card options** — `layout` (`default` | `vertical` | `horizontal`) and
  `collapsible_controls` (controls hidden while the device is inactive), and the
  organisation of the card set as one card per device class.

### Terms of the reuse

Mushroom is licensed under Apache-2.0 and this repository is licensed under
GPL-3.0; the Apache-2.0 → GPL-3.0 direction is the permitted one, and this notice is
the attribution it requires.

**No Mushroom source is vendored.** Mushroom's cards are `LitElement` classes bound
to Home Assistant's frontend — they read a `hass` object and render `ha-*`/`hui-*`
custom elements — so they cannot be imported here. The cards under
`packages/web-ui/src/app/wall/cards/` are an original React re-implementation
against this codebase's own data model, released under this repository's GPL-3.0
licence; what is derived is the design (the anatomy and its metric values), not
copied code.

The port is documented for contributors on the wall's design-system page:
[`design-system/ts-ha/pages/wall.md`](design-system/ts-ha/pages/wall.md#wall-device-cards).
