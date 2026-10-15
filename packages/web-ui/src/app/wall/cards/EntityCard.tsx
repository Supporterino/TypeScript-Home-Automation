/**
 * The wall entity card (design.md D1, D3; specs/wall-display "Widget Catalog" —
 * "a name-and-state entity card for a device of no class"; "Wall Device
 * Presentation" — "The whole tile actuates a toggle", "A sensor is read-only").
 *
 * This is the wall's typed fallback — the wall's equivalent of Mushroom's own
 * generic card — so "no generic card" does not mean "no answer for an
 * unclassified device". It composes the ported anatomy in order: the leading
 * circular icon affordance, the device's name over its state.
 *
 * Where the device's primary action is a pure toggle, the whole card is the
 * actuation target and the icon affordance is the accessible control; where the
 * device has no actuatable property at all, the card presents its reading as its
 * dominant content with no control and no navigation affordance. A device whose
 * primary action is a value keeps its own card (never this one), so this card
 * never presents a control a bare activation could not express.
 *
 * The pure decisions — whether the device has a toggle, what the reading says —
 * are exported so they are reachable by `bun test` (design.md D23). Wall-chunk
 * only (design.md D10).
 */
import type { Capability } from "@ts-ha/shared";
import { readBooleanCapabilityValue } from "@ts-ha/shared";
import { Activity, Power } from "lucide-react";
import type { ReactNode } from "react";
import { formatReadoutValue } from "../../components/CapabilityControl.js";
import { type FlatCapability, rankDeviceTile } from "../../lib/capability-ranking.js";
import {
  deviceTileObservation,
  deviceTileOnOffFromCapabilityValue,
  deviceTileToggledValue,
} from "../../lib/device-tile-state.js";
import { humanizeDeviceName, shortDeviceName } from "../../lib/humanize-name.js";
import { useNow } from "../../lib/use-now.js";
import { useOptimisticDeviceProperty } from "../../lib/use-optimistic-property.js";
import { WallCardIcon, WallCardObservation, WallCardText } from "./card-anatomy.js";
import {
  DEFAULT_WALL_CARD_BOX,
  resolveDeviceCardComposition,
  wallCardRootLayout,
} from "./card-composition.js";
import { WALL_CARD_GLYPH_SIZE, WALL_CARD_METRICS } from "./metrics.js";
import type { WallDeviceCardProps } from "./types.js";

/**
 * An entity's resolved model (design.md D1, D3). `toggle` is present only when
 * the device's ranked primary action is a pure on/off — the one case the whole
 * card may actuate; `readout` is the capability the state line reads.
 */
export interface WallEntityCardModel {
  toggle: FlatCapability | null;
  readout: FlatCapability | undefined;
}

/**
 * Resolves an entity's model from the same ranking the rest of the product uses
 * (design.md D1). A device whose primary action is not a pure toggle — a value,
 * or an unclassifiable writable — has no `toggle`, so the card presents no
 * control it could not drive (specs/wall-display "A control the device cannot
 * express MUST NOT be presented").
 */
export function entityCardModel(capabilities: Capability[]): WallEntityCardModel {
  const ranking = rankDeviceTile(capabilities);
  return {
    toggle: ranking.action?.kind === "on_off" ? ranking.action.capability : null,
    readout: ranking.readout?.capability,
  };
}

/** Whether the card's whole surface is the actuation target — a device whose primary action is a pure toggle. */
export function entityCardWholeCardActuates(model: WallEntityCardModel): boolean {
  return model.toggle !== null;
}

/**
 * The card's state line: the primary readout with its unit when the device
 * reports one, else the device's own on/off state ("On"/"Off"), else an em dash.
 * The value and unit stay one non-breaking unit (specs/wall-display "A value
 * stays with its unit").
 */
export function entityCardReading(input: {
  readout: FlatCapability | undefined;
  readoutValue: unknown;
  toggle: FlatCapability | null;
  resolvedToggleValue: unknown;
}): string {
  if (input.readout) return formatReadoutValue(input.readoutValue, input.readout.unit);
  if (input.toggle) {
    return readBooleanCapabilityValue(input.toggle, input.resolvedToggleValue) ? "On" : "Off";
  }
  return "—";
}

export function EntityCard({ device, config, box, contained }: WallDeviceCardProps): ReactNode {
  const now = useNow();
  const model = entityCardModel(device.capabilities);
  const disabled = !device.reachable;

  // One optimistic channel for the toggle — called unconditionally with an
  // absent property when there is none, so hook order is stable (design.md D12).
  const toggleControl = useOptimisticDeviceProperty(
    device.qualifiedId,
    model.toggle?.property ?? "",
    model.toggle ? device.state[model.toggle.property] : undefined,
    device.observation,
  );
  const onOff = model.toggle
    ? deviceTileOnOffFromCapabilityValue(model.toggle, toggleControl.value)
    : null;
  const actuates = entityCardWholeCardActuates(model);
  const toggle = (): void => {
    if (!model.toggle) return;
    toggleControl.setValue(deviceTileToggledValue(model.toggle, toggleControl.value));
  };

  const label = humanizeDeviceName(device.displayName);
  const surface = contained
    ? {}
    : { background: "var(--hearth-surface-raised)", borderRadius: WALL_CARD_METRICS.radius };

  // The card's own options (design.md D6): its layout and the box it was given.
  // An entity card's control is the card itself — the whole surface actuates a
  // toggle — so it has no actions row for `collapsible_controls` to hide, and
  // `hasControls` is always `false`.
  const composition = resolveDeviceCardComposition({
    box: box ?? DEFAULT_WALL_CARD_BOX,
    layout: config?.layout,
    collapsibleControls: config?.collapsible_controls,
    hasControls: false,
    active: onOff?.value ?? true,
  });

  return (
    <div
      onClick={actuates && !disabled ? toggle : undefined}
      style={{
        position: "relative",
        ...wallCardRootLayout(composition),
        minWidth: 0,
        height: "100%",
        boxSizing: "border-box",
        overflow: "hidden",
        cursor: actuates && !disabled ? "pointer" : undefined,
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
            actuates ? (
              onOff?.value ? (
                <Power size={WALL_CARD_GLYPH_SIZE} fill="currentColor" aria-hidden />
              ) : (
                <Power size={WALL_CARD_GLYPH_SIZE} aria-hidden />
              )
            ) : (
              <Activity size={WALL_CARD_GLYPH_SIZE} aria-hidden />
            )
          }
          tint={actuates ? (onOff?.value ? "var(--hearth-on)" : "var(--hearth-off)") : undefined}
          onActivate={model.toggle ? toggle : undefined}
          pressed={onOff?.value}
          disabled={disabled}
          label={`Turn ${onOff?.value ? "off" : "on"} ${label}`}
        />
        <WallCardText
          name={shortDeviceName(label)}
          state={entityCardReading({
            readout: model.readout,
            readoutValue: model.readout ? device.state[model.readout.property] : undefined,
            toggle: model.toggle,
            resolvedToggleValue: toggleControl.value,
          })}
          prominent={!actuates}
        />
        <WallCardObservation observation={deviceTileObservation(device, now)} />
      </div>

      {toggleControl.error && (
        <p
          role="alert"
          style={{
            margin: 0,
            padding: `0 ${WALL_CARD_METRICS.padding}px ${WALL_CARD_METRICS.padding}px`,
            color: "var(--hearth-danger)",
            fontSize: WALL_CARD_METRICS.secondarySize,
          }}
        >
          {toggleControl.error}
        </p>
      )}
    </div>
  );
}
