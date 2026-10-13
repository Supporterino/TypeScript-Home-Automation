/**
 * The wall-profile editor (design.md D5, D9, D13; specs/wall-display "Wall
 * Configuration Editor"). A full-screen overlay within `/walls` — the wall is
 * not a route the editor lives under — that composes a profile's base layout:
 * add a widget of any registered type, configure it, and move/resize it with
 * cell/span controls that are keyboard-accessible and need no drag. Every
 * mutation is delegated to the pure `model.ts` functions, and saving funnels
 * through `submitProfileDraft`, so an invalid draft is rejected inline and
 * never reaches the API. The widget list is a responsive grid (two columns on a
 * wide viewport, one narrow) so a long profile stays scannable without
 * horizontal scrolling; each widget stays a self-contained card.
 *
 * Loaded only inside the lazy `wall` chunk; imported only from `WallsView`.
 * Rebuilt on the Lumen primitive layer (`ui/*`) and `lucide-react`.
 */
import {
  WALL_GRID_COLUMNS,
  WALL_GRID_MAX_ROWS,
  WALL_WIDGET_TYPES,
  type WallProfile,
  type WallProfileConfig,
  type WallWidget,
  type WallWidgetType,
} from "@ts-ha/shared";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { updateWall } from "../../api.js";
import {
  Badge,
  Button,
  Card,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Divider,
  Grid,
  IconButton,
  Row,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
  Stack,
} from "../../ui/index.js";
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

/** The shared text/number input treatment (the `ui/` layer carries no input primitive). */
const INPUT_CLASSES =
  "touch-target h-10 w-full rounded-input border border-hairline bg-surface px-3 text-sm text-ink motion-toggle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

/** Coerces a numeric field's string value to a whole grid cell, falling back on the current value. */
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
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="inset-0 flex h-dvh max-h-dvh w-screen max-w-none translate-x-0 translate-y-0 flex-col overflow-hidden rounded-none border-0 p-4 md:p-6">
        <DialogHeader>
          <DialogTitle className="font-display text-xl font-bold text-ink">
            Configure “{profile.name}”
          </DialogTitle>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
          <Row justify="between" align="end" gap={3} wrap>
            <Row gap={2} align="end" wrap>
              <Stack gap={1} className="min-w-[200px]">
                <span className="text-xs font-medium text-muted">Add widget</span>
                <Select
                  value={addType}
                  onValueChange={(value) => setAddType(value as WallWidgetType)}
                >
                  <SelectTrigger aria-label="Widget type">
                    <SelectValue placeholder="Choose a widget type" />
                  </SelectTrigger>
                  <SelectContent>
                    {WALL_WIDGET_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {WALL_WIDGET_REGISTRY[type].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Stack>
              <Button onClick={() => edit(addWidget(config, addType))}>
                <Plus size={16} aria-hidden />
                Add
              </Button>
            </Row>
            <Row gap={2} align="center" wrap>
              <Button variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={() => void handleSave()} disabled={saving}>
                {saving && <Spinner size={14} label="" />}
                Save
              </Button>
            </Row>
          </Row>

          <p className="text-sm text-muted">
            {config.widgets.length} widget{config.widgets.length === 1 ? "" : "s"} on a{" "}
            {WALL_GRID_COLUMNS}-column grid. Move and resize with the cell controls — no dragging.
          </p>

          {errors.length > 0 && (
            <div role="alert" className="rounded-tile border border-danger/40 bg-danger/10 p-3">
              <p className="font-semibold text-ink">Cannot save this profile</p>
              <div className="flex flex-col gap-0.5">
                {errors.map((message) => (
                  <p key={message} className="text-sm text-muted">
                    {message}
                  </p>
                ))}
              </div>
            </div>
          )}

          <Divider />

          {config.widgets.length === 0 ? (
            <p className="text-sm text-muted">No widgets yet — add one above.</p>
          ) : (
            <Grid columns={1} md={2} gap={3}>
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
            </Grid>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface WidgetRowProps {
  widget: WallWidget;
  onPlacement: (placement: WallPlacement) => void;
  onConfig: (patch: Record<string, unknown>) => void;
  onRemove: () => void;
}

/** A labelled whole-cell number input; the placement controls never require a drag. */
function CellField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted">{label}</span>
      <input
        type="number"
        inputMode="numeric"
        className={INPUT_CLASSES}
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(toCell(event.currentTarget.value, value))}
      />
    </label>
  );
}

function WidgetRow({ widget, onPlacement, onConfig, onRemove }: WidgetRowProps) {
  const descriptor = getWidgetDescriptor(widget.type);

  return (
    <Card>
      <Stack gap={2}>
        <Row justify="between" align="center" gap={2} wrap>
          <Row gap={2} align="center" wrap>
            <Badge tone="neutral">{descriptor.label}</Badge>
            <span className="font-mono text-xs text-muted">{widget.id}</span>
          </Row>
          <IconButton label="Remove widget" size="sm" className="text-danger" onClick={onRemove}>
            <Trash2 size={16} />
          </IconButton>
        </Row>

        <Grid columns={2} md={4} gap={2}>
          <CellField
            label="Column (x)"
            min={0}
            max={Math.max(0, WALL_GRID_COLUMNS - widget.w)}
            value={widget.x}
            onChange={(value) => onPlacement({ ...widget, x: value })}
          />
          <CellField
            label="Row (y)"
            min={0}
            max={Math.max(0, WALL_GRID_MAX_ROWS - widget.h)}
            value={widget.y}
            onChange={(value) => onPlacement({ ...widget, y: value })}
          />
          <CellField
            label="Width"
            min={descriptor.min.w}
            max={Math.min(descriptor.max.w, WALL_GRID_COLUMNS)}
            value={widget.w}
            onChange={(value) => onPlacement({ ...widget, w: value })}
          />
          <CellField
            label="Height"
            min={descriptor.min.h}
            max={descriptor.max.h}
            value={widget.h}
            onChange={(value) => onPlacement({ ...widget, h: value })}
          />
        </Grid>

        <WidgetConfigFields widget={widget} onChange={onConfig} />
      </Stack>
    </Card>
  );
}
