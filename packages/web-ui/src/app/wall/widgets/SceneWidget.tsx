/**
 * The wall scene-button widget (design.md D13; specs/wall-display "Scene
 * Buttons Trigger Automations"). A configurable label triggers an existing
 * automation through the same manual-trigger path the admin interface uses —
 * no scene subsystem.
 *
 * The button is a full-bleed pressable tile — a large icon over the label,
 * centered in the widget's surface — with an explicit pressed/active state and
 * a busy state while triggering. Both states are token-driven and change only
 * paint (background, elevation, opacity), never geometry, so the tile does not
 * shift while it is operated. A trigger failure is caught and surfaced on the
 * tile itself, so a broken or deleted automation never takes down the profile.
 */
import { Play } from "lucide-react";
import { useState } from "react";
import { manualTriggerContext, triggerAutomation } from "../../api.js";
import { useDataStore } from "../../lib/data-store.js";
import { Spinner } from "../../ui/index.js";
import type { WallWidgetProps } from "../registry.js";
import { wallTileMetrics } from "../scale.js";
import { WALL_BODY_FONT_SIZE } from "../type-ramp.js";
import { sceneTriggerRequest } from "./scene-model.js";

/** The tile's icon side, in CSS pixels — large enough to read across a room. */
const SCENE_ICON_SIZE = 48;

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
      <p className="text-muted" style={{ fontSize: WALL_BODY_FONT_SIZE }}>
        No automation configured.
      </p>
    );
  }

  return (
    <div className="relative flex h-full w-full">
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
        className="flex h-full w-full cursor-pointer flex-col items-center justify-center gap-3 rounded-tile p-3 text-ink motion-toggle disabled:cursor-progress"
        style={{
          minHeight: minTouchTarget,
          background: pressed ? "var(--surface-2)" : "transparent",
          boxShadow: pressed ? "var(--e2)" : "var(--e1)",
        }}
      >
        <span
          className="relative flex items-center justify-center"
          style={{ width: minTouchTarget, height: minTouchTarget }}
        >
          <Play size={SCENE_ICON_SIZE} aria-hidden style={{ opacity: busy ? 0 : 1 }} />
          {busy && <Spinner size={SCENE_ICON_SIZE} label="" className="absolute" />}
        </span>
        <span
          className="font-semibold"
          style={{ fontSize: WALL_BODY_FONT_SIZE, opacity: busy ? 0.6 : 1 }}
        >
          {label}
        </span>
      </button>
      {error && (
        <p
          role="alert"
          className="absolute inset-x-0 bottom-0 text-center text-danger"
          style={{ fontSize: WALL_BODY_FONT_SIZE }}
        >
          {error}
        </p>
      )}
    </div>
  );
}
