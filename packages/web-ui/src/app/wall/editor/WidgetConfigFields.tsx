/**
 * The per-type config form a wall widget exposes in the editor: a zone label plus the
 * widget's own configuration.
 */
import { WALL_DEVICE_LAYOUTS, WALL_ZONE_MAX_LENGTH, type WallWidget } from "@ts-ha/shared";
import { useDataStore } from "../../lib/data-store.js";
import { humanizeDeviceName } from "../../lib/humanize-name.js";
import type { DeviceDescriptor } from "../../types.js";
import {
  INPUT_CLASSES,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Stack,
  Switch,
  ToggleGroup,
  ToggleGroupItem,
} from "../../ui/index.js";
import { deviceGridIds } from "../widgets/device-grid-model.js";
import { offeredDevices } from "./model.js";

export interface WidgetConfigFieldsProps {
  widget: WallWidget;
  onChange: (patch: Record<string, unknown>) => void;
  /**
   * Sets or clears the widget's zone label. The zone is the widget's own field
   * rather than part of its type-specific config, so it takes its own callback.
   */
  onZoneChange: (zone: string) => void;
  /**
   * Sets a link widget's target profile, normalised by the model rather than written
   * as a raw config patch.
   */
  onLinkTarget: (target: string) => void;
}

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

/** A labelled free-text field, used for the opt-in widget title, a scene label, and a link's target. */
function TextField({
  label,
  placeholder,
  value,
  onChange,
}: {
  label: string;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted">{label}</span>
      <input
        className={INPUT_CLASSES}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    </label>
  );
}

/**
 * A widget's optional zone label: the widgets sharing a label render inside one band.
 */
function ZoneField({ zone, onChange }: { zone: string; onChange: (zone: string) => void }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted">Zone</span>
      <input
        className={INPUT_CLASSES}
        maxLength={WALL_ZONE_MAX_LENGTH}
        placeholder="No zone"
        value={zone}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    </label>
  );
}

/** The devices a picker offers, humanised and alphabetised so a long list stays scannable. */
function deviceOptions(devices: Iterable<DeviceDescriptor>): SelectOption[] {
  return [...devices]
    .sort((a, b) =>
      humanizeDeviceName(a.displayName).localeCompare(humanizeDeviceName(b.displayName)),
    )
    .map((device) => ({
      value: device.qualifiedId,
      label: humanizeDeviceName(device.displayName),
    }));
}

/**
 * The card layouts a typed device widget offers, built from the shared contract's own
 * list.
 */
const LAYOUT_OPTIONS: SelectOption[] = WALL_DEVICE_LAYOUTS.map((layout) => ({
  value: layout,
  label: `${layout.charAt(0).toUpperCase()}${layout.slice(1)}`,
}));

/**
 * A labelled on/off field for a widget option — the card's inactive-controls setting.
 */
function SwitchField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs font-medium text-muted">{label}</span>
      <Switch aria-label={label} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

/**
 * A device grid's explicit selection: every available device as a touch-sized toggle.
 */
function DeviceSelectionField({
  selected,
  options,
  onChange,
}: {
  selected: readonly string[];
  options: SelectOption[];
  onChange: (next: string[]) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted">Devices</span>
      {options.length === 0 ? (
        <p className="text-sm text-muted">No devices available.</p>
      ) : (
        <ToggleGroup
          type="multiple"
          aria-label="Devices"
          className="flex flex-wrap gap-1.5"
          value={[...selected]}
          onValueChange={(next) => onChange(next)}
        >
          {options.map((option) => (
            <ToggleGroupItem
              key={option.value}
              value={option.value}
              aria-label={option.label}
              className="border border-hairline"
            >
              {option.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      )}
    </div>
  );
}

export function WidgetConfigFields({
  widget,
  onChange,
  onZoneChange,
  onLinkTarget,
}: WidgetConfigFieldsProps) {
  const { rooms, devicesByQualifiedId, automations } = useDataStore();
  const text = (key: string): string =>
    typeof widget.config[key] === "string" ? (widget.config[key] as string) : "";
  const zone = typeof widget.zone === "string" ? widget.zone : "";
  // A typed device card's options: its layout and its inactive-controls setting.
  const layout =
    typeof widget.config.layout === "string" ? (widget.config.layout as string) : "default";
  const collapsibleControls = widget.config.collapsible_controls === true;

  /** The fields the widget's own type contributes, below the shared zone field. */
  function typeFields() {
    switch (widget.type) {
      case "room":
        return (
          <>
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
          </>
        );

      case "light":
      case "cover":
      case "fan":
      case "climate":
      case "lock":
      case "number":
      case "select":
      case "entity":
        // Only devices whose capabilities can drive the widget's class are offered.
        return (
          <>
            <SelectField
              label="Device"
              placeholder="Choose a device"
              value={text("qualifiedId")}
              options={deviceOptions(offeredDevices(widget.type, devicesByQualifiedId.values()))}
              onChange={(value) => onChange({ qualifiedId: value })}
            />
            <SelectField
              label="Layout"
              placeholder="Default"
              value={layout}
              options={LAYOUT_OPTIONS}
              onChange={(value) => onChange({ layout: value })}
            />
            <SwitchField
              label="Hide controls while inactive"
              checked={collapsibleControls}
              onChange={(value) => onChange({ collapsible_controls: value })}
            />
          </>
        );

      case "temperature":
        return (
          <>
            <SelectField
              label="Sensor device"
              placeholder="Choose a sensor"
              value={text("qualifiedId")}
              options={deviceOptions(devicesByQualifiedId.values())}
              onChange={(value) => onChange({ qualifiedId: value })}
            />
            <TextField
              label="Title"
              value={text("title")}
              onChange={(value) => onChange({ title: value })}
            />
          </>
        );

      case "scene":
        return (
          <>
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
          </>
        );

      case "link":
        return (
          <>
            <TextField
              label="Target wall"
              placeholder="Profile name"
              value={text("target")}
              onChange={onLinkTarget}
            />
            <TextField
              label="Button label"
              value={text("label")}
              onChange={(value) => onChange({ label: value })}
            />
          </>
        );

      case "devices":
        return (
          <>
            <DeviceSelectionField
              selected={deviceGridIds(widget.config)}
              options={deviceOptions(devicesByQualifiedId.values())}
              onChange={(next) => onChange({ qualifiedIds: next })}
            />
            <TextField
              label="Title"
              value={text("title")}
              onChange={(value) => onChange({ title: value })}
            />
          </>
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

  return (
    <Stack gap={2}>
      <ZoneField zone={zone} onChange={onZoneChange} />
      {typeFields()}
    </Stack>
  );
}
