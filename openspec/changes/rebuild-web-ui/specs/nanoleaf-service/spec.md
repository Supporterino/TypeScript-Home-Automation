## ADDED Requirements

### Requirement: Device Inventory Read Access

The service MUST expose read access to its registered device inventory, so that
consumers can enumerate Nanoleaf devices without holding a reference to the
registration call site.

Enumeration MUST return each registered device's name and MUST NOT expose the
device's access token, either directly or through a constructed URL that embeds
it. Consumers that need to address a device do so by name through the service's
existing methods.

Enumeration MUST return an empty result rather than failing when no devices are
registered.

#### Scenario: Registered devices are enumerable

- **WHEN** two Nanoleaf devices have been registered and the inventory is read
- **THEN** both device names are returned

#### Scenario: Token is not exposed by enumeration

- **WHEN** the device inventory is read
- **THEN** no returned value contains the device's access token

#### Scenario: Empty inventory is not an error

- **WHEN** the inventory is read before any device has been registered
- **THEN** an empty result is returned and no error is raised

### Requirement: Reachability Reporting

The service MUST allow a consumer to determine whether a registered device is
currently reachable, without that determination throwing when the device is
offline.

A device that cannot be reached MUST be reported as unreachable. Determining one
device's reachability MUST NOT affect any other device.

#### Scenario: Offline device is reported, not thrown

- **WHEN** reachability is checked for a device that does not respond
- **THEN** the device is reported unreachable and no error propagates to the
  caller

#### Scenario: One offline device does not affect others

- **WHEN** reachability is checked across several devices and one is offline
- **THEN** the remaining devices are still reported accurately
