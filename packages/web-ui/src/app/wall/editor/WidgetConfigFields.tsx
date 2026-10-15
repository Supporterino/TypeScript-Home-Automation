/**
 * The per-type config form a wall widget exposes in the editor (design.md D13;
 * wall-zones-and-fit D1, D11, D12; specs/wall-display "Wall Configuration
 * Editor"). Every wall widget carries a zone label (the band it groups into) and
 * its own configuration: a room widget picks a room, a typed device widget binds
 * one device its class can drive and carries that card's layout and
 * inactive-controls setting, the temperature widget picks a device, a scene widget
 * picks an automation and a label, a link picks the wall profile it opens, a device
 * grid selects the devices it shows, and the rest take an optional title. The
 * values written here are validated by the type's descriptor schema in `model.ts`
 * before a save, so a blank required field surfaces inline rather than reaching the
 * server.
 *
 * Rebuilt on the Lumen primitive layer (`ui/*`); the `ui/` layer carries no
 * input primitive, so the text fields use the shared input treatment, and the
 * device grid's selection reuses the Lumen toggle group.
 */
import { WALL_DEVICE_LAYOUTS, WALL_ZONE_MAX_LENGTH, type WallWidget } from "@ts-ha/shared";
import { useDataStore } from "../../lib/data-store.js";
import { humanizeDeviceName } from "../../lib/humanize-name.js";
import type { DeviceDescriptor } from "../../types.js";
import {
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
   * Sets a link widget's target profile. The target is normalised by the model
   * (`setLinkTarget`) rather than written as a raw config patch, so the editor
   * holds one rule for how a profile name is stored.
   */
  onLinkTarget: (target: string) => void;
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
 * A widget's optional zone label (wall-zones-and-fit D1; specs/wall-display "Wall
 * Zones"): the widgets sharing a label render inside one band. The field is
 * bounded by the shared contract's own limit, and clearing it leaves the widget
 * unzoned.
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
 * The card layouts a typed device widget offers (design.md D6; specs/wall-display
 * "A typed device widget is configured"). Built from the shared contract's own
 * list, so the three options the editor shows are exactly the three the schema
 * accepts.
 */
const LAYOUT_OPTIONS: SelectOption[] = WALL_DEVICE_LAYOUTS.map((layout) => ({
  value: layout,
  label: `${layout.charAt(0).toUpperCase()}${layout.slice(1)}`,
}));

/**
 * A labelled on/off field for a widget option (design.md D6) — the card's
 * inactive-controls setting. The switch carries the accessible name.
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
 * A device grid's explicit selection (wall-zones-and-fit D12; specs/wall-display
 * "A device grid's devices are selected"): every available device as a touch-
 * sized toggle, so the author's selection is the grid's device set — never an
 * enumeration of the inventory.
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
  // A typed device card's options (design.md D6): its layout, defaulting to the
  // card's own natural composition, and whether it hides its controls while the
  // device is inactive.
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
        // A typed device widget binds one device, and only the devices whose
        // capabilities can drive the widget's class are offered (design.md D3,
        // D6; specs/wall-display "A device its class cannot drive is not
        // offered", "A typed device widget is configured"). The offer rule is the
        // wall's own resolver, so it is single-sourced with the explanation a
        // widget draws for a mis-bound device. The card's layout and its
        // inactive-controls setting ride in the same config.
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
