import { describe, expect, it } from "bun:test";
import {
  aqaraH1Template,
  automationTemplate,
  motionLightTemplate,
  rodretTemplate,
  styrbarTemplate,
  toPascalCase,
} from "../src/cli/templates.js";

describe("toPascalCase", () => {
  it("converts simple kebab-case", () => {
    expect(toPascalCase("my-automation")).toBe("MyAutomation");
  });

  it("converts single word", () => {
    expect(toPascalCase("hello")).toBe("Hello");
  });

  it("converts multi-segment", () => {
    expect(toPascalCase("motion-light-schedule")).toBe("MotionLightSchedule");
  });
});

describe("automationTemplate", () => {
  it("generates valid class with mqtt trigger", () => {
    const result = automationTemplate("door-alert", [{ type: "mqtt", topic: "zigbee2mqtt/door" }]);

    expect(result).toContain("class DoorAlert extends Automation");
    expect(result).toContain('name = "door-alert"');
    expect(result).toContain('type: "mqtt"');
    expect(result).toContain('topic: "zigbee2mqtt/door"');
    expect(result).toContain('context.type !== "mqtt"');
  });

  it("includes filter when provided", () => {
    const result = automationTemplate("test", [
      { type: "mqtt", topic: "z2m/s", filter: "payload.occupancy === true" },
    ]);

    expect(result).toContain("filter: (payload) => payload.occupancy === true");
  });

  it("generates cron trigger", () => {
    const result = automationTemplate("report", [{ type: "cron", expression: "0 8 * * *" }]);

    expect(result).toContain('type: "cron"');
    expect(result).toContain('expression: "0 8 * * *"');
    expect(result).toContain('context.type !== "cron"');
  });

  it("generates state trigger with filter", () => {
    const result = automationTemplate("react", [
      { type: "state", key: "night_mode", filter: "newValue === true" },
    ]);

    expect(result).toContain('type: "state"');
    expect(result).toContain('key: "night_mode"');
    expect(result).toContain("filter: (newValue) => newValue === true");
  });

  it("generates webhook trigger", () => {
    const result = automationTemplate("hook", [{ type: "webhook", path: "deploy" }]);

    expect(result).toContain('type: "webhook"');
    expect(result).toContain('path: "deploy"');
  });

  it("includes import statement", () => {
    const result = automationTemplate("test", [{ type: "mqtt", topic: "t" }]);
    expect(result).toContain('from "../core/automation.js"');
  });

  it("exports class as default", () => {
    const result = automationTemplate("test", [{ type: "mqtt", topic: "t" }]);
    expect(result).toContain("export default class");
  });
});

describe("aqaraH1Template", () => {
  it("generates class extending AqaraH1Automation", () => {
    const result = aqaraH1Template("bedroom-remote", "bedroom_aqara");
    expect(result).toContain("class BedroomRemote extends AqaraH1Automation");
    expect(result).toContain('remoteName = "bedroom_aqara"');
    expect(result).toContain("onSingleLeft");
    expect(result).toContain("onHoldBoth");
  });
});

describe("styrbarTemplate", () => {
  it("generates class extending IkeaStyrbarAutomation", () => {
    const result = styrbarTemplate("living-remote", "living_styrbar");
    expect(result).toContain("class LivingRemote extends IkeaStyrbarAutomation");
    expect(result).toContain('remoteName = "living_styrbar"');
    expect(result).toContain("onArrowLeftClick");
    expect(result).toContain("onBrightnessStop");
  });
});

describe("rodretTemplate", () => {
  it("generates class extending IkeaRodretAutomation", () => {
    const result = rodretTemplate("kitchen-dimmer", "kitchen_rodret");
    expect(result).toContain("class KitchenDimmer extends IkeaRodretAutomation");
    expect(result).toContain('remoteName = "kitchen_rodret"');
    expect(result).toContain("onOn");
    expect(result).toContain("onBrightnessMoveDown");
  });
});

describe("motionLightTemplate", () => {
  it("generates motion light automation with config", () => {
    const result = motionLightTemplate("hallway-light", "hallway_sensor", "hallway_lamp", 25);
    expect(result).toContain("class HallwayLight extends Automation");
    expect(result).toContain('SENSOR_NAME = "hallway_sensor"');
    expect(result).toContain('LIGHT_NAME = "hallway_lamp"');
    expect(result).toContain("LUX_THRESHOLD = 25");
    expect(result).toContain("OccupancyPayload");
    expect(result).toContain("lux >= this.LUX_THRESHOLD");
  });

  it("includes timer cleanup in onStop", () => {
    const result = motionLightTemplate("t", "s", "l", 30);
    expect(result).toContain("onStop");
    expect(result).toContain("clearTimeout");
  });
});
