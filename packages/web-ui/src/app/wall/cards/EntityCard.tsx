/**
 * The wall entity card: the typed fallback for a device of no class — a leading icon
 * and the device's name over its state.
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
import { WallCardIcon, WallCardObservation, WallCardSlim, WallCardText } from "./card-anatomy.js";
import {
  DEFAULT_WALL_CARD_BOX,
  resolveDeviceCardComposition,
  wallCardRootLayout,
} from "./card-composition.js";
import { WALL_CARD_GLYPH_SIZE, WALL_CARD_METRICS } from "./metrics.js";
import type { WallDeviceCardProps } from "./types.js";

/**
 * An entity's resolved model. `toggle` is present only when the device's ranked
 * primary action is a pure on/off.
 */
export interface WallEntityCardModel {
  toggle: FlatCapability | null;
  readout: FlatCapability | undefined;
}

/**
 * Resolves an entity's model from the same ranking the rest of the product uses, so a
 * non-toggle primary action offers no control.
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
 * The card's state line: the primary readout with its unit, else the device's on/off
 * state ("On"/"Off"), else an em dash.
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

  // Called unconditionally so hook order is stable.
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
  const reading = entityCardReading({
    readout: model.readout,
    readoutValue: model.readout ? device.state[model.readout.property] : undefined,
    toggle: model.toggle,
    resolvedToggleValue: toggleControl.value,
  });
  const icon = (
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
  );

  // An entity card's control is the card itself, so it has no actions row.
  const composition = resolveDeviceCardComposition({
    box: box ?? DEFAULT_WALL_CARD_BOX,
    layout: config?.layout,
    collapsibleControls: config?.collapsible_controls,
    hasControls: false,
    active: onOff?.value ?? true,
  });

  // A one-row cell renders the shared slim line: no observation, and the whole cell is
  // the actuation target where the device's primary action is a toggle.
  if (composition.form === "slim") {
    return (
      <WallCardSlim
        icon={icon}
        name={shortDeviceName(label)}
        state={reading}
        onActivate={actuates && !disabled ? toggle : undefined}
        disabled={disabled}
        contained={contained}
      />
    );
  }

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
        {icon}
        <WallCardText name={shortDeviceName(label)} state={reading} prominent={!actuates} />
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
