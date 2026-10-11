/**
 * Pure trigger-request builder for the wall scene-button widget (design.md D8;
 * specs/wall-display "Scene Buttons Trigger Automations").
 *
 * A scene button stores an automation name and reuses the existing manual
 * trigger path; no scene model is introduced. The bound automation's first
 * declared trigger type is used so the request matches how the admin
 * interface triggers it, falling back to a valid default when the automation
 * is unknown (not yet loaded, or deleted) so the request body is never the
 * `400`-inducing unknown type. DOM-free and testable.
 */
import type { Automation, TriggerContext } from "../../types.js";

/** The trigger type used when the bound automation's own type cannot be resolved. */
export const DEFAULT_MANUAL_TRIGGER_TYPE: TriggerContext["type"] = "cron";

export interface SceneTriggerRequest {
  /** The automation to trigger. */
  name: string;
  /** The manual trigger type resolved from the bound automation, or the default. */
  type: TriggerContext["type"];
}

/** Resolves the manual-trigger request a scene button issues. */
export function sceneTriggerRequest(
  automationName: string,
  automations: readonly Automation[],
): SceneTriggerRequest {
  const automation = automations.find((candidate) => candidate.name === automationName);
  return {
    name: automationName,
    type: automation?.triggers[0]?.type ?? DEFAULT_MANUAL_TRIGGER_TYPE,
  };
}
