/**
 * The wall's one-row ("slim") rule: a widget's declared slim span and the device it is
 * bound to resolve its effective minimum, read by the frame's guard, the editor's clamp,
 * and save validation alike.
 */
import type { DeviceDescriptor } from "../types.js";
import { devicePresentsControls } from "./cards/card-readiness.js";
import { isWallDeviceClass } from "./cards/device-class.js";
import type { WallWidgetDescriptor, WallWidgetSpan } from "./registry.js";
import { WALL_TITLE_ROWS, type WallSpanDescriptor } from "./span.js";

/**
 * The slim span a type's rule admits at a placement: its slim span when the rule is
 * `always` or the device presents no controls (`read-only`), else `undefined`.
 */
function slimSpan(descriptor: WallWidgetDescriptor, readOnly: boolean): WallWidgetSpan | undefined {
  const slim = descriptor.slim;
  if (slim === undefined) return undefined;
  return slim.when === "always" || readOnly ? slim.min : undefined;
}

/**
 * A widget's effective minimum span: its type's own minimum, or its slim one-row span
 * where the `slim` rule matches the device's state, plus the rows a configured title
 * costs. The device state defaults conservative — a control-bearing device.
 */
export function resolveEffectiveMin(
  descriptor: WallWidgetDescriptor,
  titled: boolean,
  readOnly: boolean,
): WallWidgetSpan {
  const base = slimSpan(descriptor, readOnly) ?? descriptor.min;
  return { w: base.w, h: base.h + (titled ? WALL_TITLE_ROWS : 0) };
}

/**
 * The span descriptor a widget's minimum-span guard reads: the effective minimum without a
 * title (the guard accounts for a title through the renderer's own box), plus the type's
 * default and maximum spans.
 */
export function effectiveSpanDescriptor(
  descriptor: WallWidgetDescriptor,
  readOnly: boolean,
): WallSpanDescriptor {
  return {
    min: resolveEffectiveMin(descriptor, false, readOnly),
    defaults: descriptor.defaults,
    max: descriptor.max,
  };
}

/**
 * Whether a widget's bound device presents no controls — the `read-only` case a typed
 * device's slim rule admits. A widget of any other rule, or one whose device is unknown, is
 * conservative (control-bearing), so a one-row cell is never admitted without one.
 */
export function boundDeviceReadOnly(
  descriptor: WallWidgetDescriptor,
  device: DeviceDescriptor | undefined,
): boolean {
  if (descriptor.slim?.when !== "read-only") return false;
  if (device === undefined || !isWallDeviceClass(descriptor.type)) return false;
  return !devicePresentsControls(descriptor.type, device.capabilities);
}
