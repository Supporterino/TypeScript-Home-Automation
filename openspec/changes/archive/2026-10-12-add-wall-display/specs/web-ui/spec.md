## ADDED Requirements

### Requirement: Full-Bleed Wall Rendering

The dashboard MUST serve a wall route addressed by profile, registered as an
application view segment alongside the existing views. Unlike every other view,
the wall view MUST render without the application's persistent chrome — no
header, no navigation rail, and no footer — so its widgets use the full panel.

The wall route MUST be reachable directly by URL and survive a reload, and MUST
NOT be promoted into the control group's narrow-viewport navigation. A wall
display is a distinct surface reached deliberately, not a destination within the
ordinary navigation.

#### Scenario: The wall renders without chrome

- **WHEN** a wall route is opened
- **THEN** the profile's widgets are rendered with no header, navigation, or
  footer

#### Scenario: The wall survives a reload

- **WHEN** a wall route is opened directly and the page is reloaded
- **THEN** the same profile renders full-bleed

#### Scenario: The wall is not a navigation destination

- **WHEN** the dashboard's navigation is displayed
- **THEN** no entry promotes the wall view, and it remains reachable by URL

### Requirement: Wall Editor Admission In Admin Navigation

The admin interface MUST provide a route that lists wall profiles and admits
creating, renaming, deleting, and editing them, and that route MUST be a
reachable application view segment with its own URL.

#### Scenario: The editor is reachable in admin navigation

- **WHEN** a user opens the admin interface
- **THEN** the wall editor is reachable through navigation and has a shareable,
  reloadable URL
