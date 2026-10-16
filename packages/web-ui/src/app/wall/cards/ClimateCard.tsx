/**
 * The wall climate card: a leading icon, the device's name over its temperature
 * reading, and a slider for the setpoint with the mode beside it.
 */
import type { Capability, CapabilityRange } from "@ts-ha/shared";
import { Thermometer } from "lucide-react";
import type { ReactNode } from "react";
import { formatReadoutValue } from "../../components/CapabilityControl.js";
import { type FlatCapability, flattenCapabilities } from "../../lib/capability-ranking.js";
import { deviceTileObservation } from "../../lib/device-tile-state.js";
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

/**
 * The setpoint property names a climate declares, mirroring the wall's own class
 * resolver and capability ranking.
 */
const SETPOINT_PROPERTIES: ReadonlySet<string> = new Set([
  "occupied_heating_setpoint",
  "current_heating_setpoint",
  "target_temperature",
  "setpoint",
]);

/** The mode property names a climate reports its thermostat mode under. */
const CLIMATE_MODE_PROPERTIES: ReadonlySet<string> = new Set(["system_mode", "mode", "preset"]);

/** The property names a climate reports its measured temperature under. */
const TEMPERATURE_PROPERTIES: ReadonlySet<string> = new Set([
  "local_temperature",
  "current_temperature",
  "temperature",
]);

/** A climate card's resolved model: its setpoint, mode, and reading. */
export interface WallClimateCardModel {
  /** The writable bounded setpoint the slider drives, or `undefined`. */
  setpoint: FlatCapability | undefined;
  /** The writable enumerated mode the card presents, or `undefined`. */
  mode: FlatCapability | undefined;
  /** The mode values the card presents, in the device's own order. */
  modeValues: (string | number)[];
  /** The capability the reading reads — the measured temperature where reported. */
  readout: FlatCapability | undefined;
}

/**
 * Resolves a climate's model: the setpoint and mode for a writable capability the
 * device declares, so an undeclared control is never rendered inert.
 */
export function climateCardModel(capabilities: Capability[]): WallClimateCardModel {
  const flat = flattenCapabilities(capabilities);
  const setpoint =
    flat.find(
      (c) => c.valueType === "numeric" && c.access.writable && SETPOINT_PROPERTIES.has(c.property),
    ) ??
    flat.find(
      (c) =>
        c.valueType === "numeric" &&
        c.access.writable &&
        c.kind === "climate" &&
        c.range !== undefined,
    );
  const mode = flat.find(
    (c) =>
      c.valueType === "enum" &&
      c.access.writable &&
      (c.permittedValues?.length ?? 0) > 0 &&
      (c.kind === "climate" || CLIMATE_MODE_PROPERTIES.has(c.property)),
  );
  const measured = flat.find(
    (c) => c.valueType === "numeric" && c.access.readable && TEMPERATURE_PROPERTIES.has(c.property),
  );

  return {
    setpoint,
    mode,
    modeValues: mode?.permittedValues ?? [],
    readout: measured ?? setpoint,
  };
}

/** The setpoint slider's bounds, with the ported fallbacks. */
export function climateSetpointRange(setpoint: FlatCapability): CapabilityRange {
  return { min: setpoint.range?.min ?? 5, max: setpoint.range?.max ?? 35 };
}

/**
 * Whether a thermostat is running: a declared mode reading as "off" is inactive; a
 * climate with no mode is always running.
 */
export function climateCardActive(modeValue: unknown): boolean {
  if (typeof modeValue !== "string") return true;
  return modeValue.trim().toLowerCase() !== "off";
}

/**
 * The card's reading: the measured temperature with its unit, else the setpoint with
 * its unit, else an em dash.
 */
export function climateCardReading(input: {
  readout: FlatCapability | undefined;
  value: unknown;
}): string {
  if (input.value === undefined || input.value === null) return "—";
  return formatReadoutValue(input.value, input.readout?.unit);
}

export function ClimateCard({ device, config, box, contained }: WallDeviceCardProps): ReactNode {
  const now = useNow();
  const model = climateCardModel(device.capabilities);
  const range = model.setpoint ? climateSetpointRange(model.setpoint) : undefined;
  const disabled = !device.reachable;

  // One optimistic channel per property, called unconditionally so hook order is stable.
  const setpointControl = useOptimisticDeviceProperty(
    device.qualifiedId,
    model.setpoint?.property ?? "",
    model.setpoint ? device.state[model.setpoint.property] : undefined,
    device.observation,
  );
  const modeControl = useOptimisticDeviceProperty(
    device.qualifiedId,
    model.mode?.property ?? "",
    model.mode ? device.state[model.mode.property] : undefined,
    device.observation,
  );

  const modeValue = model.mode ? modeControl.value : undefined;
  const composition = resolveDeviceCardComposition({
    box: box ?? DEFAULT_WALL_CARD_BOX,
    layout: config?.layout,
    collapsibleControls: config?.collapsible_controls,
    hasControls: model.setpoint !== undefined || model.mode !== undefined,
    active: climateCardActive(modeValue),
  });

  const label = humanizeDeviceName(device.displayName);
  const surface = contained
    ? {}
    : { background: "var(--hearth-surface-raised)", borderRadius: WALL_CARD_METRICS.radius };
  const error = setpointControl.error ?? modeControl.error;

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
          glyph={<Thermometer size={WALL_CARD_GLYPH_SIZE} aria-hidden />}
          tint={climateCardActive(modeValue) ? "var(--hearth-on)" : "var(--hearth-off)"}
          disabled={disabled}
        />
        <WallCardText
          name={shortDeviceName(label)}
          state={climateCardReading({
            readout: model.readout,
            value: model.readout ? device.state[model.readout.property] : undefined,
          })}
          prominent={composition.form === "full"}
        />
        <WallCardObservation observation={deviceTileObservation(device, now)} />
      </div>

      {composition.controls && model.setpoint && range && (
        <WallCardActions distribution="flexible">
          <WallCardSlider
            label={model.setpoint.property}
            min={range.min ?? 5}
            max={range.max ?? 35}
            step={model.setpoint.step ?? 0.5}
            value={
              typeof setpointControl.value === "number" ? setpointControl.value : (range.min ?? 5)
            }
            disabled={disabled}
            onChange={(next) => setpointControl.setValue(next)}
          />
          {composition.siblings && model.mode && (
            <WallCardEnumControl
              box={box ?? DEFAULT_WALL_CARD_BOX}
              label={model.mode.property}
              values={model.modeValues}
              current={modeControl.value}
              onSelect={(mode) => modeControl.setValue(mode)}
              reservedPx={WALL_CARD_ENUM_SIBLING_RESERVE_PX}
              disabled={disabled}
              error={modeControl.error !== null}
            />
          )}
        </WallCardActions>
      )}

      {composition.controls && !model.setpoint && model.mode && (
        <WallCardActions distribution="distributed">
          <WallCardEnumControl
            box={box ?? DEFAULT_WALL_CARD_BOX}
            label={model.mode.property}
            values={model.modeValues}
            current={modeControl.value}
            onSelect={(mode) => modeControl.setValue(mode)}
            disabled={disabled}
            error={modeControl.error !== null}
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
