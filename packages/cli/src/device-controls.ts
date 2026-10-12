/**
 * Pure projection of a device's capability schema into terminal controls
 * (specs/cli "Terminal Device Control"; design.md D5).
 *
 * Every flattened writable capability becomes a control matching its declared
 * type — a boolean toggle, a numeric adjuster, an enum cycler, or a text
 * editor — and a read-only capability becomes a plain readout. Boolean read
 * and compose go through the shared `readBooleanCapabilityValue` /
 * `composeBooleanCapabilityValue` helpers, so a source that reports and
 * accepts `"ON"`/`"OFF"` (Zigbee2MQTT) is interpreted and commanded correctly
 * without source-specific knowledge.
 *
 * DOM/JSX-free so the projection and command composition are unit-testable
 * without a render harness, mirroring the web UI's `device-tile-state.ts`.
 */

import type { Capability, CapabilityValueType, DeviceDescriptor } from "@ts-ha/shared";
import { composeBooleanCapabilityValue, readBooleanCapabilityValue } from "@ts-ha/shared";
import { flattenCapabilities } from "./device-rows.js";

/** The terminal control a capability projects to. */
export type DeviceControlKind = "toggle" | "adjuster" | "cycler" | "editor" | "readout";

export interface DeviceControl {
  /** The device state key this control reads and writes. */
  property: string;
  /** The source-derived capability kind. */
  kind: string;
  /** Display label (the capability's name, else its property). */
  label: string;
  valueType: CapabilityValueType;
  /** Whether the capability declares itself writable. */
  writable: boolean;
  control: DeviceControlKind;
  /** Whether the control is actuatable: writable and the device reachable. */
  enabled: boolean;
  /** The device's last-known value for this property. */
  value: unknown;
  unit?: string;
  range?: { min?: number; max?: number };
  step?: number;
  permittedValues?: (string | number)[];
  valueOn?: string | number | boolean;
  valueOff?: string | number | boolean;
}

/** Project a device's flattened capabilities into terminal controls. */
export function projectDeviceControls(device: DeviceDescriptor): DeviceControl[] {
  return flattenCapabilities(device.capabilities)
    .filter(
      (capability): capability is Capability & { property: string } =>
        capability.property !== undefined,
    )
    .map((capability) => {
      const writable = capability.access.writable;
      return {
        property: capability.property,
        kind: capability.kind,
        label: capability.name ?? capability.property,
        valueType: capability.valueType,
        writable,
        control: controlKindFor(capability, writable),
        enabled: writable && device.reachable,
        value: device.state[capability.property],
        unit: capability.unit,
        range: capability.range,
        step: capability.step,
        permittedValues: capability.permittedValues,
        valueOn: capability.valueOn,
        valueOff: capability.valueOff,
      };
    });
}

function controlKindFor(capability: Capability, writable: boolean): DeviceControlKind {
  if (!writable) return "readout";
  switch (capability.valueType) {
    case "boolean":
      return "toggle";
    case "numeric":
      return "adjuster";
    case "enum":
      return "cycler";
    case "text":
      return "editor";
    default:
      return "readout";
  }
}

/** Read a boolean control's reported value through its declared encoding. */
export function readControlBoolean(control: DeviceControl): boolean {
  return readBooleanCapabilityValue(control, control.value);
}

/** Compose a boolean toggle command through the capability's declared encoding. */
export function composeBooleanCommand(
  control: DeviceControl,
  desired: boolean,
): Record<string, unknown> {
  return { [control.property]: composeBooleanCapabilityValue(control, desired) };
}

/** Compose a single-property command for a non-boolean control. */
export function composePropertyCommand(
  control: DeviceControl,
  value: unknown,
): Record<string, unknown> {
  return { [control.property]: value };
}

/** Adjust a numeric control's value by one step, clamped to its declared range. */
export function adjustNumeric(control: DeviceControl, direction: 1 | -1): number {
  const min = control.range?.min ?? 0;
  const max = control.range?.max ?? 100;
  const step = control.step ?? 1;
  const current = typeof control.value === "number" ? control.value : min;
  return Math.min(max, Math.max(min, current + direction * step));
}

/** The next permitted value for an enum control, wrapping at the end. */
export function cycleEnum(control: DeviceControl): unknown {
  const values = control.permittedValues ?? [];
  if (values.length === 0) return control.value;
  const index = values.indexOf(control.value as string | number);
  return values[(index + 1) % values.length];
}

/** Render a control's current value for display. */
export function formatControlValue(control: DeviceControl): string {
  if (control.control === "toggle") return readControlBoolean(control) ? "on" : "off";
  if (control.value === undefined || control.value === null) return "—";
  if (typeof control.value === "number") {
    return control.unit ? `${control.value} ${control.unit}` : String(control.value);
  }
  return String(control.value);
}
