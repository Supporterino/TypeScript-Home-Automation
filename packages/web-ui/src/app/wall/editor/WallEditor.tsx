/**
 * The wall-profile editor: a full-screen overlay within `/walls` that composes a
 * profile's base layout.
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
import { useDataStore } from "../../lib/data-store.js";
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
  INPUT_CLASSES,
  Row,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
  Stack,
} from "../../ui/index.js";
import { widgetTitle } from "../frame.js";
import { getWidgetDescriptor, WALL_WIDGET_REGISTRY } from "../registry.js";
import { WALL_TITLE_ROWS } from "../span.js";
import {
  addWidget,
  removeWidget,
  setLinkTarget,
  submitProfileDraft,
  updateWidgetConfig,
  updateWidgetPlacement,
  updateWidgetZone,
  type WallPlacement,
} from "./model.js";
import { resolveDraftPreview, type WallDraftPreview, type WallPreviewBox } from "./preview.js";
import { WidgetConfigFields } from "./WidgetConfigFields.js";

export interface WallEditorProps {
  profile: WallProfile;
  onClose: () => void;
  onSaved: () => void;
}

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
  // The store's devices decide each typed widget's effective minimum, so the editor's
  // clamp and its save validation agree on a one-row control-less device.
  const { devices } = useDataStore();

  // The draft's preview at the wall's target panel, via the same pure resolver.
  const preview = resolveDraftPreview(config);
  const unfittable = preview.fit === "tooLarge";

  function edit(next: WallProfileConfig) {
    setConfig(next);
    setErrors([]);
  }

  async function handleSave() {
    setSaving(true);
    setErrors([]);
    try {
      const persist = async (next: WallProfileConfig) => {
        await updateWall(profile.name, { config: next });
      };
      const result = await submitProfileDraft(profile.name, config, persist, devices);
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
              <Button onClick={() => void handleSave()} disabled={saving || unfittable}>
                {saving && <Spinner size={14} label="" />}
                Save
              </Button>
            </Row>
          </Row>

          <p className="text-sm text-muted">
            {config.widgets.length} widget{config.widgets.length === 1 ? "" : "s"} on a{" "}
            {WALL_GRID_COLUMNS}-column grid. Move and resize with the cell controls — no dragging.
          </p>

          <DraftPreviewCard preview={preview} unfittable={unfittable} />

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
                    edit(updateWidgetPlacement(config, widget.id, placement, undefined, devices))
                  }
                  onConfig={(patch) => edit(updateWidgetConfig(config, widget.id, patch))}
                  onZoneChange={(zone) => edit(updateWidgetZone(config, widget.id, zone))}
                  onLinkTarget={(target) => edit(setLinkTarget(config, widget.id, target))}
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
  onZoneChange: (zone: string) => void;
  onLinkTarget: (target: string) => void;
  onRemove: () => void;
}

/** A box's position and size as percentages of the panel's own dimensions. */
function boxStyle(box: WallPreviewBox, panel: WallDraftPreview["panel"]) {
  return {
    left: `${(box.left / panel.width) * 100}%`,
    top: `${(box.top / panel.height) * 100}%`,
    width: `${(box.width / panel.width) * 100}%`,
    height: `${(box.height / panel.height) * 100}%`,
  };
}

/**
 * The draft's wireframe: the panel's own pixel geometry, drawn with the editor's Lumen
 * tokens. It renders no wall widget and reaches no Hearth.
 */
function DraftWireframe({ preview }: { preview: WallDraftPreview }) {
  return (
    <div
      role="img"
      aria-label={preview.summary}
      className="relative w-full overflow-hidden rounded-tile border border-hairline bg-canvas"
      style={{ aspectRatio: `${preview.panel.width} / ${preview.panel.height}` }}
    >
      {preview.bands.map((band) => (
        <div
          key={`zone:${band.zone}`}
          className="absolute rounded-[0.25rem] border border-dashed border-hairline bg-surface/60"
          style={boxStyle(band.box, preview.panel)}
        >
          <span className="absolute left-1 top-0.5 text-[0.625rem] font-semibold uppercase tracking-wide text-muted">
            {band.zone}
          </span>
        </div>
      ))}
      {preview.widgets.map((widget) => (
        <div
          key={widget.id}
          title={`${widget.label} (${widget.id})`}
          className="absolute flex items-center justify-center overflow-hidden rounded-[0.25rem] border border-hairline bg-surface-2 px-1 text-[0.625rem] font-medium text-muted"
          style={boxStyle(widget.box, preview.panel)}
        >
          <span className="truncate">{widget.label}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * The draft preview panel: the composition at the wall's target panel aspect ratio,
 * the fit verdict, and each device grid's page count.
 */
function DraftPreviewCard({
  preview,
  unfittable,
}: {
  preview: WallDraftPreview;
  unfittable: boolean;
}) {
  return (
    <Card>
      <Stack gap={3}>
        <Row justify="between" align="center" gap={2} wrap>
          <span className="text-sm font-semibold text-ink">Draft preview</span>
          <Badge tone={unfittable ? "danger" : "neutral"}>
            {unfittable
              ? "Does not fit the panel"
              : `${preview.panel.width} × ${preview.panel.height}`}
          </Badge>
        </Row>

        <p className={unfittable ? "text-sm text-danger" : "text-sm text-muted"}>
          {preview.summary}
          {unfittable && " Saving is blocked until the draft fits."}
        </p>

        <DraftWireframe preview={preview} />

        {preview.bands.length > 0 && (
          <p className="text-xs text-muted">
            Zones: {preview.bands.map((band) => band.zone).join(", ")}
          </p>
        )}

        {preview.grids.map((grid) => (
          <p key={grid.widgetId} className="text-xs text-muted">
            {grid.widgetId}: {grid.devices} device{grid.devices === 1 ? "" : "s"} on {grid.pages}{" "}
            page{grid.pages === 1 ? "" : "s"}
          </p>
        ))}
      </Stack>
    </Card>
  );
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

function WidgetRow({
  widget,
  onPlacement,
  onConfig,
  onZoneChange,
  onLinkTarget,
  onRemove,
}: WidgetRowProps) {
  const descriptor = getWidgetDescriptor(widget.type);
  // A titled card's height floor is a row above the type's minimum.
  const minHeight = descriptor.min.h + (widgetTitle(widget) !== null ? WALL_TITLE_ROWS : 0);

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
            min={minHeight}
            max={descriptor.max.h}
            value={widget.h}
            onChange={(value) => onPlacement({ ...widget, h: value })}
          />
        </Grid>

        <WidgetConfigFields
          widget={widget}
          onChange={onConfig}
          onZoneChange={onZoneChange}
          onLinkTarget={onLinkTarget}
        />
      </Stack>
    </Card>
  );
}
