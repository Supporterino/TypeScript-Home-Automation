/**
 * The wall number card: a leading icon, the device's name over its value, and one
 * actions row carrying the bounded numeric control as a slider.
 */
import type { Capability, CapabilityRange } from "@ts-ha/shared";
import { SlidersHorizontal } from "lucide-react";
import type { ReactNode } from "react";
import { formatReadoutValue } from "../../components/CapabilityControl.js";
import { type FlatCapability, flattenCapabilities } from "../../lib/capability-ranking.js";
import { deviceTileObservation } from "../../lib/device-tile-state.js";
import { humanizeDeviceName, shortDeviceName } from "../../lib/humanize-name.js";
import { useNow } from "../../lib/use-now.js";
import { useOptimisticDeviceProperty } from "../../lib/use-optimistic-property.js";
import {
  WallCardActions,
  WallCardIcon,
  WallCardObservation,
  WallCardSlider,
  WallCardText,
} from "./card-anatomy.js";
import {
  DEFAULT_WALL_CARD_BOX,
  resolveDeviceCardComposition,
  wallCardRootLayout,
} from "./card-composition.js";
import { WALL_CARD_GLYPH_SIZE, WALL_CARD_METRICS } from "./metrics.js";
import type { WallDeviceCardProps } from "./types.js";

/**
 * The bounded numeric control a number card drives, or `undefined` when the device
 * declares none.
 */
export function numberCardControl(capabilities: Capability[]): FlatCapability | undefined {
  return flattenCapabilities(capabilities).find(
    (c) => c.valueType === "numeric" && c.access.writable && c.range !== undefined,
  );
}

/**
 * The numeric capability the card's reading reads: the control when the device
 * declares one, else the first readable numeric.
 */
export function numberCardReadout(capabilities: Capability[]): FlatCapability | undefined {
  return (
    numberCardControl(capabilities) ??
    flattenCapabilities(capabilities).find((c) => c.valueType === "numeric" && c.access.readable)
  );
}

/** The slider's bounds: the control's declared range, with the ported fallbacks. */
export function numberCardRange(control: FlatCapability): CapabilityRange {
  return { min: control.range?.min ?? 0, max: control.range?.max ?? 100 };
}

/** The card's reading: the value with its unit, or an em dash when it reports none. */
export function numberCardReading(value: unknown, unit?: string): string {
  if (value === undefined || value === null) return "—";
  return formatReadoutValue(value, unit);
}

export function NumberCard({ device, config, box, contained }: WallDeviceCardProps): ReactNode {
  const now = useNow();
  const control = numberCardControl(device.capabilities);
  const readout = numberCardReadout(device.capabilities);
  const range = control ? numberCardRange(control) : undefined;
  const disabled = !device.reachable;

  // Called unconditionally so hook order is stable.
  const value = useOptimisticDeviceProperty(
    device.qualifiedId,
    control?.property ?? "",
    control ? device.state[control.property] : undefined,
    device.observation,
  );

  // A numeric control carries no on/off state, so the device is always active.
  const composition = resolveDeviceCardComposition({
    box: box ?? DEFAULT_WALL_CARD_BOX,
    layout: config?.layout,
    collapsibleControls: config?.collapsible_controls,
    hasControls: control !== undefined,
    active: true,
  });

  const label = humanizeDeviceName(device.displayName);
  const current = value.value ?? (readout ? device.state[readout.property] : undefined);
  const surface = contained
    ? {}
    : { background: "var(--hearth-surface-raised)", borderRadius: WALL_CARD_METRICS.radius };

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
          glyph={<SlidersHorizontal size={WALL_CARD_GLYPH_SIZE} aria-hidden />}
          disabled={disabled}
        />
        <WallCardText
          name={shortDeviceName(label)}
          state={numberCardReading(current, readout?.unit)}
          prominent={composition.form === "full"}
        />
        <WallCardObservation observation={deviceTileObservation(device, now)} />
      </div>

      {composition.controls && control && range && (
        <WallCardActions distribution="flexible">
          <WallCardSlider
            label={control.property}
            min={range.min ?? 0}
            max={range.max ?? 100}
            step={control.step ?? 1}
            value={typeof value.value === "number" ? value.value : (range.min ?? 0)}
            disabled={disabled}
            onChange={(next) => value.setValue(next)}
          />
        </WallCardActions>
      )}

      {value.error && (
        <p
          role="alert"
          style={{
            margin: 0,
            padding: `0 ${WALL_CARD_METRICS.padding}px ${WALL_CARD_METRICS.padding}px`,
            color: "var(--hearth-danger)",
            fontSize: WALL_CARD_METRICS.secondarySize,
          }}
        >
          {value.error}
        </p>
      )}
    </div>
  );
}
