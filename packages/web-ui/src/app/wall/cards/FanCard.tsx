/**
 * The wall fan card: the icon affordance is the on/off control, the name over the
 * percentage, and a slider with the presets beside it.
 */
import type { Capability, CapabilityRange } from "@ts-ha/shared";
import { Fan } from "lucide-react";
import type { ReactNode } from "react";
import { formatReadoutValue } from "../../components/CapabilityControl.js";
import {
  type FlatCapability,
  flattenCapabilities,
  pickOnOffCapability,
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
  WallCardEnumControl,
  WallCardIcon,
  WallCardObservation,
  WallCardSlider,
  WallCardText,
} from "./card-anatomy.js";
import {
  DEFAULT_WALL_CARD_BOX,
  resolveDeviceCardComposition,
  WALL_CARD_ENUM_SIBLING_RESERVE_PX,
  wallCardRootLayout,
} from "./card-composition.js";
import { WALL_CARD_GLYPH_SIZE, WALL_CARD_METRICS } from "./metrics.js";
import type { WallDeviceCardProps } from "./types.js";

/** The property names a fan reports its percentage (or speed) under. */
const FAN_PERCENTAGE_PROPERTIES: ReadonlySet<string> = new Set([
  "percentage",
  "speed",
  "fan_speed",
]);

/** The property names a fan reports its presets (its speed steps) under. */
const FAN_PRESET_PROPERTIES: ReadonlySet<string> = new Set(["preset", "mode", "speed"]);

/** A fan card's resolved model: its on/off, percentage, and presets. */
export interface WallFanCardModel {
  /** The writable boolean on/off the card's icon affordance drives, or `null`. */
  onOff: FlatCapability | null;
  /** The writable bounded percentage the slider drives, or `undefined`. */
  percentage: FlatCapability | undefined;
  /** The writable enumerated presets the card presents, or `undefined`. */
  presets: FlatCapability | undefined;
  /** The preset values the card presents, in the device's own order. */
  presetValues: (string | number)[];
  /** The capability the reading reads — the percentage where the device reports one. */
  readout: FlatCapability | undefined;
}

/** Whether a flattened capability belongs to the fan's own capability family. */
function isFanCapability(capability: FlatCapability): boolean {
  return capability.kind === "fan";
}

/**
 * Resolves a fan's model: the percentage and presets for a writable capability with
 * the bounds or values a control needs.
 */
export function fanCardModel(capabilities: Capability[]): WallFanCardModel {
  const flat = flattenCapabilities(capabilities);
  const percentage = flat.find(
    (c) =>
      c.valueType === "numeric" &&
      c.access.writable &&
      c.range !== undefined &&
      (isFanCapability(c) || FAN_PERCENTAGE_PROPERTIES.has(c.property)),
  );
  const presets = flat.find(
    (c) =>
      c.valueType === "enum" &&
      c.access.writable &&
      (c.permittedValues?.length ?? 0) > 0 &&
      (isFanCapability(c) || FAN_PRESET_PROPERTIES.has(c.property)),
  );

  return {
    onOff: pickOnOffCapability(flat, "writable") ?? null,
    percentage,
    presets,
    presetValues: presets?.permittedValues ?? [],
    readout: flat.find((c) => c.property === "percentage" && c.access.readable) ?? percentage,
  };
}

/** The percentage slider's bounds, with the ported fallbacks. */
export function fanPercentageRange(percentage: FlatCapability): CapabilityRange {
  return { min: percentage.range?.min ?? 0, max: percentage.range?.max ?? 100 };
}

/**
 * The card's reading: the percentage with its unit while the fan is on, its plain on
 * state without one, and "Off" when it is off.
 */
export function fanCardReading(input: {
  hasOnOff: boolean;
  isOn: boolean;
  percentageValue?: unknown;
  unit?: string;
}): string {
  if (input.hasOnOff && !input.isOn) return "Off";
  if (input.percentageValue === undefined || input.percentageValue === null) {
    return input.hasOnOff ? "On" : "—";
  }
  return formatReadoutValue(input.percentageValue, input.unit);
}

