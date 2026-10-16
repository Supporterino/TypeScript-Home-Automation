## ADDED Requirements

### Requirement: One-Row Link

A link widget MUST be placeable at a minimum of one grid row. A link placed at
one row MUST render without the frame's surface and without the route's own
control border or raised background, so the whole cell is the link's touch
target; a link placed at two rows or more MUST render the framed labelled route.
A one-row link MUST remain within its cell and MUST NOT present a touch target
smaller than the wall's minimum.

#### Scenario: A one-row link is chrome-less

- **WHEN** a link widget is placed at one row
- **THEN** it renders without the frame's surface and without the route's own
  border or raised background, and its whole cell is the link's touch target, at
  or above the wall's minimum touch target

#### Scenario: A larger link keeps the framed route

- **WHEN** a link widget is placed at two rows or more
- **THEN** it renders the framed labelled route

#### Scenario: A one-row link still opens its target

- **WHEN** a user activates a one-row link
- **THEN** the named target profile's wall opens, as it does from a framed link

### Requirement: One-Row Read-Only Device Widget

A typed device widget MUST be placeable at a minimum of one grid row exactly
when its bound device presents no controls; a widget whose bound device presents
controls MUST retain a minimum of two rows. The effective minimum is therefore
resolved from the bound device, not from the widget type alone.

A one-row device cell MUST compose a single-line card: a leading icon, the
device's name, and its state on one line, within the cell. Where the device's
primary action is a toggle, the whole cell MUST be the actuation target. A
one-row device card MUST NOT present a control smaller than the wall's minimum
touch target, and MUST NOT present the observation indicator.

A device widget placed below its effective minimum MUST render the wall's
contained explanation rather than a clipped card. The wall editor and the save
validation MUST enforce the same effective minimum.

#### Scenario: A read-only device may be one row

- **WHEN** a typed device widget's bound device presents no controls
- **THEN** the widget may be placed at one row and composes the single-line card
  form within its cell

#### Scenario: A control-bearing device keeps its two-row minimum

- **WHEN** a typed device widget's bound device presents controls
- **THEN** the widget's minimum is two rows and a one-row placement is refused

#### Scenario: A one-row device card fits and actuates

- **WHEN** a one-row device card whose device's primary action is a toggle is
  shown
- **THEN** the whole cell is the actuation target, no control smaller than the
  wall's minimum touch target is presented, and the card does not overflow its
  cell

#### Scenario: A sub-minimum device cell is explained

- **WHEN** a device widget is placed below its effective minimum
- **THEN** the wall renders its contained explanation instead of a clipped card

#### Scenario: The editor enforces the effective minimum

- **WHEN** a draft places a control-bearing device widget at one row
- **THEN** the draft is refused because the placement is below the widget's
  effective minimum
