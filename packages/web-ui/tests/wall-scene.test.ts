import { describe, expect, it } from "bun:test";
import type { Automation } from "@ts-ha/shared";
import {
  DEFAULT_MANUAL_TRIGGER_TYPE,
  sceneTriggerRequest,
} from "../src/app/wall/widgets/scene-model.js";

// Pure trigger-request building for the wall scene button — no DOM. The request
// falls back to a valid default type when the automation is unknown.

function automation(name: string, type: Automation["triggers"][number]["type"]): Automation {
  return { name, enabled: true, triggers: [{ type }] };
}

describe("sceneTriggerRequest", () => {
  it("uses the bound automation's first declared trigger type", () => {
    const automations = [automation("good-night", "mqtt"), automation("morning", "cron")];

    expect(sceneTriggerRequest("morning", automations)).toEqual({
      name: "morning",
      type: "cron",
    });
  });

  it("carries the requested automation name through unchanged", () => {
    expect(sceneTriggerRequest("movie-time", []).name).toBe("movie-time");
  });

  it("falls back to a valid default for an unknown automation", () => {
    expect(sceneTriggerRequest("deleted", [automation("good-night", "mqtt")]).type).toBe(
      DEFAULT_MANUAL_TRIGGER_TYPE,
    );
  });

  it("falls back to the default when the automation declares no triggers", () => {
    const empty: Automation = { name: "empty", enabled: true, triggers: [] };
    expect(sceneTriggerRequest("empty", [empty]).type).toBe(DEFAULT_MANUAL_TRIGGER_TYPE);
  });

  it("uses a valid trigger type for a request the endpoint accepts", () => {
    const valid = ["mqtt", "cron", "state", "webhook"];
    expect(valid).toContain(DEFAULT_MANUAL_TRIGGER_TYPE);
  });
});
