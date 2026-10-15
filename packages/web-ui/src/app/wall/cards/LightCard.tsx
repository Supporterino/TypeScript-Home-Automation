/**
 * The wall light card (design.md D1, D2, D7, D12; specs/wall-display "Wall
 * Device Presentation" — "A light card presents both a toggle and a value
 * control", "A light card can be turned on from its affordances", "Colour
 * controls appear only when supported", "A light card fits its minimum span").
 *
 * The card composes the ported anatomy in order: the leading circular icon
 * affordance is the light's on/off control, whose glyph states the state by its
 * fill as well as by its colour and whose shape carries the light's own
 * contrast-improved colour; the name sits over the brightness reading; and one
 * actions row carries the active control as a slider with the device's other
 * declared controls beside it as icon buttons. A control the device does not
 * declare is never rendered — brightness, colour temperature, and colour are
 * each offered only for a writable capability the device reports — and every
 * control actuates through the shared optimistic channel, so a command is
 * reflected immediately, reconciled against reported state, and reverted with
 * the failure surfaced inline.
 *
 * The pure decisions — which controls are declared, which is active by default,
 * what the reading says, and the on/off command that turns an off light on — are
 * exported so they are reachable by `bun test` (design.md D23). Wall-chunk only
 * (design.md D10).
 */
import type { Capability, CapabilityRange } from "@ts-ha/shared";
import { Lightbulb, Palette, Sun, Thermometer } from "lucide-react";
import { type ReactNode, useState } from "react";
import {
  type FlatCapability,
  flattenCapabilities,
  formatBrightnessPercent,
  pickOnOffCapability,
  writableBrightnessCapability,
  writableColorCapability,
  writableColorTemperatureCapability,
} from "../../lib/capability-ranking.js";
import {
  deviceTileObservation,
  deviceTileOnOffFromCapabilityValue,
  deviceTileToggledValue,
} from "../../lib/device-tile-state.js";
import { humanizeDeviceName, shortDeviceName } from "../../lib/humanize-name.js";
import { useNow } from "../../lib/use-now.js";
import { useOptimisticDeviceProperty } from "../../lib/use-optimistic-property.js";
import {
  WallCardActions,
  WallCardIcon,
  WallCardIconButton,
  WallCardObservation,
  WallCardSlider,
  WallCardText,
} from "./card-anatomy.js";
import {
  DEFAULT_WALL_CARD_BOX,
  resolveDeviceCardComposition,
  wallCardRootLayout,
} from "./card-composition.js";
import { deviceColorRgb } from "./device-color.js";
import { WALL_CARD_GLYPH_SIZE, WALL_CARD_METRICS } from "./metrics.js";
import type { WallDeviceCardProps } from "./types.js";

/** Which value control a light card can present (Mushroom's own brightness/temperature/colour controls). */
export type WallLightControlKind = "brightness" | "color_temp" | "color";

/** One declared value control of a light card. */
export interface WallLightControl {
  kind: WallLightControlKind;
  capability: FlatCapability;
}

/**
 * The value controls a light declares, in the card's own order — brightness,
 * colour temperature, colour (design.md D12; specs/wall-display "Colour controls
 * appear only when supported"). Each is offered only for a writable capability,
 * so an undeclared or read-only control is never rendered inert.
 */
export function lightCardControls(capabilities: Capability[]): WallLightControl[] {
  const controls: WallLightControl[] = [];
  const brightness = writableBrightnessCapability(capabilities);
  if (brightness) controls.push({ kind: "brightness", capability: brightness });
  const colorTemperature = writableColorTemperatureCapability(capabilities);
  if (colorTemperature) controls.push({ kind: "color_temp", capability: colorTemperature });
  const color = writableColorCapability(capabilities);
  if (color) controls.push({ kind: "color", capability: color });
  return controls;
}

/**
 * The control the actions row expands by default: the first declared control in
 * the card's own order, so a light with a brightness always opens on it (design.md
 * D2). `undefined` when the device declares no value control.
 */
export function defaultLightControlKind(
  controls: WallLightControl[],
): WallLightControlKind | undefined {
  return controls[0]?.kind;
}

