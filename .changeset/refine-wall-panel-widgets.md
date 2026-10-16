---
"@ts-ha/shared": minor
"@ts-ha/core": minor
"@ts-ha/web-ui": minor
---

Refine four wall-panel behaviours: a one-row scene tile, windowed energy usage in
place of the lifetime total, a temperature label that identifies its sensor's room,
and device-card actions rows that use their card's width.

**`@ts-ha/shared` — `EnergyData` gains a windowed usage reading.** Three optional flat
fields: `usageWh` (the home's usage over the rolling window, in watt-hours),
`windowMinutes` (the window's length — `ENERGY_HISTORY_MINUTES`), and
`coveredMinutes` (the extent the retained samples actually cover, never above
`windowMinutes`). `usageWh` is the sum, across the devices that report a cumulative
reading at **both** ends of the retained span, of each device's change; it is absent
rather than zero when there is no baseline or no device contributes at both ends, so a
client presents usage as absent instead of as a false zero. The addition is additive —
an older client simply ignores the fields — but it is **labelled breaking**: it
changes what the energy widget presents.

**`@ts-ha/core` — the aggregator retains per-device cumulative samples.**
`EnergyAggregator` keeps a second bounded ring of every reachable device's
cumulative-energy reading alongside the power ring, and `snapshot()` derives the
windowed usage, its window, and its coverage from it. A device that is unreachable or
declares no cumulative reading is absent from the ring rather than recorded as zero,
so a device that **becomes unreachable mid-window** leaves the window instead of
subtracting its consumption from it. The window and coverage are reported whenever
history is enabled; the usage is absent when nothing has been covered.

**`@ts-ha/web-ui` — the wall shows recent usage, identifies a sensor's room, and fills
its actions rows.** The energy widget presents the windowed usage in place of the
cumulative lifetime total, labelled with the span the retained samples cover (`last
24h`, or `last 6h` when partial), and draws the reading as absent when nothing is
covered. The temperature widget labels its sensor by the device's room where the store
assigns it one, else by the shortened device name, so identically-named sensors read
as their rooms. A scene's minimum span drops to `2 × 1`: a one-row scene renders
chrome-less, so the whole cell is its touch target rather than a tile inset below it,
and the framed glyph-and-label tile returns at two rows or more. Every typed card's
actions row uses its card's width — a row of fixed controls distributes across it, and
a row containing a slider keeps the slider flexible and centres the fixed controls —
with the ported control height and radius unchanged.

The dashboard's device tile and its own energy view (Current power / Cumulative /
Metering devices) are unchanged, as are the wall profile shape and version, the scene
trigger contract, the energy window as a configuration value, energy-history
persistence, and every other wall widget; `@ts-ha/cli` is untouched.
