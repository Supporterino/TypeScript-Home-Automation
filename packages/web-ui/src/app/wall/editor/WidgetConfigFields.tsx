/**
 * The per-type config form a wall widget exposes in the editor (design.md D13;
 * specs/wall-display "Wall Configuration Editor"). Driven by the widget type:
 * a room widget picks a room, a device widget picks a device, a scene widget
 * picks an automation and a label, and the rest take an optional title. The
 * values written here are validated by the type's descriptor schema in
 * `model.ts` before a save, so a blank required field surfaces inline rather
 * than reaching the server.
 *
 * Rebuilt on the Lumen primitive layer (`ui/*`); the `ui/` layer carries no
 * input primitive, so the text fields use the shared input treatment.
 */
import type { WallWidget } from "@ts-ha/shared";
import { useDataStore } from "../../lib/data-store.js";
import { humanizeDeviceName } from "../../lib/humanize-name.js";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Stack,
} from "../../ui/index.js";

export interface WidgetConfigFieldsProps {
  widget: WallWidget;
  onChange: (patch: Record<string, unknown>) => void;
}

/** The shared text-input treatment (the `ui/` layer carries no input primitive). */
const INPUT_CLASSES =
  "touch-target h-10 w-full rounded-input border border-hairline bg-surface px-3 text-sm text-ink motion-toggle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

interface SelectOption {
  value: string;
  label: string;
}

/** A labelled single-choice field; the trigger carries the accessible name. */
function SelectField({
  label,
  placeholder,
  value,
  options,
  onChange,
}: {
  label: string;
  placeholder: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted">{label}</span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger aria-label={label}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/** A labelled free-text field, used for the opt-in widget title and scene label. */
function TextField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted">{label}</span>
      <input
        className={INPUT_CLASSES}
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    </label>
  );
}

export function WidgetConfigFields({ widget, onChange }: WidgetConfigFieldsProps) {
  const { rooms, devicesByQualifiedId, automations } = useDataStore();
  const text = (key: string): string =>
    typeof widget.config[key] === "string" ? (widget.config[key] as string) : "";

  switch (widget.type) {
    case "room":
      return (
        <Stack gap={2}>
          <SelectField
            label="Room"
            placeholder="Choose a room"
            value={text("roomId")}
            options={rooms.map((room) => ({ value: room.id, label: room.name }))}
            onChange={(value) => onChange({ roomId: value })}
          />
          <TextField
            label="Title"
            value={text("title")}
            onChange={(value) => onChange({ title: value })}
          />
        </Stack>
      );

    case "device": {
      const devices = [...devicesByQualifiedId.values()].sort((a, b) =>
        humanizeDeviceName(a.displayName).localeCompare(humanizeDeviceName(b.displayName)),
      );
      return (
        <Stack gap={2}>
          <SelectField
            label="Device"
            placeholder="Choose a device"
            value={text("qualifiedId")}
            options={devices.map((device) => ({
              value: device.qualifiedId,
              label: humanizeDeviceName(device.displayName),
            }))}
            onChange={(value) => onChange({ qualifiedId: value })}
          />
          <TextField
            label="Title"
            value={text("title")}
            onChange={(value) => onChange({ title: value })}
          />
        </Stack>
      );
    }

    case "scene":
      return (
        <Stack gap={2}>
          <SelectField
            label="Automation"
            placeholder="Choose an automation"
            value={text("automation")}
            options={automations.map((automation) => ({
              value: automation.name,
              label: automation.name,
            }))}
            onChange={(value) => onChange({ automation: value })}
          />
          <TextField
            label="Button label"
            value={text("label")}
            onChange={(value) => onChange({ label: value })}
          />
        </Stack>
      );

    case "clock":
    case "weather":
    case "energy":
    case "status":
      return (
        <TextField
          label="Title"
          value={text("title")}
          onChange={(value) => onChange({ title: value })}
        />
      );

    case "favorites":
      return <p className="text-sm text-muted">No options.</p>;
  }
}
