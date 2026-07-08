## MODIFIED Requirements

### Requirement: Device Registration

`register(name, host, type?)` MUST:
- Store the device in an internal `Map<string, ShellyDevice>`
- Normalize the host: strip scheme (`http://`, `https://`), strip trailing slashes
- Accept IPs, hostnames, mDNS names, URLs, custom ports (`host:port`)
- Accept an optional device `type` of `"switch" | "outlet" | "cover"`, defaulting
  to `"switch"` when omitted (existing 2-argument calls remain valid)
- Store the `type` on the `ShellyDevice` record
- Fire all registered `onDeviceRegistered` listeners with the stored device
- Log device registration

`registerMany(devices)` MUST:
- Accept `ShellyDevice[]` or `Record<string, string>`
- Call `register()` for each entry

#### Scenario: Register a device with an explicit type

- **WHEN** `register("blind", "192.168.1.5", "cover")` is called
- **THEN** the stored `ShellyDevice` has `type: "cover"`

#### Scenario: Register defaults to switch

- **WHEN** `register("plug", "192.168.1.6")` is called with no type
- **THEN** the stored `ShellyDevice` has `type: "switch"`

#### Scenario: Registration notifies listeners

- **WHEN** a device is registered and a listener was added via
  `onDeviceRegistered`
- **THEN** the listener is invoked with the newly registered device

## ADDED Requirements

### Requirement: Device Inventory Read Access

`ShellyService` MUST expose a public read view of registered devices via
`getDevices(): ShellyDevice[]`, returning all currently registered devices with
their `name`, `host`, and `type`.

#### Scenario: Enumerate registered devices

- **WHEN** two devices have been registered and `getDevices()` is called
- **THEN** it returns both devices including their normalized host and type

### Requirement: Registration Event Listeners

`ShellyService` MUST allow consumers to subscribe to device registrations so they
can react to devices registered at any time (including after service startup):

- `onDeviceRegistered(cb: (device: ShellyDevice) => void): void`
- `offDeviceRegistered(cb): void`

Listeners MUST be invoked synchronously when `register()` stores a device. Errors
thrown by a listener MUST be caught and logged without preventing other listeners
from running.

#### Scenario: Subscribe and receive future registrations

- **WHEN** a consumer adds a listener via `onDeviceRegistered`, then a device is
  registered
- **THEN** the listener receives the registered device

#### Scenario: Unsubscribe stops notifications

- **WHEN** a listener is removed via `offDeviceRegistered` and a device is then
  registered
- **THEN** the removed listener is not invoked

#### Scenario: Listener error is isolated

- **WHEN** one listener throws during a registration
- **THEN** the error is caught and logged and remaining listeners still run

### Requirement: Device Type Definition

The type `ShellyDeviceType = "switch" | "outlet" | "cover"` MUST be defined in
`src/types/shelly.ts`, and `ShellyDevice` MUST include a `type: ShellyDeviceType`
field.

#### Scenario: Type is part of the device record

- **WHEN** a `ShellyDevice` is constructed
- **THEN** it carries a `type` field of `ShellyDeviceType`
