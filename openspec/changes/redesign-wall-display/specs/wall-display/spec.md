## MODIFIED Requirements

### Requirement: Wall Glanceability

A wall MUST be composed so it is legible at a glance from across a room, and its
card sizes MUST reflect each widget's declared span rather than the panel
height.

A widget's rendered height MUST be derived from its grid span and a bounded row
unit, so that a widget occupying a small span is not inflated to fill the panel.
A profile whose widgets occupy fewer rows than fill the panel MUST occupy its
natural height, centered, rather than stretching every card to fill the panel.

The wall MUST apply a type scale larger than the dashboard's body scale, sized
for viewing at distance, and MUST present ambient readouts distinctly from touch
controls. The wall's type ramp MUST be owned by the wall and MUST declare its own
minimum body size; no wall body text may render below that floor. The floor MUST
be at least 16 px and is expected to exceed it for distance legibility.

A widget's title MUST be shown only when the profile explicitly configures one;
otherwise the widget's own content provides its labelling.

The wall MUST maintain a minimum gutter between widgets and from the panel edge.

#### Scenario: A small control is not inflated

- **WHEN** a widget with a small span is rendered on a panel taller than the
  profile needs
- **THEN** its height follows its span and the row unit, not the panel height

#### Scenario: A short profile is centered

- **WHEN** a profile's widgets occupy fewer rows than fill the panel
- **THEN** the composition is centered and each card keeps its span-derived
  height

#### Scenario: Readouts and controls are distinguishable

- **WHEN** a profile mixes an ambient readout and a touch control
- **THEN** the readout is presented without a control surface and the control is
  presented as a touch surface

#### Scenario: The ramp defines the body floor

- **WHEN** the wall's type ramp is read
- **THEN** it declares a minimum body size for wall text, and no wall body text
  renders below it

#### Scenario: Titles are opt-in

- **WHEN** a widget has no explicitly configured title
- **THEN** no title header is rendered and the widget's own content labels it

#### Scenario: A minimum gutter is kept

- **WHEN** a profile is rendered
- **THEN** adjacent widgets and the panel edge are separated by at least the
  wall's minimum gutter

### Requirement: Touch Operation

The wall is operated by touch. Every interactive control a wall widget presents
MUST meet a kiosk-class minimum touch target of at least 56 CSS pixels, and
adjacent controls MUST be separated by enough space that they are not easily
confused. Every control MUST be operable without a hover interaction.

State MUST NOT be conveyed by color alone, and any device control shown on a
wall MUST behave as it does elsewhere in the product: reflected immediately,
reconciled against reported state, and reverted with the failure surfaced when a
command fails.

#### Scenario: Controls are touch-sized

- **WHEN** a wall widget presents an interactive control
- **THEN** its touch target is at least 56 CSS pixels

#### Scenario: Adjacent controls are separated

- **WHEN** a wall widget presents two or more adjacent controls
- **THEN** they are separated by enough space that a touch intended for one does
  not plausibly activate its neighbour

#### Scenario: No interaction requires hover

- **WHEN** a wall is used on a touchscreen with no pointing device
- **THEN** every control, including any that reveals further options, is
  reachable without hovering

#### Scenario: A wall control reconciles like any other

- **WHEN** a device is toggled from a wall widget
- **THEN** the widget reflects the requested state immediately and reconciles
  against the device's reported state, reverting and surfacing the failure if
  the command fails

## ADDED Requirements

### Requirement: Wall Visual Language

The wall MUST present its own visual language rather than inheriting the
dashboard's design system, and MUST define its own colour, typography, spacing,
radius, elevation, and motion tokens rather than aliasing another system's.

The wall MUST be dark-first: a true-black authoritative scheme that avoids
full-white surfaces, suited to an always-on, low-light panel, with a light scheme
designed for its own contrast rather than produced by inverting the dark one.

#### Scenario: Wall tokens are wall-owned

- **WHEN** the wall's tokens are read
- **THEN** they are declared for the wall rather than aliasing the dashboard's
  design-system tokens

#### Scenario: Both wall schemes are usable

- **WHEN** the wall is rendered in either its dark or its light scheme
- **THEN** text meets the applicable contrast ratio and every state is
  distinguishable without relying on colour alone

#### Scenario: The light wall scheme is designed

- **WHEN** the wall's light-scheme tokens are read
- **THEN** each value is declared for the light scheme explicitly, rather than
  computed by inverting the dark scheme

### Requirement: On-Demand Wall Stylesheet

The wall's stylesheet MUST be delivered as its own content-hashed asset, loaded
only with the wall surface and excluded from the dashboard's first-paint
transferred-size budget. Loading the dashboard MUST NOT fetch the wall's
stylesheet, and a changed wall stylesheet MUST be served under a new URL.

#### Scenario: The wall stylesheet is not in the dashboard's first paint

- **WHEN** the frontend is built
- **THEN** the wall's stylesheet is emitted as its own content-hashed asset and
  is not among the assets counted against the dashboard's first-paint budget

#### Scenario: Loading the dashboard does not fetch the wall stylesheet

- **WHEN** the dashboard is loaded without opening a wall
- **THEN** the wall's stylesheet is not fetched

#### Scenario: A changed wall stylesheet invalidates the cache

- **WHEN** the wall's stylesheet changes and a wall is opened again
- **THEN** the client requests the new content-addressed URL rather than a cached
  one