/**
 * The on/off command that turns a light on from its resolved on/off value, or
 * `undefined` when it is already on (or has no on/off capability). A value
 * control activated while the light is off issues this first, so the light is
 * commanded on exactly as its icon affordance commands it — the same encoding
 * rule, never a second one (specs/wall-display "A light card can be turned on
 * from its affordances").
 */
export function lightTurnOnCommand(input: {
  isOn: boolean;
  onOffCapability: Pick<Capability, "valueOn" | "valueOff"> | null | undefined;
  resolvedOnOffValue: unknown;
}): string | number | boolean | undefined {
  if (input.isOn || !input.onOffCapability) return undefined;
  return deviceTileToggledValue(input.onOffCapability, input.resolvedOnOffValue);
}

/**
 * The card's reading line: the brightness as a percentage of its own range while
 * the light is on, the light's plain on state when it declares no brightness,
 * and "Off" when it is off (design.md D12; "A value stays with its unit").
 */
export function lightCardReading(input: {
  isOn: boolean;
  brightnessValue?: unknown;
  range?: CapabilityRange;
}): string {
  if (!input.isOn) return "Off";
  if (input.brightnessValue === undefined) return "On";
  return formatBrightnessPercent(input.brightnessValue, input.range);
}

/** The value control's range, with the ported fallbacks a colour's own 0–360 needs. */
function controlRange(capability: FlatCapability, kind: WallLightControlKind): CapabilityRange {
  return {
    min: capability.range?.min ?? 0,
    max: capability.range?.max ?? (kind === "color" ? 360 : 100),
  };
}

const LIGHT_CONTROL_GLYPHS: Record<WallLightControlKind, ReactNode> = {
  brightness: <Sun aria-hidden />,
  color_temp: <Thermometer aria-hidden />,
  color: <Palette aria-hidden />,
};

const LIGHT_CONTROL_LABELS: Record<WallLightControlKind, string> = {
  brightness: "Brightness",
  color_temp: "Colour temperature",
  color: "Colour",
};

