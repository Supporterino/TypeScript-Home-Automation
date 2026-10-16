/**
 * Renders a control appropriate to one flattened capability's declared type
 * and constraints, shared by the device tile and the device detail view.
 */
import { composeBooleanCapabilityValue, readBooleanCapabilityValue } from "@ts-ha/shared";
import type { FlatCapability } from "../lib/capability-ranking.js";
import { useOptimisticDeviceProperty } from "../lib/use-optimistic-property.js";
import type { DeviceDescriptor } from "../types.js";
import {
  cn,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Slider,
  Switch,
} from "../ui/index.js";

interface Props {
  device: DeviceDescriptor;
  capability: FlatCapability;
  /** Renders at a smaller scale for a tile's primary control. */
  compact?: boolean;
  /**
   * Explicit scale for the rendered control, overriding the `compact` scale.
   * Used by the wall tile's size token to keep its controls at the wall scale.
   */
  size?: "sm" | "md" | "lg";
  /**
   * Controlled optimistic value. When paired with `onChange`, the caller owns
   * the optimistic state and this component renders it instead of its own.
   */
  value?: unknown;
  /** Controlled change handler, paired with `value`. */
  onChange?: (next: unknown) => void;
  /** Error from the caller's optimistic hook, surfaced when controlled. */
  error?: string | null;
}

/** Maps a scale token to a type size. */
function controlFontSize(size: "sm" | "md" | "lg"): string {
  switch (size) {
    case "sm":
      return "var(--text-sm)";
    case "lg":
      return "var(--text-lg)";
    default:
      return "var(--text-base)";
  }
}

/** Formats a readout value for display, applying the capability's unit when numeric. */
export function formatReadoutValue(value: unknown, unit?: string): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return unit ? `${value} ${unit}` : String(value);
  return String(value);
}

export function CapabilityControl({
  device,
  capability,
  compact,
  size,
  value: controlledValue,
  onChange,
  error: controlledError,
}: Props) {
  const controlSize = size ?? (compact ? "sm" : "md");
  const fontSize = controlFontSize(controlSize);
  const confirmedValue = device.state[capability.property];
  const optimistic = useOptimisticDeviceProperty(
    device.qualifiedId,
    capability.property,
    confirmedValue,
    device.observation,
  );

  const controlled = onChange !== undefined;
  const value = controlled ? controlledValue : optimistic.value;
  const setValue = onChange ?? optimistic.setValue;
  const error = controlled ? (controlledError ?? optimistic.error) : optimistic.error;

  const disabled = !device.reachable;

  const control = (() => {
    if (!capability.access.writable) {
      return (
        <span className="font-semibold" style={{ fontSize }}>
          {formatReadoutValue(value, capability.unit)}
        </span>
      );
    }

    switch (capability.valueType) {
      case "boolean":
        // Reads and writes through the capability's declared on/off encoding: some
        // sources report and accept a string encoding.
        return (
          <Switch
            checked={readBooleanCapabilityValue(capability, value)}
            disabled={disabled}
            onCheckedChange={(checked) =>
              setValue(composeBooleanCapabilityValue(capability, checked))
            }
            aria-label={capability.property}
          />
        );

      case "numeric": {
        // Fixed to the declared range and step, so an out-of-range command cannot
        // be composed.
        const min = capability.range?.min ?? 0;
        const max = capability.range?.max ?? 100;
        const numericValue = typeof value === "number" ? value : min;
        return (
          <Slider
            min={min}
            max={max}
            step={capability.step ?? 1}
            value={[numericValue]}
            disabled={disabled}
            onValueChange={([next]) => setValue(next)}
            aria-label={capability.property}
          />
        );
      }

      case "enum": {
        const options = (capability.permittedValues ?? []).map((option) => String(option));
        const current = typeof value === "string" || typeof value === "number" ? String(value) : "";
        return (
          <Select value={current} onValueChange={(next) => setValue(next)} disabled={disabled}>
            <SelectTrigger aria-label={capability.property}>
              <SelectValue placeholder="—" />
            </SelectTrigger>
            <SelectContent>
              {options.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      }

      case "text":
        return (
          <input
            type="text"
            defaultValue={typeof value === "string" ? value : ""}
            disabled={disabled}
            onBlur={(event) => setValue(event.currentTarget.value)}
            aria-label={capability.property}
            className={cn(
              "touch-target h-10 w-full rounded-input border border-hairline bg-surface px-3 text-ink motion-toggle",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
              "disabled:cursor-not-allowed disabled:opacity-50",
            )}
            style={{ fontSize }}
          />
        );

      default:
        return (
          <span className="text-muted" style={{ fontSize }}>
            {formatReadoutValue(value, capability.unit)}
          </span>
        );
    }
  })();

  if (!error) return control;

  return (
    <div className="flex flex-col gap-1">
      {control}
      <p role="alert" className="text-xs font-medium text-danger">
        {error}
      </p>
    </div>
  );
}
