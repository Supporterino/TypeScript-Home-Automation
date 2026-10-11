/**
 * The wall-profile editor (task 6.2; design.md D5; specs/wall-display "Wall
 * Configuration Editor"). A full-screen modal within `/walls` — the wall is not
 * a route the editor lives under — that composes a profile's base layout: add
 * a widget of any registered type, configure it, and move/resize it with
 * cell/span controls that are keyboard-accessible and need no drag. Every
 * mutation is delegated to the pure `model.ts` functions, and saving funnels
 * through `submitProfileDraft`, so an invalid draft is rejected inline and
 * never reaches the API.
 *
 * Lives in the lazy `wall` chunk; imported only from `WallsView`.
 */
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Divider,
  Group,
  Modal,
  NumberInput,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Text,
} from "@mantine/core";
import { IconPlus, IconTrash } from "@tabler/icons-react";
import {
  WALL_GRID_COLUMNS,
  WALL_GRID_MAX_ROWS,
  WALL_WIDGET_TYPES,
  type WallProfile,
  type WallProfileConfig,
  type WallWidget,
  type WallWidgetType,
} from "@ts-ha/shared";
import { useState } from "react";
import { updateWall } from "../../api.js";
import { getWidgetDescriptor, WALL_WIDGET_REGISTRY } from "../registry.js";
import {
  addWidget,
  removeWidget,
  submitProfileDraft,
  updateWidgetConfig,
  updateWidgetPlacement,
  type WallPlacement,
} from "./model.js";
import { WidgetConfigFields } from "./WidgetConfigFields.js";

export interface WallEditorProps {
  profile: WallProfile;
  onClose: () => void;
  onSaved: () => void;
}

/** Coerces a Mantine `NumberInput` value to a whole grid cell, falling back on the current value. */
function toCell(value: number | string, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number.parseFloat(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : fallback;
}

export function WallEditor({ profile, onClose, onSaved }: WallEditorProps) {
  const [config, setConfig] = useState<WallProfileConfig>(profile.config);
  const [addType, setAddType] = useState<WallWidgetType>("clock");
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  function edit(next: WallProfileConfig) {
    setConfig(next);
    setErrors([]);
  }

  async function handleSave() {
    setSaving(true);
    setErrors([]);
    try {
      const result = await submitProfileDraft(profile.name, config, async (next) => {
        await updateWall(profile.name, { config: next });
      });
      if (!result.ok) {
        setErrors(result.errors);
        return;
      }
      onSaved();
      onClose();
    } catch (err) {
      setErrors([err instanceof Error ? err.message : "Failed to save wall profile"]);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal opened onClose={onClose} fullScreen title={`Configure “${profile.name}”`}>
      <Stack gap="md">
        <Group justify="space-between" align="flex-end">
          <Group gap="xs" align="flex-end">
            <Select
              label="Add widget"
              value={addType}
              onChange={(value) => value && setAddType(value as WallWidgetType)}
              data={WALL_WIDGET_TYPES.map((type) => ({
                value: type,
                label: WALL_WIDGET_REGISTRY[type].label,
              }))}
              style={{ minWidth: 200 }}
            />
            <Button
              leftSection={<IconPlus size={16} />}
              onClick={() => edit(addWidget(config, addType))}
            >
              Add
            </Button>
          </Group>
          <Group gap="xs">
            <Button variant="default" onClick={onClose}>
              Cancel
            </Button>
            <Button loading={saving} onClick={() => void handleSave()}>
              Save
            </Button>
          </Group>
        </Group>

        <Text size="sm" c="dimmed">
          {config.widgets.length} widget{config.widgets.length === 1 ? "" : "s"} on a{" "}
          {WALL_GRID_COLUMNS}-column grid. Move and resize with the cell controls — no dragging.
        </Text>

        {errors.length > 0 && (
          <Alert color="red" title="Cannot save this profile">
            <Stack gap={2}>
              {errors.map((message) => (
                <Text key={message} size="sm">
                  {message}
                </Text>
              ))}
            </Stack>
          </Alert>
        )}

        <Divider />

        {config.widgets.length === 0 ? (
          <Text c="dimmed" size="sm">
            No widgets yet — add one above.
          </Text>
        ) : (
          <Stack gap="sm">
            {config.widgets.map((widget) => (
              <WidgetRow
                key={widget.id}
                widget={widget}
                onPlacement={(placement) =>
                  edit(updateWidgetPlacement(config, widget.id, placement))
                }
                onConfig={(patch) => edit(updateWidgetConfig(config, widget.id, patch))}
                onRemove={() => edit(removeWidget(config, widget.id))}
              />
            ))}
          </Stack>
        )}
      </Stack>
    </Modal>
  );
}

interface WidgetRowProps {
  widget: WallWidget;
  onPlacement: (placement: WallPlacement) => void;
  onConfig: (patch: Record<string, unknown>) => void;
  onRemove: () => void;
}

function WidgetRow({ widget, onPlacement, onConfig, onRemove }: WidgetRowProps) {
  const descriptor = getWidgetDescriptor(widget.type);

  return (
    <Paper withBorder p="sm" radius="md">
      <Stack gap="sm">
        <Group justify="space-between">
          <Group gap="xs">
            <Badge variant="light">{descriptor.label}</Badge>
            <Text size="xs" c="dimmed" ff="monospace">
              {widget.id}
            </Text>
          </Group>
          <ActionIcon color="red" variant="subtle" aria-label="Remove widget" onClick={onRemove}>
            <IconTrash size={16} />
          </ActionIcon>
        </Group>

        <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="xs">
          <NumberInput
            label="Column (x)"
            min={0}
            max={Math.max(0, WALL_GRID_COLUMNS - widget.w)}
            value={widget.x}
            onChange={(value) => onPlacement({ ...widget, x: toCell(value, widget.x) })}
          />
          <NumberInput
            label="Row (y)"
            min={0}
            max={Math.max(0, WALL_GRID_MAX_ROWS - widget.h)}
            value={widget.y}
            onChange={(value) => onPlacement({ ...widget, y: toCell(value, widget.y) })}
          />
          <NumberInput
            label="Width"
            min={descriptor.min.w}
            max={Math.min(descriptor.max.w, WALL_GRID_COLUMNS)}
            value={widget.w}
            onChange={(value) => onPlacement({ ...widget, w: toCell(value, widget.w) })}
          />
          <NumberInput
            label="Height"
            min={descriptor.min.h}
            max={descriptor.max.h}
            value={widget.h}
            onChange={(value) => onPlacement({ ...widget, h: toCell(value, widget.h) })}
          />
        </SimpleGrid>

        <WidgetConfigFields widget={widget} onChange={onConfig} />
      </Stack>
    </Paper>
  );
}
