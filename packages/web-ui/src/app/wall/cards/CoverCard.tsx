/**
 * The wall cover card (design.md D1, D15; specs/wall-display "Wall Device
 * Presentation", "Cover Transport Controls"). A cover is presented as discrete,
 * touch-friendly transport rather than a bare slider: its position (when it has
 * one) is the card's primary reading, and the actions row carries Open, Stop,
 * and Close as touch-sized icon controls.
 *
 * Stop is offered only when the pure {@link coverStopCommand} finds a writable
 * transport property that can express it, and Open/Close command the device's
 * declared transport action when it declares one and fall back to the position
 * extremes otherwise — so an inert control is never rendered, and a position-less
 * cover is still drivable. Each transport control runs on the shared optimistic
 * channel, so a command is reflected immediately, reconciled against reported
 * state, and reverted with the failure surfaced inline on the affordance that
 * issued it.
 *
 * The pure decisions — the transport properties, the Open/Close values, whether
 * Stop exists, and the reading — are exported so they are reachable by `bun test`
 * (design.md D23). Wall-chunk only (design.md D10).
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
 * A cover's resolved transport (design.md D15). `position` is the numeric
 * capability the card reads; `transportProperty` is the property Open/Close
 * command and is `undefined` for a cover with nothing writable to drive;
 * `stop` is present only when the device can express it.
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
 * Resolves a cover's transport model (design.md D15; specs/wall-display "Cover
 * Transport Controls"). Open/Close command the declared transport's own property
 * when the device declares one, else the writable position's; Stop is detected
 * separately, so a cover that positions without a transport still omits it.
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
 * The card's primary reading: the position with its unit when the device reports
 * one, else the readable movement/transport state (a position-less cover), else
 * an em dash. The value and unit stay one non-breaking unit (specs/wall-display
 * "A value stays with its unit").
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
 * Whether a cover is active — the state `collapsible_controls` measures against
 * (design.md D6; specs/wall-display "A control's layout is configured"). A cover
 * is idle when it is fully closed, which the device reports either as a position
 * at its own minimum or as a movement state reading `closed`; a cover with
 * neither to read is always active, so its transport is never hidden with no way
 * to reveal it.
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

  // One optimistic channel per property, called unconditionally so hook order is
  // stable. Stop shares the transport channel when the device commands stop on
  // the same property, so two hooks never contend on one key (design.md D15).
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

  // The card's own options (design.md D6): its layout, its inactive-controls
  // setting, and the box it was given. A closed cover is idle, so a cover with
  // collapsible controls hides its transport until it is open again, without
  // changing the composition around it.
  const composition = resolveDeviceCardComposition({
    box: box ?? DEFAULT_WALL_CARD_BOX,
    layout: config?.layout,
    collapsibleControls: config?.collapsible_controls,
    hasControls: model.transportProperty !== undefined,
    active: coverCardActive({
      position: model.position,
      positionValue: model.position ? device.state[model.position.property] : undefined,
      stateValue: model.stateProperty ? device.state[model.stateProperty] : undefined,
    }),
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
          glyph={<Blinds size={WALL_CARD_GLYPH_SIZE} aria-hidden />}
          disabled={disabled}
        />
        <WallCardText
          name={shortDeviceName(label)}
          state={coverCardReading({
            position: model.position,
            positionValue: model.position ? device.state[model.position.property] : undefined,
            stateValue: model.stateProperty ? device.state[model.stateProperty] : undefined,
          })}
          prominent={composition.form === "full"}
        />
        <WallCardObservation observation={deviceTileObservation(device, now)} />
      </div>

      {model.transportProperty !== undefined && composition.controls && (
        <WallCardActions>
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
