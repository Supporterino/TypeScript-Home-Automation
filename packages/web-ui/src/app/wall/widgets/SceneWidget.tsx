/**
 * The wall scene-button widget (design.md D11, D14; specs/wall-display "Scene
 * Buttons Trigger Automations"). A configurable label triggers an existing
 * automation through the same manual-trigger path the admin interface uses —
 * no scene subsystem.
 *
 * Redesigned from the centred Play glyph into a Hearth scene tile on the shared
 * card vocabulary: a leading scene glyph beside the label, the whole tile as
 * the trigger affordance. It keeps an explicit pressed/active state and a busy
 * state while triggering. Both states are token-driven and change only paint
 * (background, elevation, opacity), never geometry, so the tile does not shift
 * while it is operated. A trigger failure is caught and surfaced on the tile
 * itself, so a broken or deleted automation never takes down the profile.
 */
import { Play } from "lucide-react";
import { useState } from "react";
import { manualTriggerContext, triggerAutomation } from "../../api.js";
import { useDataStore } from "../../lib/data-store.js";
import { Spinner } from "../../ui/index.js";
import type { WallWidgetProps } from "../registry.js";
import { wallTileMetrics } from "../scale.js";
import { WALL_LABEL_FONT_SIZE } from "../type-ramp.js";
import { WALL_CARD_GLYPH_SIZE, WallCardLabel } from "./card-vocab.js";
import { sceneTriggerRequest } from "./scene-model.js";

/** The scene glyph's icon side, in CSS pixels — large enough to read across a room. */
const SCENE_GLYPH_SIZE = WALL_CARD_GLYPH_SIZE;

export function SceneWidget({ widget }: WallWidgetProps) {
  const { automations } = useDataStore();
  const automationName =
    typeof widget.config.automation === "string" ? widget.config.automation : "";
  const configuredLabel = typeof widget.config.label === "string" ? widget.config.label : "";
  const label = configuredLabel || automationName || "Scene";

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pressed, setPressed] = useState(false);

  const minTouchTarget = wallTileMetrics("wall").control;

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
          minHeight: minTouchTarget,
          cursor: busy ? "progress" : "pointer",
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "flex-start",
          gap: "var(--hearth-space-3)",
          borderRadius: "var(--hearth-radius-md)",
          padding: "var(--hearth-space-3)",
          textAlign: "left",
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
            width: minTouchTarget,
            height: minTouchTarget,
            borderRadius: "var(--hearth-radius-sm)",
            background: "var(--hearth-surface-raised)",
          }}
        >
          <Play size={SCENE_GLYPH_SIZE} aria-hidden style={{ opacity: busy ? 0 : 1 }} />
          {busy && <Spinner size={SCENE_GLYPH_SIZE} label="" className="absolute" />}
        </span>
        <WallCardLabel color="var(--hearth-text)">{label}</WallCardLabel>
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
