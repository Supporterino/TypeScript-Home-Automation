## MODIFIED Requirements

### Requirement: Device Tile Presentation

Where devices are presented as a tile, the tile MUST convey the device's state
and its available action unambiguously:

- the primary action or readout MUST be visually dominant
- the device's state MUST be encoded by more than color alone
- on the dashboard, an explicit affordance MUST indicate that the tile opens the
  device's detail view, so that opening the detail is not a hidden behavior of
  clicking the tile's empty area
- a control embedded in the tile MUST NOT be mistaken for the tile's
  open-detail action

A read-only tile on the dashboard MUST remain fully activatable to open the
detail view. A tile MUST distinguish a push-backed observation, a polled
observation with the age of its last observation, and an unreachable device, as
required of device presentation elsewhere.

The read-only wall surface MAY present a device tile without the open-detail
affordance and without device-management affordances, as specified by the
wall-display capability's "Wall Device Presentation" requirement; the tile's
state encoding and actuation behaviour MUST remain as specified here.

#### Scenario: The open-detail affordance is explicit

- **WHEN** a user looks at a device tile on the dashboard
- **THEN** an affordance indicates the tile opens the device's detail view, and
  activating the tile's embedded control does not open it

#### Scenario: A read-only tile still opens detail

- **WHEN** a sensor tile with no actuatable property is activated on the
  dashboard
- **THEN** its detail view opens

#### Scenario: State is not color-only

- **WHEN** a device is shown as on or off
- **THEN** the state is conveyed by at least one non-color channel in addition
  to any color

#### Scenario: The wall may omit the detail affordance

- **WHEN** a device is shown on the read-only wall surface
- **THEN** the tile is not required to present the open-detail affordance, while
  the dashboard tile still presents it