export function LightCard({ device, config, box, contained }: WallDeviceCardProps): ReactNode {
  const now = useNow();
  const flat = flattenCapabilities(device.capabilities);
  const onOffCapability = pickOnOffCapability(flat, "writable") ?? null;
  const controls = lightCardControls(device.capabilities);
  const brightness = controls.find((control) => control.kind === "brightness")?.capability;
  const colorTemperature = controls.find((control) => control.kind === "color_temp")?.capability;
  const color = controls.find((control) => control.kind === "color")?.capability;

  // One optimistic channel per property, called unconditionally with an absent
  // property when the device declares none, so hook order is stable across
  // renders (design.md D12, D31).
  const onOffControl = useOptimisticDeviceProperty(
    device.qualifiedId,
    onOffCapability?.property ?? "",
    onOffCapability ? device.state[onOffCapability.property] : undefined,
    device.observation,
  );
  const brightnessControl = useOptimisticDeviceProperty(
    device.qualifiedId,
    brightness?.property ?? "",
    brightness ? device.state[brightness.property] : undefined,
    device.observation,
  );
  const colorTemperatureControl = useOptimisticDeviceProperty(
    device.qualifiedId,
    colorTemperature?.property ?? "",
    colorTemperature ? device.state[colorTemperature.property] : undefined,
    device.observation,
  );
  const colorControl = useOptimisticDeviceProperty(
    device.qualifiedId,
    color?.property ?? "",
    color ? device.state[color.property] : undefined,
    device.observation,
  );
  const channels = {
    brightness: brightnessControl,
    color_temp: colorTemperatureControl,
    color: colorControl,
  } as const;

  // The expanded control is UI state, but never a control the device does not
  // declare: a stale request falls back to the default (design.md D2).
  const [requestedKind, setRequestedKind] = useState<WallLightControlKind | null>(null);
  const activeKind = controls.some((control) => control.kind === requestedKind)
    ? (requestedKind as WallLightControlKind)
    : defaultLightControlKind(controls);
  const activeControl = controls.find((control) => control.kind === activeKind);

  const isOn = onOffCapability
    ? deviceTileOnOffFromCapabilityValue(onOffCapability, onOffControl.value).value
    : false;
  const accent = deviceColorRgb(device.state);
  const label = humanizeDeviceName(device.displayName);
  const disabled = !device.reachable;
  const error =
    onOffControl.error ??
    brightnessControl.error ??
    colorTemperatureControl.error ??
    colorControl.error;

  const surface = contained
    ? {}
    : { background: "var(--hearth-surface-raised)", borderRadius: WALL_CARD_METRICS.radius };

  // The card's own options (design.md D6; specs/wall-display "A control's layout is
  // configured"): its layout, its inactive-controls setting, and the box it was
  // given. A light with no declared value control has no controls to hide, and a
  // light that is off is inactive, so `collapsible_controls` hides its actions row
  // until it is on again — without changing the composition around it.
  const composition = resolveDeviceCardComposition({
    box: box ?? DEFAULT_WALL_CARD_BOX,
    layout: config?.layout,
    collapsibleControls: config?.collapsible_controls,
    hasControls: controls.length > 0,
    active: isOn,
  });

  return (
    <div
      style={{
        position: "relative",
        ...wallCardRootLayout(composition),
        minWidth: 0,
        height: "100%",
        boxSizing: "border-box",
        overflow: "hidden",
        ...surface,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: WALL_CARD_METRICS.padding,
          minWidth: 0,
          padding: WALL_CARD_METRICS.padding,
        }}
      >
        <WallCardIcon
          glyph={
            isOn ? (
              <Lightbulb size={WALL_CARD_GLYPH_SIZE} fill="currentColor" aria-hidden />
            ) : (
              <Lightbulb size={WALL_CARD_GLYPH_SIZE} aria-hidden />
            )
          }
          color={accent}
          active={isOn}
          onActivate={
            onOffCapability
              ? () =>
                  onOffControl.setValue(deviceTileToggledValue(onOffCapability, onOffControl.value))
              : undefined
          }
          pressed={isOn}
          disabled={disabled}
          label={`Turn ${isOn ? "off" : "on"} ${label}`}
        />
        <WallCardText
          name={shortDeviceName(label)}
          state={lightCardReading({
            isOn,
            brightnessValue: brightness ? brightnessControl.value : undefined,
            range: brightness?.range,
          })}
          stateColor={isOn && device.reachable ? "var(--hearth-text)" : "var(--hearth-text-muted)"}
          prominent={composition.form === "full"}
        />
        <WallCardObservation observation={deviceTileObservation(device, now)} />
      </div>

      {controls.length > 0 && composition.controls && (
        <WallCardActions>
          {activeControl && (
            <WallCardSlider
              label={activeControl.capability.property}
              min={controlRange(activeControl.capability, activeControl.kind).min ?? 0}
              max={controlRange(activeControl.capability, activeControl.kind).max ?? 100}
              step={activeControl.capability.step ?? 1}
              value={
                typeof channels[activeControl.kind].value === "number"
                  ? (channels[activeControl.kind].value as number)
                  : (controlRange(activeControl.capability, activeControl.kind).min ?? 0)
              }
              color={accent}
              disabled={disabled}
              onChange={(next) => {
                const turnOn = lightTurnOnCommand({
                  isOn,
                  onOffCapability,
                  resolvedOnOffValue: onOffControl.value,
                });
                if (turnOn !== undefined) onOffControl.setValue(turnOn);
                channels[activeControl.kind].setValue(next);
              }}
            />
          )}
          {composition.siblings &&
            controls
              .filter((control) => control.kind !== activeKind)
              .map((control) => (
                <WallCardIconButton
                  key={control.kind}
                  glyph={LIGHT_CONTROL_GLYPHS[control.kind]}
                  label={`Show ${LIGHT_CONTROL_LABELS[control.kind]} control`}
                  onClick={() => setRequestedKind(control.kind)}
                  disabled={disabled}
                />
              ))}
        </WallCardActions>
      )}

      {error && (
        <p
          role="alert"
          style={{
            margin: 0,
            padding: `0 ${WALL_CARD_METRICS.padding}px ${WALL_CARD_METRICS.padding}px`,
            color: "var(--hearth-danger)",
            fontSize: WALL_CARD_METRICS.secondarySize,
          }}
        >
          {error}
        </p>
      )}
    </div>
  );
}
