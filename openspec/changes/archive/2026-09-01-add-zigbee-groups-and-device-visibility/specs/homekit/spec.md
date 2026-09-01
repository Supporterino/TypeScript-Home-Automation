## ADDED Requirements

### Requirement: Visibility-Filtered Accessory Exposure

The HomeKit bridge MUST expose only devices that are visible. A hidden device MUST
NOT be bridged as an accessory.

The bridge MUST obtain its devices through the visible enumeration offered by the
shared device model, rather than enumerating everything and filtering itself.
Reproducing the filter here would give the system two independently maintained
definitions of what "hidden" means, which would eventually disagree.

Visibility MUST be honoured both at startup and while running. A device hidden
while the bridge is published MUST have its accessory removed, and a device
unhidden MUST have its accessory added, without restarting the engine or
re-pairing.

A visibility change produces no device state event, so the bridge MUST observe
visibility changes directly. Relying on the device notifications it already
receives would leave a hidden device in the Home app until that device happened to
report something unrelated — indefinitely, for a device that has just been switched
off.

Removing an accessory because its device was hidden MUST be indistinguishable, to
the bridge's own bookkeeping, from removing it because the device disappeared: the
accessory is removed and its identifier freed, so unhiding recreates it cleanly.

Hiding a device MUST NOT change the bridge's identity or the derivation of any
accessory's identity, so an existing pairing survives and an unhidden device
returns as the same accessory rather than a new one.

#### Scenario: A hidden device is never bridged

- **WHEN** the bridge starts and one device is already hidden
- **THEN** no accessory is created for it, and every visible device is bridged

#### Scenario: Hiding removes the accessory promptly

- **WHEN** a bridged device is hidden and reports no further state
- **THEN** its accessory is removed from the bridge without waiting for device
  activity and without a restart

#### Scenario: Unhiding restores the same accessory

- **WHEN** a hidden device is unhidden
- **THEN** an accessory is added back with the same derived identity it had before,
  and the Home app controls it without re-pairing

#### Scenario: Pairing is unaffected

- **WHEN** devices are hidden and unhidden repeatedly
- **THEN** the bridge identity is unchanged and no re-pairing is required

### Requirement: Zigbee Groups Are Bridged Like Any Other Device

A discovered Zigbee group MUST be eligible for exposure as a HomeKit accessory on
the same terms as any other device: it is bridged when its capabilities map onto a
supported HomeKit service, and skipped when they do not.

Commanding a group accessory MUST dispatch a command to the group, which the bridge
issues through the shared device model exactly as it does for any other device. The
bridge MUST NOT command the group's members individually.

Because a group's capabilities are the intersection of its members', a group whose
members share no HomeKit-mappable capability MUST be skipped rather than bridged as
an accessory with no controls.

#### Scenario: A lamp group becomes one accessory

- **WHEN** a group of three bulbs is discovered and its members are hidden
- **THEN** the Home app shows one accessory for the group and none for the bulbs

#### Scenario: Commanding the group accessory commands the group

- **WHEN** a user turns the group accessory on
- **THEN** one command is dispatched to the group, not one per member

#### Scenario: A group with no mappable capability is skipped

- **WHEN** a group's intersected capabilities map onto no supported HomeKit service
- **THEN** no accessory is created for it, and the omission is logged
