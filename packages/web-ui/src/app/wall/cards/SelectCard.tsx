/**
 * The wall select card (design.md D1, D3, D6; specs/wall-display "Widget Catalog"
 * — "an enumerated control"; "Wall Device Presentation" — "A card presents the
 * ported anatomy", "A value device keeps its embedded control").
 *
 * The card composes the ported anatomy in order: the leading circular icon
 * affordance, the device's name over its current value, and one actions row
 * carrying the enumerated control — its permitted values, drawn by the shared
 * {@link WallCardEnumControl} as a touch-sized option per value where they fit the
 * box, or as one single affordance where they do not — as the sole action, because
 * a select card drives exactly one property. Selecting a value is the property's
 * actuation target, so the card is never whole-card actuated.
 *
 * An enumerated control with no permitted values cannot be expressed as options,
 * so no control is presented: the card composes its reading alone rather than
 * rendering an inert control (specs/wall-display "A control the device cannot
 * express MUST NOT be presented").
 *
 * The pure decisions — which control is declared, its permitted values, and what
 * the reading says — are exported so they are reachable by `bun test`. Wall-chunk
 * only (design.md D10).
 */
import type { Capability } from "@ts-ha/shared";
import { ListChecks } from "lucide-react";
import type { ReactNode } from "react";
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
  WallCardText,
} from "./card-anatomy.js";
import {
  DEFAULT_WALL_CARD_BOX,
  resolveDeviceCardComposition,
  wallCardRootLayout,
} from "./card-composition.js";
import { WALL_CARD_GLYPH_SIZE, WALL_CARD_METRICS } from "./metrics.js";
import type { WallDeviceCardProps } from "./types.js";

/** A select card's resolved control (design.md D3): its property and permitted values. */
export interface WallSelectCardModel {
  control: FlatCapability | undefined;
  values: (string | number)[];
}

/**
 * The enumerated control a select card drives (design.md D3), or `undefined` when
 * the device declares none. Only a writable enum with permitted values qualifies:
 * an enum that enumerates nothing declares no option the card could present, so
 * the card offers no control rather than inventing one.
 */
export function selectCardModel(capabilities: Capability[]): WallSelectCardModel {
  const control = flattenCapabilities(capabilities).find(
    (c) => c.valueType === "enum" && c.access.writable && (c.permittedValues?.length ?? 0) > 0,
  );
  return { control, values: control?.permittedValues ?? [] };
}

/**
 * The enumerated capability the card's reading reads: the control when the device
 * declares one, else the first readable enum — so a device whose permitted values
 * are absent still presents its current value rather than an empty line.
 */
export function selectCardReadout(capabilities: Capability[]): FlatCapability | undefined {
  return (
    selectCardModel(capabilities).control ??
    flattenCapabilities(capabilities).find((c) => c.valueType === "enum" && c.access.readable)
  );
}

/** The card's reading: the current value as text, or an em dash when it reports none. */
export function selectCardReading(value: unknown): string {
  if (value === undefined || value === null) return "—";
  return String(value);
}

export function SelectCard({ device, config, box, contained }: WallDeviceCardProps): ReactNode {
  const now = useNow();
  const model = selectCardModel(device.capabilities);
  const readout = selectCardReadout(device.capabilities);
  const disabled = !device.reachable;

  // One optimistic channel, called unconditionally with an absent property when
  // the device declares no control, so hook order is stable (design.md D12).
  const value = useOptimisticDeviceProperty(
    device.qualifiedId,
    model.control?.property ?? "",
    model.control ? device.state[model.control.property] : undefined,
    device.observation,
  );

  // An enumerated control carries no on/off state to be measured against, so the
  // device is always active and collapsible_controls has nothing to hide.
  const composition = resolveDeviceCardComposition({
    box: box ?? DEFAULT_WALL_CARD_BOX,
    layout: config?.layout,
    collapsibleControls: config?.collapsible_controls,
    hasControls: model.control !== undefined,
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
          glyph={<ListChecks size={WALL_CARD_GLYPH_SIZE} aria-hidden />}
          disabled={disabled}
        />
        <WallCardText
          name={shortDeviceName(label)}
          state={selectCardReading(current)}
          prominent={composition.form === "full"}
        />
        <WallCardObservation observation={deviceTileObservation(device, now)} />
      </div>

      {composition.controls && model.control && (
        <WallCardActions>
          <WallCardEnumControl
            box={box ?? DEFAULT_WALL_CARD_BOX}
            label={model.control.property}
            values={model.values}
            current={current}
            onSelect={(permitted) => value.setValue(permitted)}
            disabled={disabled}
            error={value.error !== null}
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
