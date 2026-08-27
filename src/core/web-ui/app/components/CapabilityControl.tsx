/**
 * Renders a control appropriate to one flattened capability's declared type
 * and constraints (design.md D12; task 10.11, 10.12). Shared by the device
 * tile's primary control and the device detail view's full control list —
 * detail views stay fully generic, tiles apply a curated ranking on top,
 * never a different rendering path underneath.
 *
 * A read-only capability renders a plain readout. A writable one renders
 * the widget matching its `valueType`, constrained to its declared range or
 * permitted values so an out-of-range command cannot be composed — and
 * wired through {@link useOptimisticDeviceProperty} for immediate
 * reflection, reconciliation, and revert.
 */
import { Select, Slider, Switch, Text, TextInput, Tooltip } from "@mantine/core";
import type { FlatCapability } from "../lib/capability-ranking.js";
import { useOptimisticDeviceProperty } from "../lib/use-optimistic-property.js";
import type { DeviceDescriptor } from "../types.js";

interface Props {
  device: DeviceDescriptor;
  capability: FlatCapability;
  /** Renders at a smaller scale for a tile's primary control. */
  compact?: boolean;
}

/** Formats a readout value for display, applying the capability's unit when numeric. */
export function formatReadoutValue(value: unknown, unit?: string): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return unit ? `${value} ${unit}` : String(value);
  return String(value);
}

export function CapabilityControl({ device, capability, compact }: Props) {
  const confirmedValue = device.state[capability.property];
  const { value, error, setValue } = useOptimisticDeviceProperty(
    device.qualifiedId,
    capability.property,
    confirmedValue,
    device.observation,
  );

  const disabled = !device.reachable;

  const control = (() => {
    if (!capability.access.writable) {
      return (
        <Text size={compact ? "sm" : "md"} fw={600}>
          {formatReadoutValue(value, capability.unit)}
        </Text>
      );
    }

    switch (capability.valueType) {
      case "boolean":
        return (
          <Switch
            size={compact ? "sm" : "md"}
            checked={Boolean(value)}
            disabled={disabled}
            onChange={(e) => setValue(e.currentTarget.checked)}
            aria-label={capability.property}
          />
        );

      case "numeric": {
        const min = capability.range?.min ?? 0;
        const max = capability.range?.max ?? 100;
        const numericValue = typeof value === "number" ? value : min;
        return (
          <Slider
            size={compact ? "sm" : "md"}
            min={min}
            max={max}
            step={capability.step ?? 1}
            value={numericValue}
            disabled={disabled}
            label={(v) => (capability.unit ? `${v} ${capability.unit}` : String(v))}
            onChange={(v) => setValue(v)}
          />
        );
      }

      case "enum": {
        const options = (capability.permittedValues ?? []).map((v) => String(v));
        return (
          <Select
            size={compact ? "sm" : "md"}
            data={options}
            value={typeof value === "string" || typeof value === "number" ? String(value) : null}
            disabled={disabled}
            onChange={(v) => {
              if (v !== null) setValue(v);
            }}
            aria-label={capability.property}
          />
        );
      }

      case "text":
        return (
          <TextInput
            size={compact ? "sm" : "md"}
            defaultValue={typeof value === "string" ? value : ""}
            disabled={disabled}
            onBlur={(e) => setValue(e.currentTarget.value)}
            aria-label={capability.property}
          />
        );

      default:
        return (
          <Text size={compact ? "sm" : "md"} c="dimmed">
            {formatReadoutValue(value, capability.unit)}
          </Text>
        );
    }
  })();

  if (!error) return control;

  return (
    <Tooltip label={error} color="red" withArrow>
      {control}
    </Tooltip>
  );
}
