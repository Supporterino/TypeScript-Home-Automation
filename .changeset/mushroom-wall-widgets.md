---
"@ts-ha/web-ui": minor
---

Give the wall one card vocabulary, and present a temperature sensor's humidity.

The wall carried two card vocabularies: the ported Mushroom anatomy for device
cards, and `wall/widgets/card-vocab.tsx` — a bare glyph, an 18 px uppercase label,
and pill affordances — for every other widget, the frame, the zone band and the
panel chrome. `card-vocab.tsx` retires: every widget, the widget frame, the zone
band and the panel's own explanations are now composed from the ported anatomy
(`wall/cards/card-anatomy.tsx`) and its token table, so a panel reads as one
designed whole.

**Two guarantees move with it.** The wall's type ramp gives up its **18 px** body
floor for the ported card system's secondary size (**12 px**) and its label tier for
the ported primary size (**14 px**), and the compact status-chip exception retires
with its `--hearth-text-chip` token, because nothing is left below the floor to
except. The frame's inset follows the ported card surface's own padding
(**16 → 10 px**), which re-derives the frame and page reservations, the page plans,
the fit verdict, the editor's reported floors and page counts, and the harness
fixtures. The readout tiers are untouched, so a readout's value keeps the wall's
distance scale and what is read across a room is unchanged; the harness at
1920 × 1080 is the check on the smaller supporting text.

**The temperature widget presents its sensor's humidity** where the bound device
declares a reading, as the widget's secondary reading — one value with its own unit,
never split. The reading is the device's own capability, so there is no new config
field, no editor field and no profile version: the profile shape is unchanged, a
sensor that declares no humidity renders exactly as before, and `@ts-ha/shared`
and `@ts-ha/core` are untouched.

**The weather widget composes for the box it is given.** Leading with the ported
condition affordance makes its stacked layout taller than its 3 × 3 minimum-span
cell, so the widget draws what the box holds — the condition, temperature, humidity
and wind always render, and the forecast appears from the span that holds it. Its
declared minimum span is unchanged.
