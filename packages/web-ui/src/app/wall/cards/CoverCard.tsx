/**
 * The wall cover card: its position (when it has one) is the reading, and the actions
 * row carries Open, Stop, and Close as touch-sized icon controls.
 */
import type { Capability } from "@ts-ha/shared";
import { Blinds, ChevronDown, ChevronUp, Square } from "lucide-react";
import type { ReactNode } from "react";
import { formatReadoutValue } from "../../components/CapabilityControl.js";
import {
  type CoverStopCommand,
  type CoverTransportAction,
  type CoverTransportTargets,
  coverStopCommand,
  coverTransportAction,
  coverTransportTargets,
  type FlatCapability,
  flattenCapabilities,
} from "../../lib/capability-ranking.js";
import { deviceTileObservation } from "../../lib/device-tile-state.js";
import { humanizeDeviceName, shortDeviceName } from "../../lib/humanize-name.js";
import { useNow } from "../../lib/use-now.js";
import { useOptimisticDeviceProperty } from "../../lib/use-optimistic-property.js";
import {
  WallCardActions,
  WallCardIcon,
  WallCardIconButton,
  WallCardObservation,
  WallCardSlim,
  WallCardText,
} from "./card-anatomy.js";
import {
  DEFAULT_WALL_CARD_BOX,
  resolveDeviceCardComposition,
  wallCardRootLayout,
} from "./card-composition.js";
import { WALL_CARD_GLYPH_SIZE, WALL_CARD_METRICS } from "./metrics.js";
import type { WallDeviceCardProps } from "./types.js";

/** The movement-state tokens that mean a cover is fully closed — the one state it is idle in. */
const CLOSED_STATE_TOKENS: ReadonlySet<string> = new Set(["closed", "close"]);

/**
 * A cover's resolved transport. `transportProperty` is the property Open/Close
 * commands; `stop` is present only when the device can express it.
 */
export interface WallCoverCardModel {
  position: FlatCapability | undefined;
  stateProperty: string | undefined;
  transportProperty: string | undefined;
  targets: CoverTransportTargets;
  stop: CoverStopCommand | null;
}

/** The declared transport a cover accepts, or `null` when it declares none. */
function declaredTransport(capabilities: Capability[]): CoverTransportAction | null {
  return coverTransportAction(capabilities);
}

/**
 * Resolves a cover's transport model. Open/Close command the declared transport's own
 * property when the device declares one, else the writable position's.
 */
export function coverCardModel(capabilities: Capability[]): WallCoverCardModel {
  const flat = flattenCapabilities(capabilities);
  const transport = declaredTransport(capabilities);
  const position = flat.find((c) => c.property === "position" && c.valueType === "numeric");
  const writablePosition = position?.access.writable ? position : undefined;
  const stateProperty = flat.find((c) => c.property === "state" && c.access.readable)?.property;

  return {
    position,
    stateProperty,
    transportProperty: transport?.property ?? writablePosition?.property,
    targets: coverTransportTargets(transport, writablePosition),
    stop: coverStopCommand(capabilities),
  };
}

/**
 * Whether the cover card presents a control: a property its Open/Close options drive.
 * A cover reporting only a readable state presents none, so it may be one row.
 */
export function coverCardPresentsControls(capabilities: Capability[]): boolean {
  return coverCardModel(capabilities).transportProperty !== undefined;
}

/**
 * The card's primary reading: the position with its unit, else the readable state, else
 * an em dash.
 */
export function coverCardReading(input: {
  position: FlatCapability | undefined;
  positionValue: unknown;
  stateValue: unknown;
}): string {
  if (input.position && input.positionValue !== undefined) {
    return formatReadoutValue(input.positionValue, input.position.unit);
  }
  if (input.stateValue !== undefined) return formatReadoutValue(input.stateValue);
  return "—";
}

/**
 * Whether a cover is active — the state `collapsible_controls` measures against. A
 * cover is idle when it is fully closed.
 */
