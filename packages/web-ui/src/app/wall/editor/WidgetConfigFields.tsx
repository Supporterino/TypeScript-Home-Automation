/**
 * The per-type config form a wall widget exposes in the editor (task 6.2;
 * specs/wall-display "Wall Configuration Editor"). Driven by the widget type:
 * a room widget picks a room, a device widget picks a device, a scene widget
 * picks an automation and a label, and the rest take an optional title. The
 * values written here are validated by the type's descriptor schema in
 * `model.ts` before a save, so a blank required field surfaces inline rather
 * than reaching the server.
 */
import { Select, Stack, Text, TextInput } from "@mantine/core";
import type { WallWidget } from "@ts-ha/shared";
import { useDataStore } from "../../lib/data-store.js";
import { humanizeDeviceName } from "../../lib/humanize-name.js";

export interface WidgetConfigFieldsProps {
  widget: WallWidget;
  onChange: (patch: Record<string, unknown>) => void;
}

export function WidgetConfigFields({ widget, onChange }: WidgetConfigFieldsProps) {
  const { rooms, devicesByQualifiedId, automations } = useDataStore();
  const text = (key: string): string =>
    typeof widget.config[key] === "string" ? (widget.config[key] as string) : "";

  switch (widget.type) {
    case "room":
      return (
        <Stack gap="xs">
          <Select
            label="Room"
            placeholder="Choose a room"
            value={text("roomId") || null}
            onChange={(value) => onChange({ roomId: value ?? "" })}
            data={rooms.map((room) => ({ value: room.id, label: room.name }))}
          />
          <TextInput
            label="Title"
            value={text("title")}
            onChange={(e) => onChange({ title: e.currentTarget.value })}
          />
        </Stack>
      );

    case "device": {
      const devices = [...devicesByQualifiedId.values()].sort((a, b) =>
        humanizeDeviceName(a.displayName).localeCompare(humanizeDeviceName(b.displayName)),
      );
      return (
        <Stack gap="xs">
          <Select
            label="Device"
            placeholder="Choose a device"
            value={text("qualifiedId") || null}
            onChange={(value) => onChange({ qualifiedId: value ?? "" })}
            data={devices.map((device) => ({
              value: device.qualifiedId,
              label: humanizeDeviceName(device.displayName),
            }))}
          />
          <TextInput
            label="Title"
            value={text("title")}
            onChange={(e) => onChange({ title: e.currentTarget.value })}
          />
        </Stack>
      );
    }

    case "scene":
      return (
        <Stack gap="xs">
          <Select
            label="Automation"
            placeholder="Choose an automation"
            value={text("automation") || null}
            onChange={(value) => onChange({ automation: value ?? "" })}
            data={automations.map((automation) => ({
              value: automation.name,
              label: automation.name,
            }))}
          />
          <TextInput
            label="Button label"
            value={text("label")}
            onChange={(e) => onChange({ label: e.currentTarget.value })}
          />
        </Stack>
      );

    case "clock":
    case "weather":
    case "energy":
    case "status":
      return (
        <TextInput
          label="Title"
          value={text("title")}
          onChange={(e) => onChange({ title: e.currentTarget.value })}
        />
      );

    case "favorites":
      return (
        <Text size="sm" c="dimmed">
          No options.
        </Text>
      );
  }
}
