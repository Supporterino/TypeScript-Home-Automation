/**
 * Cover transport controls for a wall cover card (design.md D15;
 * specs/wall-display "Cover Transport Controls").
 *
 * A cover is presented as discrete, touch-friendly transport rather than a bare
 * slider: Open and Close command the device's declared transport action when it
 * declares one and fall back to the position extremes otherwise, and Stop is
 * offered only when the pure `coverStopCommand` finds a writable transport
 * property that can express it — so an inert control is never rendered.
 *
 * The tile owns the optimistic channels: Open, Close, and Stop command through
 * the channels the tile passes in, so a single property never has two hooks
 * contending on it. The tile resolves the transport from the device's own
 * capabilities and supplies one channel per property — the declared transport's
 * channel shared by Open/Close/Stop, or the primary position channel when no
 * transport is declared. Every control is a plain pressable button with no
 * hover dependency, sized to the wall's kiosk-class touch target and separated
 * by Hearth's ≥8 px adjacent-control floor, and every command runs on the shared
 * optimistic channels so it is reflected immediately, reconciled, and reverted
 * with the failure surfaced inline rather than through a hover-only tooltip.
 *
 * Hearth-only: this is a wall presentation, so it draws with `var(--hearth-*)`
 * tokens and never the dashboard's Lumen primitives (design.md D1, D7). It must
 * not import the lazy wall vocabulary (`wall/widgets/card-vocab.tsx`), which
 * reaches the wall registry and the shared wall schema — importing it here would
 * pull zod into first paint (design.md D5).
 */
import { ChevronDown, ChevronUp, Square } from "lucide-react";
import type { ReactNode } from "react";
import {
  type CoverStopCommand,
  type CoverTransportAction,
  coverTransportTargets,
  type FlatCapability,
} from "../lib/capability-ranking.js";
import type { DeviceDescriptor } from "../types.js";
import { formatReadoutValue } from "./CapabilityControl.js";

/** A tile-owned optimistic channel for one transport property (design.md D15). */
export interface CoverTransportChannel {
  /** Requests a value on the channel's property. */
  setValue: (next: unknown) => void;
  /** The channel's most recent command error, or `null`. */
  error: string | null;
}

interface Props {
  device: DeviceDescriptor;
  /**
   * The cover's ranked primary capability the tile drives — its writable
   * `position` when it positions (whose extremes Open/Close fall back to), else
   * the transport capability the ranking selected.
   */
  position: FlatCapability;
  /** The tile's resolved primary-control value, shown as the position readout. */
  value: unknown;
  /** The tile's primary-control channel, used for Open/Close when no transport action is declared. */
  onChange: (next: unknown) => void;
  /** Error from the tile's primary-control channel, surfaced on Open/Close when falling back. */
  error: string | null;
  /** The declared transport the tile resolved, or `null` when the device declares none. */
  transport: CoverTransportAction | null;
  /** The tile-owned optimistic channel for the declared transport property. */
  transportChannel: CoverTransportChannel;
  /** The detected stop command, or `null` when the device cannot express stop. */
  stop: CoverStopCommand | null;
  /** The channel Stop commands through — the transport channel when it shares the property, else a dedicated one. */
  stopChannel: CoverTransportChannel;
  /** Minimum interactive-control side, in CSS pixels — the wall's touch target. */
  control: number;
  /** Text size for the position readout, from the wall ramp. */
  readoutSize: string;
}

/** One pressable Hearth transport control, tinted by its channel's error (design.md D4). */
function TransportButton({
  label,
  icon,
  control,
  disabled,
  error,
  onClick,
}: {
  label: string;
  icon: ReactNode;
  control: number;
  disabled: boolean;
  error: string | null;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      style={{
        display: "inline-flex",
        flex: "none",
        alignItems: "center",
        justifyContent: "center",
        width: control,
        height: control,
        padding: 0,
        borderRadius: "var(--hearth-radius-pill)",
        border: `1px solid ${error ? "var(--hearth-danger)" : "var(--hearth-hairline)"}`,
        background: "var(--hearth-surface-raised)",
        color: error ? "var(--hearth-danger)" : "var(--hearth-text)",
        cursor: disabled ? "progress" : "pointer",
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <span
        aria-hidden
        style={{ display: "inline-flex", alignItems: "center", justifyContent: "center" }}
      >
        {icon}
      </span>
    </button>
  );
}

export function CoverTransport({
  device,
  position,
  value,
  onChange,
  error,
  transport,
  transportChannel,
  stop,
  stopChannel,
  control,
  readoutSize,
}: Props) {
  const disabled = !device.reachable;
  // Open/Close use the declared transport through the tile's own channel when
  // the device declares one, and the tile's primary position channel otherwise
  // (specs/wall-display "Open and close use the declared transport").
  const channel: CoverTransportChannel = transport
    ? transportChannel
    : { error, setValue: onChange };
  const targets = coverTransportTargets(transport, position);
  const iconSize = control >= 56 ? 24 : control >= 48 ? 20 : 16;
  // The persistent position readout is shown only when the primary capability is
  // a position — a position-less cover has no position to report.
  const showsPositionReadout = position.property === "position" && position.valueType === "numeric";
  const alert = channel.error ?? stopChannel.error;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--hearth-space-2)",
        minWidth: 0,
      }}
    >
      <div
        style={{ display: "flex", alignItems: "center", gap: "var(--hearth-space-2)", minWidth: 0 }}
      >
        <TransportButton
          label="Open cover"
          icon={<ChevronUp size={iconSize} aria-hidden />}
          control={control}
          disabled={disabled}
          error={channel.error}
          onClick={() => channel.setValue(targets.open)}
        />
        <TransportButton
          label="Close cover"
          icon={<ChevronDown size={iconSize} aria-hidden />}
          control={control}
          disabled={disabled}
          error={channel.error}
          onClick={() => channel.setValue(targets.close)}
        />
        {stop && (
          <TransportButton
            label="Stop cover"
            icon={<Square size={iconSize} aria-hidden />}
            control={control}
            disabled={disabled}
            error={stopChannel.error}
            onClick={() => stopChannel.setValue(stop.value)}
          />
        )}
      </div>
      {showsPositionReadout && (
        <span
          style={{
            fontWeight: "var(--hearth-weight-semibold)",
            color: "var(--hearth-text-muted)",
            fontSize: readoutSize,
          }}
        >
          {formatReadoutValue(value, position.unit)}
        </span>
      )}
      {alert && (
        <p role="alert" style={{ margin: 0, color: "var(--hearth-danger)", fontSize: readoutSize }}>
          {alert}
        </p>
      )}
    </div>
  );
}
