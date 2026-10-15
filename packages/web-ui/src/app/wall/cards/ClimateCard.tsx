/**
 * The wall climate card (design.md D1, D3, D6; specs/wall-display "Widget Catalog"
 * — "a climate"; "Wall Device Presentation" — "A card presents the ported
 * anatomy", "A value device keeps its embedded control").
 *
 * The card composes the ported anatomy in order: the leading circular icon
 * affordance, the device's name over its temperature reading, and one actions row
 * carrying the setpoint as a slider with the thermostat's mode beside it, drawn by
 * the shared {@link WallCardEnumControl} as touch-sized options where they fit the
 * box or as one single affordance where they do not. A control the device does not
 * declare is never rendered — the setpoint and the mode are each offered only for
 * a writable capability the device reports — so a thermostat that only reports its
 * temperature presents a reading and no inert control.
 *
 * Every control actuates through the shared optimistic channel, so a setpoint or
 * a mode change is reflected immediately, reconciled against reported state, and
 * reverted with the failure surfaced inline.
 *
 * The pure decisions — which controls are declared, the setpoint's bounds, the
 * mode options, whether the thermostat is running, and what the reading says — are
 * exported so they are reachable by `bun test`. Wall-chunk only (design.md D10).
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
 * resolver and the capability ranking (`device-class.ts`,
 * `lib/capability-ranking.ts`): a climate announces itself by its `kind` too, and
 * this catches a source that exposes a setpoint without a climate container.
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

/** A climate card's resolved model (design.md D3): its setpoint, mode, and reading. */
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
 * Resolves a climate's model (design.md D3; specs/wall-display "Widget Catalog").
 * The setpoint is offered for a writable numeric the device declares as a setpoint
 * or exposes beneath a climate container, and the mode for a writable enum with
 * permitted values, so an undeclared control is never rendered inert.
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
 * Whether a thermostat is running: a climate whose declared mode reads as "off"
 * is inactive, so `collapsible_controls` hides its controls; a climate that
 * declares no mode has no inactive state and is always running.
 */
export function climateCardActive(modeValue: unknown): boolean {
  if (typeof modeValue !== "string") return true;
  return modeValue.trim().toLowerCase() !== "off";
}

/**
 * The card's reading: the measured temperature with its unit where the device
 * reports one, else the setpoint with its unit, else an em dash. The value and
 * unit stay one non-breaking unit (specs/wall-display "A value stays with its
 * unit").
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

  // One optimistic channel per property, called unconditionally with an absent
  // property when the device declares none, so hook order is stable (design.md D12).
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
        <WallCardActions>
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
        <WallCardActions>
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
