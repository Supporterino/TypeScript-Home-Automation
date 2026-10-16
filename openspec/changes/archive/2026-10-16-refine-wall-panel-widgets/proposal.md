## Why

The wall display is in daily use, and four panel behaviours make it awkward: a
scene cannot be authored as a slim one-row tile, the energy readout shows only a
lifetime cumulative total rather than recent usage, four temperature sensors in
different rooms all read the same word "Sensor", and a cover's transport
controls sit bunched at the left of a wide card instead of using the width.

## What Changes

- **Scene widget can be one row tall.** `scene.min.h` drops from 2 to 1. At one
  row the scene tile renders **chrome-less** — the whole cell is the target — so
  the wall's 42 px touch-target floor is preserved rather than exempted; at two
  rows or more it keeps today's framed glyph-and-label tile.
- **Energy widget shows recent usage, not the lifetime total.** A new
  `@ts-ha/shared` contract carries the home's usage over a rolling window plus
  the window length and the sample coverage, so a client can distinguish a full
  window from a partial one. The core aggregator retains cumulative-energy
  samples to compute the delta; the wall energy widget presents that usage in
  place of "Total". This is a **BREAKING** wire-contract addition to
  `EnergyData`.
- **Temperature widget identifies its sensor by room.** The widget's label
  becomes the bound device's room name where the device is assigned to a room,
  falling back to the (shortened) device name otherwise, so four identical
  "Sensor" devices read as their rooms.
- **Device card actions rows centre and distribute.** Every typed device card's
  actions row uses the card's full width: a row of fixed icon controls
  distributes evenly, and a row that contains a flexible control (a slider or an
  enumerated control) keeps that control flexible while its fixed icon controls
  are centred/distributed, so no slider is distorted.
- Docs and tests updated for all four; one Changeset covering `@ts-ha/shared`,
  `@ts-ha/core`, and `@ts-ha/web-ui`.

## Capabilities

### New Capabilities

_None._ Every behaviour below refines an existing capability.

### Modified Capabilities

- `wall-display`: the scene widget's grid minimum and its one-row composition;
  the temperature widget's label identifying the sensor's room; the energy
  widget presenting recent usage rather than the cumulative total; and the
  actions-row presentation of a device card.
- `energy-monitoring`: a new rolling-window usage reading (with its window
  length and coverage) derived from cumulative-energy samples, exposed on the
  energy endpoint alongside the existing instantaneous power and cumulative
  total.

## Non-Goals

- **No change to the dashboard energy view.** The dashboard keeps its Current
  power / Cumulative / Metering devices stats; the new usage field is surfaced
  on the wall only.
- **No configurable energy window.** The window is fixed at 24 hours; the change
  reports its length and coverage but does not make it an author's setting.
- **No persistence of energy history.** Restart-survival of the retained samples
  stays out of scope, as the energy-monitoring capability already states; a
  partial window is reported as partial rather than backfilled.
- **No change to `@ts-ha/cli`** and no new widget types, profile version, or
  profile-config shape.
- **No change to the scene trigger contract** or to the ported card metrics
  (control height, radius, type sizes); the actions-row change is alignment and
  distribution only.
