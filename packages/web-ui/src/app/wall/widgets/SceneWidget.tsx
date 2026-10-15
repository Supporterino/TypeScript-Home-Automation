/**
 * The wall scene-button widget (design.md D11, D14; wall-zones-and-fit D3, D4;
 * specs/wall-display "Scene Buttons Trigger Automations", "Span-Aware Card
 * Presentation"). A configurable label triggers an existing automation through
 * the same manual-trigger path the admin interface uses — no scene subsystem.
 *
 * Redesigned from the centred Play glyph into a Hearth scene tile on the wall's
 * single card vocabulary (design.md W1): the tile's own button is the vocabulary's
 * labelled control — the ported control height and radius, the label drawn through
 * {@link WallCardLabel} at the ported primary size (specs/wall-display "A control
 * is the ported control", "Touch Operation") — carrying a leading scene glyph
 * beside the label, the whole tile as the trigger affordance. Only on a card with
 * room — a span above the type's own minimum *and* a box the frame actually gives
 * it that holds the scene's own
 * stacked budget — does the tile centre a larger glyph over the label instead, so
 * a scene card composes for the space it has rather than for the light card's
 * budget: a wide, short cell keeps the row and cannot clip, and a genuinely large
 * card composes differently from the minimum (D3). A card the frame cannot give
 * the box its minimum span needs never reaches this tile at all — the frame
 * explains it (specs/wall-display "Panel Fit").
 * The pressed/active and busy states and the error surface are identical in both
 * compositions. Both states are token-driven and change only paint (background,
 * elevation, opacity), never geometry, so the tile does not shift while it is
 * operated. A trigger failure is caught and surfaced on the tile itself, so a
 * broken or deleted automation never takes down the profile.
 */
import { Play } from "lucide-react";
import { useState } from "react";
import { manualTriggerContext, triggerAutomation } from "../../api.js";
import { useDataStore } from "../../lib/data-store.js";
import { Spinner } from "../../ui/index.js";
import { WallCardLabel } from "../cards/card-anatomy.js";
import { WALL_CARD_GLYPH_SIZE, WALL_CARD_METRICS } from "../cards/metrics.js";
import type { WallWidgetProps } from "../registry.js";
import { wallTileMetrics } from "../scale.js";
import { WALL_LABEL_FONT_SIZE } from "../type-ramp.js";
import {
  SCENE_LARGE_GLYPH_PX,
  SCENE_LARGE_GLYPH_SIZE,
  sceneTileLayout,
  sceneTriggerRequest,
} from "./scene-model.js";

/** The scene glyph's icon side, in CSS pixels — large enough to read across a room. */
const SCENE_GLYPH_SIZE = WALL_CARD_GLYPH_SIZE;

export function SceneWidget({ widget, rendererHeightPx }: WallWidgetProps) {
  const { automations } = useDataStore();
  const automationName =
    typeof widget.config.automation === "string" ? widget.config.automation : "";
  const configuredLabel = typeof widget.config.label === "string" ? widget.config.label : "";
  const label = configuredLabel || automationName || "Scene";

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pressed, setPressed] = useState(false);

  const minTouchTarget = wallTileMetrics("wall").control;
  // The box the frame gave the renderer, and the span the widget was placed at,
  // decide the composition — the glyph beside the label, or centred above it on a
  // card with room for the taller composition. The budgets and the minimum span
  // are the scene's own (see `scene-model.ts`), so the tile composes for the space
  // it has rather than for the wall light card's much larger full form. The states
  // below are shared by both.
  const layout = sceneTileLayout({ rendererHeightPx, placement: widget });
  const stacked = layout === "column";
  const glyphSide = stacked ? SCENE_LARGE_GLYPH_PX : minTouchTarget;

  async function handleTrigger() {
    setBusy(true);
    setError(null);
    try {
      const request = sceneTriggerRequest(automationName, automations);
      await triggerAutomation(request.name, manualTriggerContext(request.type));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not trigger this automation");
    } finally {
      setBusy(false);
    }
  }

  if (!automationName) {
    return (
      <p style={{ margin: 0, color: "var(--hearth-text-muted)", fontSize: WALL_LABEL_FONT_SIZE }}>
        No automation configured.
      </p>
    );
  }

  return (
    <div style={{ position: "relative", display: "flex", height: "100%", width: "100%" }}>
      <button
        type="button"
        data-pressed={pressed ? "" : undefined}
        data-busy={busy ? "" : undefined}
        data-layout={layout}
        aria-label={label}
        aria-busy={busy}
        disabled={busy}
        onClick={() => void handleTrigger()}
        onPointerDown={() => setPressed(true)}
        onPointerUp={() => setPressed(false)}
        onPointerLeave={() => setPressed(false)}
        onBlur={() => setPressed(false)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") setPressed(true);
        }}
        onKeyUp={() => setPressed(false)}
        style={{
          display: "flex",
          height: "100%",
          width: "100%",
          minHeight: WALL_CARD_METRICS.controlHeight,
          cursor: busy ? "progress" : "pointer",
          flexDirection: stacked ? "column" : "row",
          alignItems: "center",
          justifyContent: stacked ? "center" : "flex-start",
          gap: stacked ? "var(--hearth-space-2)" : "var(--hearth-space-3)",
          borderRadius: WALL_CARD_METRICS.controlRadius,
          padding: "var(--hearth-space-3)",
          textAlign: stacked ? "center" : "left",
          color: "var(--hearth-text)",
          background: pressed ? "var(--hearth-surface-raised)" : "transparent",
          boxShadow: pressed ? "var(--hearth-e2)" : "var(--hearth-e1)",
        }}
      >
        <span
          style={{
            position: "relative",
            display: "flex",
            flex: "none",
            alignItems: "center",
            justifyContent: "center",
            width: glyphSide,
            height: glyphSide,
            borderRadius: "var(--hearth-radius-sm)",
            background: "var(--hearth-surface-raised)",
          }}
        >
          <Play
            size={stacked ? SCENE_LARGE_GLYPH_SIZE : SCENE_GLYPH_SIZE}
            aria-hidden
            style={{ opacity: busy ? 0 : 1 }}
          />
          {busy && (
            <Spinner
              size={stacked ? SCENE_LARGE_GLYPH_SIZE : SCENE_GLYPH_SIZE}
              label=""
              className="absolute"
            />
          )}
        </span>
        <WallCardLabel>{label}</WallCardLabel>
      </button>
      {error && (
        <p
          role="alert"
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            margin: 0,
            textAlign: "center",
            color: "var(--hearth-danger)",
            fontSize: WALL_LABEL_FONT_SIZE,
          }}
        >
          {error}
        </p>
      )}
    </div>
  );
}
