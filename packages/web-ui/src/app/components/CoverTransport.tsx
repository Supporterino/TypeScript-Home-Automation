/**
 * Cover transport controls for a wall cover card (design.md D6; specs/wall-display
 * "Cover Transport Controls").
 *
 * A cover's primary action is a position, but a wall presents it as discrete,
 * touch-friendly transport rather than a bare slider: Open and Close command the
 * cover to its extremes, and Stop is offered only when a pure helper finds a
 * writable transport property that can express it — so an inert control is never
 * rendered, and a Shelly-like cover keeps Open and Close alone (design.md D6).
 *
 * Every control is a plain pressable button with no hover dependency, sized to
 * the wall's minimum touch target through the size token's `control` metric, and
 * the current position is shown as a persistent readout so an optimistic command
 * is reflected immediately.
 *
 * First-paint-safe: this module imports only pure helpers, Mantine, and icons —
 * never the lazy wall chunk (`wall/registry.ts`).
 */
import { ActionIcon, Group, Stack, Text, Tooltip } from "@mantine/core";
import { IconChevronDown, IconChevronUp, IconPlayerStop } from "@tabler/icons-react";
import type { ReactNode } from "react";
import type { CoverStopCommand, FlatCapability } from "../lib/capability-ranking.js";
import type { DeviceDescriptor } from "../types.js";
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

/** One pressable transport control, surfaced with a red tooltip when its command fails. */
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
    <ActionIcon
      variant="light"
      color={error ? "red" : undefined}
      size={control}
      disabled={disabled}
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      {icon}
    </ActionIcon>
  );

  return error ? (
    <Tooltip label={error} color="red" withArrow>
      {button}
    </Tooltip>
  ) : (
    button
  );
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
    <Stack gap={4}>
      <Group gap="xs" wrap="nowrap" align="center">
        <TransportButton
          label="Open cover"
          icon={<IconChevronUp size={iconSize} aria-hidden />}
          control={control}
          disabled={disabled}
          error={error}
          onClick={() => onChange(max)}
        />
        <TransportButton
          label="Close cover"
          icon={<IconChevronDown size={iconSize} aria-hidden />}
          control={control}
          disabled={disabled}
          error={error}
          onClick={() => onChange(min)}
        />
        {stop && (
          <TransportButton
            label="Stop cover"
            icon={<IconPlayerStop size={iconSize} aria-hidden />}
            control={control}
            disabled={disabled}
            error={stopError}
            onClick={() => onStop(stop.value)}
          />
        )}
      </Group>
      <Text size={readoutSize} c="dimmed" fw={600}>
        {formatReadoutValue(value, position.unit)}
      </Text>
    </Stack>
  );
}