export function coverCardActive(input: {
  position: FlatCapability | undefined;
  positionValue: unknown;
  stateValue: unknown;
}): boolean {
  if (input.position && typeof input.positionValue === "number") {
    return input.positionValue > (input.position.range?.min ?? 0);
  }
  if (typeof input.stateValue === "string") {
    return !CLOSED_STATE_TOKENS.has(input.stateValue.trim().toLowerCase());
  }
  return true;
}

export function CoverCard({ device, config, box, contained }: WallDeviceCardProps): ReactNode {
  const now = useNow();
  const model = coverCardModel(device.capabilities);
  const disabled = !device.reachable;

  // Called unconditionally so hook order is stable.
  const stopSharesTransport =
    model.stop !== null && model.stop.property === model.transportProperty;
  const transportControl = useOptimisticDeviceProperty(
    device.qualifiedId,
    model.transportProperty ?? "",
    model.transportProperty ? device.state[model.transportProperty] : undefined,
    device.observation,
  );
  const stopControl = useOptimisticDeviceProperty(
    device.qualifiedId,
    model.stop && !stopSharesTransport ? model.stop.property : "",
    model.stop && !stopSharesTransport ? device.state[model.stop.property] : undefined,
    device.observation,
  );
  const stopChannel = stopSharesTransport ? transportControl : stopControl;
  const error = transportControl.error ?? stopControl.error;

  const label = humanizeDeviceName(device.displayName);
  const surface = contained
    ? {}
    : { background: "var(--hearth-surface-raised)", borderRadius: WALL_CARD_METRICS.radius };
  const reading = coverCardReading({
    position: model.position,
    positionValue: model.position ? device.state[model.position.property] : undefined,
    stateValue: model.stateProperty ? device.state[model.stateProperty] : undefined,
  });
  const icon = (
    <WallCardIcon glyph={<Blinds size={WALL_CARD_GLYPH_SIZE} aria-hidden />} disabled={disabled} />
  );

  // A closed cover is idle, so collapsible controls hide its transport until open.
  const composition = resolveDeviceCardComposition({
    box: box ?? DEFAULT_WALL_CARD_BOX,
    layout: config?.layout,
    collapsibleControls: config?.collapsible_controls,
    hasControls: coverCardPresentsControls(device.capabilities),
    active: coverCardActive({
      position: model.position,
      positionValue: model.position ? device.state[model.position.property] : undefined,
      stateValue: model.stateProperty ? device.state[model.stateProperty] : undefined,
    }),
  });

  // A one-row cell renders the shared slim line: no observation, no actions row.
  if (composition.form === "slim") {
    return (
      <WallCardSlim
        icon={icon}
        name={shortDeviceName(label)}
        state={reading}
        disabled={disabled}
        contained={contained}
      />
    );
  }

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
        {icon}
        <WallCardText
          name={shortDeviceName(label)}
          state={reading}
          prominent={composition.form === "full"}
        />
        <WallCardObservation observation={deviceTileObservation(device, now)} />
      </div>

      {model.transportProperty !== undefined && composition.controls && (
        <WallCardActions distribution="distributed">
          <WallCardIconButton
            glyph={<ChevronUp size={WALL_CARD_GLYPH_SIZE} aria-hidden />}
            label={`Open ${label}`}
            disabled={disabled}
            error={transportControl.error !== null}
            onClick={() => transportControl.setValue(model.targets.open)}
          />
          {model.stop && (
            <WallCardIconButton
              glyph={<Square size={WALL_CARD_GLYPH_SIZE} aria-hidden />}
              label={`Stop ${label}`}
              disabled={disabled}
              error={stopChannel.error !== null}
              onClick={() => stopChannel.setValue(model.stop?.value)}
            />
          )}
          <WallCardIconButton
            glyph={<ChevronDown size={WALL_CARD_GLYPH_SIZE} aria-hidden />}
            label={`Close ${label}`}
            disabled={disabled}
            error={transportControl.error !== null}
            onClick={() => transportControl.setValue(model.targets.close)}
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