export function FanCard({ device, config, box, contained }: WallDeviceCardProps): ReactNode {
  const now = useNow();
  const model = fanCardModel(device.capabilities);
  // Captured locally so the on/off narrowing survives into the control callbacks.
  const onOff = model.onOff;
  const range = model.percentage ? fanPercentageRange(model.percentage) : undefined;
  const disabled = !device.reachable;

  // One optimistic channel per property, called unconditionally so hook order is stable.
  const onOffControl = useOptimisticDeviceProperty(
    device.qualifiedId,
    model.onOff?.property ?? "",
    model.onOff ? device.state[model.onOff.property] : undefined,
    device.observation,
  );
  const percentageControl = useOptimisticDeviceProperty(
    device.qualifiedId,
    model.percentage?.property ?? "",
    model.percentage ? device.state[model.percentage.property] : undefined,
    device.observation,
  );
  const presetsControl = useOptimisticDeviceProperty(
    device.qualifiedId,
    model.presets?.property ?? "",
    model.presets ? device.state[model.presets.property] : undefined,
    device.observation,
  );

  const isOn = model.onOff
    ? deviceTileOnOffFromCapabilityValue(model.onOff, onOffControl.value).value
    : false;
  const composition = resolveDeviceCardComposition({
    box: box ?? DEFAULT_WALL_CARD_BOX,
    layout: config?.layout,
    collapsibleControls: config?.collapsible_controls,
    hasControls: model.percentage !== undefined || model.presets !== undefined,
    active: model.onOff ? isOn : true,
  });

  const label = humanizeDeviceName(device.displayName);
  const surface = contained
    ? {}
    : { background: "var(--hearth-surface-raised)", borderRadius: WALL_CARD_METRICS.radius };
  const error = onOffControl.error ?? percentageControl.error ?? presetsControl.error;

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
              <Fan size={WALL_CARD_GLYPH_SIZE} fill="currentColor" aria-hidden />
            ) : (
              <Fan size={WALL_CARD_GLYPH_SIZE} aria-hidden />
            )
          }
          tint={isOn ? "var(--hearth-on)" : undefined}
          onActivate={
            onOff
              ? () => onOffControl.setValue(deviceTileToggledValue(onOff, onOffControl.value))
              : undefined
          }
          pressed={isOn}
          disabled={disabled}
          label={`Turn ${isOn ? "off" : "on"} ${label}`}
        />
        <WallCardText
          name={shortDeviceName(label)}
          state={fanCardReading({
            hasOnOff: model.onOff !== null,
            isOn,
            percentageValue: model.percentage ? percentageControl.value : undefined,
            unit: model.readout?.unit,
          })}
          prominent={composition.form === "full"}
        />
        <WallCardObservation observation={deviceTileObservation(device, now)} />
      </div>

      {composition.controls && model.percentage && range && (
        <WallCardActions>
          <WallCardSlider
            label={model.percentage.property}
            min={range.min ?? 0}
            max={range.max ?? 100}
            step={model.percentage.step ?? 1}
            value={
              typeof percentageControl.value === "number"
                ? percentageControl.value
                : (range.min ?? 0)
            }
            disabled={disabled}
            onChange={(next) => {
              // A percentage set on a stopped fan commands it on first.
              if (!isOn && onOff) {
                onOffControl.setValue(deviceTileToggledValue(onOff, onOffControl.value));
              }
              percentageControl.setValue(next);
            }}
          />
          {composition.siblings && model.presets && (
            <WallCardEnumControl
              box={box ?? DEFAULT_WALL_CARD_BOX}
              label={model.presets.property}
              values={model.presetValues}
              current={presetsControl.value}
              onSelect={(preset) => presetsControl.setValue(preset)}
              reservedPx={WALL_CARD_ENUM_SIBLING_RESERVE_PX}
              disabled={disabled}
              error={presetsControl.error !== null}
            />
          )}
        </WallCardActions>
      )}

      {composition.controls && !model.percentage && model.presets && (
        <WallCardActions>
          <WallCardEnumControl
            box={box ?? DEFAULT_WALL_CARD_BOX}
            label={model.presets.property}
            values={model.presetValues}
            current={presetsControl.value}
            onSelect={(preset) => presetsControl.setValue(preset)}
            disabled={disabled}
            error={presetsControl.error !== null}
          />
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
