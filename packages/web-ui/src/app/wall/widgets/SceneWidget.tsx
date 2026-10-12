/**
 * The wall scene-button widget (design.md D8; specs/wall-display "Scene
 * Buttons Trigger Automations"). A configurable label triggers an existing
 * automation through the same manual-trigger path the admin interface uses —
 * no scene subsystem.
 *
 * A trigger failure is caught and surfaced on the button itself, so a broken
 * or deleted automation never takes down the profile.
 */
import { Button, Stack, Text } from "@mantine/core";
import { useState } from "react";
import { manualTriggerContext, triggerAutomation } from "../../api.js";
import { useDataStore } from "../../lib/data-store.js";
import type { WallWidgetProps } from "../registry.js";
import { WALL_BODY_FONT_SIZE } from "../type-ramp.js";
import { sceneTriggerRequest } from "./scene-model.js";

export function SceneWidget({ widget }: WallWidgetProps) {
  const { automations } = useDataStore();
  const automationName =
    typeof widget.config.automation === "string" ? widget.config.automation : "";
  const configuredLabel = typeof widget.config.label === "string" ? widget.config.label : "";
  const label = configuredLabel || automationName || "Scene";

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      <Text fz={WALL_BODY_FONT_SIZE} c="dimmed">
        No automation configured.
      </Text>
    );
  }

  return (
    <Stack h="100%" justify="center" gap="xs">
      <Button
        size="lg"
        fullWidth
        color={error ? "red" : undefined}
        loading={busy}
        onClick={() => void handleTrigger()}
      >
        {label}
      </Button>
      {error && (
        <Text fz={WALL_BODY_FONT_SIZE} c="red">
          {error}
        </Text>
      )}
    </Stack>
  );
}
