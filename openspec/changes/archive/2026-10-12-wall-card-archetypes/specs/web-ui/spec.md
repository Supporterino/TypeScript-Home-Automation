## ADDED Requirements

### Requirement: Device Name Presentation

Wherever a device's name is presented, the interface MUST present a
human-readable label derived from the device's name rather than a raw
machine-formatted identifier. A name that is a machine identifier — one
containing separator characters such as `_` or `-` — MUST be normalised into
readable words: separators become spaces, words are title-cased, and surrounding
and repeated whitespace is collapsed. A name that already reads as words MUST be
presented unchanged rather than re-cased.

The normalisation MUST be presentation-only: the raw identifier MUST remain the
value used to address, route to, and command the device, and MUST remain
available (for example in the device's detail view) so an operator can still see
the underlying identifier.

The normalised label MUST be used consistently wherever a device name is shown,
including device tiles, the device detail heading, room membership, and device
and room selection controls.

#### Scenario: A machine identifier is humanised

- **WHEN** a device named `livingroom_couch` is shown
- **THEN** it is presented as "Livingroom Couch"

#### Scenario: An already-readable name is left alone

- **WHEN** a device whose name already reads as words is shown
- **THEN** its name is presented unchanged

#### Scenario: The raw identifier still addresses the device

- **WHEN** a device with a humanised display name is actuated, routed to, or
  commanded
- **THEN** the raw identifier is used, and the raw identifier remains available
  in the device's detail view

#### Scenario: Names are humanised consistently

- **WHEN** a device appears in a tile, in its detail view, in a room's
  membership, and in a selection control
- **THEN** the same humanised label is used in each place
