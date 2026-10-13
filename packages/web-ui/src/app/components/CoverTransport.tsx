/**
 * Cover transport controls for a cover card (specs/wall-display "Cover
 * Transport Controls").
 *
 * A cover's primary action is a position, but a wall presents it as discrete,
 * touch-friendly transport rather than a bare slider: Open and Close command the
 * cover to its extremes, and Stop is offered only when a pure helper finds a
 * writable transport property that can express it — so an inert control is never
 * rendered, and a Shelly-like cover keeps Open and Close alone.
 *
 * Every control is a plain pressable button with no hover dependency, sized to
 * the tile's `control` metric, and the current position is shown as a persistent
 * readout so an optimistic command is reflected immediately. A rejected command
 * is surfaced on its own control with the danger token.
 *
 * Rebuilt on the Lumen primitive layer (`ui/*`) and `lucide-react`; its props
 * and behaviour contracts are preserved (task 4.2).
 */
import { ChevronDown, ChevronUp, Square } from "lucide-react";
import type { ReactNode } from "react";
import type { CoverStopCommand, FlatCapability } from "../lib/capability-ranking.js";
import type { DeviceDescriptor } from "../types.js";
import { Button, cn, Row, Stack, Tooltip } from "../ui/index.js";
import { formatReadoutValue } from "./CapabilityControl.js";

interface Props {
  device: DeviceDescriptor;
  /** The cover's writable `position` capability that Open/Close drive. */
  position: FlatCapability;
  /** The shared optimistic position value, resolved by the tile's primary-control hook. */
  value: unknown;
  /** Requests a position through the shared optimistic hook (Open → max, Close → min). */
  onChange: (next: unknown) => void;
  /** Error from the shared position hook, surfaced on Open/Close. */
  error: string | null;
  /** The detected stop command, or `null` when the device cannot express stop. */
  stop: CoverStopCommand | null;
  /** Requests the stop value through an optimistic hook on the transport property. */
  onStop: (next: unknown) => void;
  /** Error from the stop hook, surfaced on Stop. */
  stopError: string | null;
  /** Minimum interactive-control side, in CSS pixels — the size token's `control` metric. */
  control: number;
  /** Text size for the position readout, from the tile's size token. */
  readoutSize: string;
}

/** One pressable transport control, surfaced with an error tooltip when its command fails. */
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
  const button = (
    <Button
      variant="soft"
      aria-label={label}
      title={label}
      disabled={disabled}
      className={cn("p-0", error ? "text-danger" : undefined)}
      style={{ width: control, height: control }}
      onClick={onClick}
    >
      <span aria-hidden className="inline-flex items-center justify-center">
        {icon}
      </span>
    </Button>
  );

  return error ? <Tooltip label={error}>{button}</Tooltip> : button;
}

export function CoverTransport({
  device,
  position,
  value,
  onChange,
  error,
  stop,
  onStop,
  stopError,
  control,
  readoutSize,
}: Props) {
  const disabled = !device.reachable;
  const min = position.range?.min ?? 0;
  const max = position.range?.max ?? 100;
  const iconSize = control >= 48 ? 18 : 14;

  return (
    <Stack gap={1}>
      <Row gap={2} align="center" wrap={false}>
        <TransportButton
          label="Open cover"
          icon={<ChevronUp size={iconSize} aria-hidden />}
          control={control}
          disabled={disabled}
          error={error}
          onClick={() => onChange(max)}
        />
        <TransportButton
          label="Close cover"
          icon={<ChevronDown size={iconSize} aria-hidden />}
          control={control}
          disabled={disabled}
          error={error}
          onClick={() => onChange(min)}
        />
        {stop && (
          <TransportButton
            label="Stop cover"
            icon={<Square size={iconSize} aria-hidden />}
            control={control}
            disabled={disabled}
            error={stopError}
            onClick={() => onStop(stop.value)}
          />
        )}
      </Row>
      <span className="font-semibold text-muted" style={{ fontSize: readoutSize }}>
        {formatReadoutValue(value, position.unit)}
      </span>
    </Stack>
  );
}
