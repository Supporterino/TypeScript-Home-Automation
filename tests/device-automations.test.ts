import { beforeEach, describe, expect, it, mock } from "bun:test";
import pino from "pino";
import type { Config } from "../src/config.js";
import { AqaraH1Automation } from "../src/core/aqara-h1-automation.js";
import type { HttpClient } from "../src/core/http-client.js";
import { IkeaRodretAutomation } from "../src/core/ikea-rodret-automation.js";
import { IkeaStyrbarAutomation } from "../src/core/ikea-styrbar-automation.js";
import type { MqttService } from "../src/core/mqtt-service.js";
import type { ShellyService } from "../src/core/shelly-service.js";
import type { StateManager } from "../src/core/state-manager.js";

const logger = pino({ level: "silent" });

const config: Config = {
  mqtt: { host: "localhost", port: 1883 },
  zigbee2mqttPrefix: "zigbee2mqtt",
  logLevel: "info",
  automations: { recursive: false },
  state: { persist: false, filePath: "./state.json" },
  httpServer: { port: 0, token: "" },
};

function injectMocks(auto: { _inject: AqaraH1Automation["_inject"] }) {
  auto._inject(
    {} as MqttService,
    {} as ShellyService,
    {} as HttpClient,
    {} as StateManager,
    logger,
    config,
    null,
  );
}

// ---------------------------------------------------------------------------
// Aqara H1
// ---------------------------------------------------------------------------

class TestAqaraH1 extends AqaraH1Automation {
  readonly name = "test-h1";
  protected readonly remoteName = "test_remote";

  readonly onSingleLeftMock = mock(() => Promise.resolve());
  readonly onDoubleLeftMock = mock(() => Promise.resolve());
  readonly onTripleLeftMock = mock(() => Promise.resolve());
  readonly onHoldLeftMock = mock(() => Promise.resolve());
  readonly onSingleRightMock = mock(() => Promise.resolve());
  readonly onDoubleRightMock = mock(() => Promise.resolve());
  readonly onTripleRightMock = mock(() => Promise.resolve());
  readonly onHoldRightMock = mock(() => Promise.resolve());
  readonly onSingleBothMock = mock(() => Promise.resolve());
  readonly onDoubleBothMock = mock(() => Promise.resolve());
  readonly onTripleBothMock = mock(() => Promise.resolve());
  readonly onHoldBothMock = mock(() => Promise.resolve());

  protected async onSingleLeft() {
    this.onSingleLeftMock();
  }
  protected async onDoubleLeft() {
    this.onDoubleLeftMock();
  }
  protected async onTripleLeft() {
    this.onTripleLeftMock();
  }
  protected async onHoldLeft() {
    this.onHoldLeftMock();
  }
  protected async onSingleRight() {
    this.onSingleRightMock();
  }
  protected async onDoubleRight() {
    this.onDoubleRightMock();
  }
  protected async onTripleRight() {
    this.onTripleRightMock();
  }
  protected async onHoldRight() {
    this.onHoldRightMock();
  }
  protected async onSingleBoth() {
    this.onSingleBothMock();
  }
  protected async onDoubleBoth() {
    this.onDoubleBothMock();
  }
  protected async onTripleBoth() {
    this.onTripleBothMock();
  }
  protected async onHoldBoth() {
    this.onHoldBothMock();
  }
}

describe("AqaraH1Automation", () => {
  let auto: TestAqaraH1;

  beforeEach(() => {
    auto = new TestAqaraH1();
    injectMocks(auto);
  });

  describe("triggers", () => {
    it("returns mqtt trigger for remoteName", () => {
      const triggers = auto.triggers;
      expect(triggers).toHaveLength(1);
      expect(triggers[0].type).toBe("mqtt");
      expect((triggers[0] as { topic: string }).topic).toBe("zigbee2mqtt/test_remote");
    });

    it("filter rejects payload without action", () => {
      const filter = (auto.triggers[0] as { filter: (p: Record<string, unknown>) => boolean })
        .filter;
      expect(filter({ occupancy: true })).toBe(false);
    });

    it("filter accepts payload with action", () => {
      const filter = (auto.triggers[0] as { filter: (p: Record<string, unknown>) => boolean })
        .filter;
      expect(filter({ action: "single_left" })).toBe(true);
    });
  });

  describe("execute", () => {
    it("ignores non-mqtt context", async () => {
      await auto.execute({ type: "cron", expression: "* * * * *", firedAt: new Date() });
      expect(auto.onSingleLeftMock).not.toHaveBeenCalled();
    });

    const actionMap: [string, string][] = [
      ["single_left", "onSingleLeftMock"],
      ["double_left", "onDoubleLeftMock"],
      ["triple_left", "onTripleLeftMock"],
      ["hold_left", "onHoldLeftMock"],
      ["single_right", "onSingleRightMock"],
      ["double_right", "onDoubleRightMock"],
      ["triple_right", "onTripleRightMock"],
      ["hold_right", "onHoldRightMock"],
      ["single_both", "onSingleBothMock"],
      ["double_both", "onDoubleBothMock"],
      ["triple_both", "onTripleBothMock"],
      ["hold_both", "onHoldBothMock"],
    ];

    for (const [action, mockName] of actionMap) {
      it(`dispatches ${action} to ${mockName.replace("Mock", "")}`, async () => {
        await auto.execute({
          type: "mqtt",
          topic: "zigbee2mqtt/test_remote",
          payload: { action },
        });
        expect(
          (auto as unknown as Record<string, ReturnType<typeof mock>>)[mockName],
        ).toHaveBeenCalledTimes(1);
      });
    }

    it("handles unknown action without throwing", async () => {
      await auto.execute({
        type: "mqtt",
        topic: "zigbee2mqtt/test_remote",
        payload: { action: "unknown_action" },
      });
      // No mock should have been called
      for (const [, mockName] of actionMap) {
        expect(
          (auto as unknown as Record<string, ReturnType<typeof mock>>)[mockName],
        ).not.toHaveBeenCalled();
      }
    });
  });
});

// ---------------------------------------------------------------------------
// IKEA STYRBAR
// ---------------------------------------------------------------------------

class TestStyrbar extends IkeaStyrbarAutomation {
  readonly name = "test-styrbar";
  protected readonly remoteName = "test_styrbar";

  readonly onOnMock = mock(() => Promise.resolve());
  readonly onOffMock = mock(() => Promise.resolve());
  readonly onBrightnessMoveUpMock = mock(() => Promise.resolve());
  readonly onBrightnessMoveDownMock = mock(() => Promise.resolve());
  readonly onBrightnessStopMock = mock(() => Promise.resolve());
  readonly onArrowLeftClickMock = mock(() => Promise.resolve());
  readonly onArrowLeftHoldMock = mock(() => Promise.resolve());
  readonly onArrowLeftReleaseMock = mock(() => Promise.resolve());
  readonly onArrowRightClickMock = mock(() => Promise.resolve());
  readonly onArrowRightHoldMock = mock(() => Promise.resolve());
  readonly onArrowRightReleaseMock = mock(() => Promise.resolve());

  protected async onOn() {
    this.onOnMock();
  }
  protected async onOff() {
    this.onOffMock();
  }
  protected async onBrightnessMoveUp() {
    this.onBrightnessMoveUpMock();
  }
  protected async onBrightnessMoveDown() {
    this.onBrightnessMoveDownMock();
  }
  protected async onBrightnessStop() {
    this.onBrightnessStopMock();
  }
  protected async onArrowLeftClick() {
    this.onArrowLeftClickMock();
  }
  protected async onArrowLeftHold() {
    this.onArrowLeftHoldMock();
  }
  protected async onArrowLeftRelease() {
    this.onArrowLeftReleaseMock();
  }
  protected async onArrowRightClick() {
    this.onArrowRightClickMock();
  }
  protected async onArrowRightHold() {
    this.onArrowRightHoldMock();
  }
  protected async onArrowRightRelease() {
    this.onArrowRightReleaseMock();
  }
}

describe("IkeaStyrbarAutomation", () => {
  let auto: TestStyrbar;

  beforeEach(() => {
    auto = new TestStyrbar();
    injectMocks(auto);
  });

  it("triggers getter returns mqtt trigger for remoteName", () => {
    expect(auto.triggers[0].type).toBe("mqtt");
    expect((auto.triggers[0] as { topic: string }).topic).toBe("zigbee2mqtt/test_styrbar");
  });

  it("ignores non-mqtt context", async () => {
    await auto.execute({ type: "cron", expression: "* * * * *", firedAt: new Date() });
    expect(auto.onOnMock).not.toHaveBeenCalled();
  });

  const styrbarActions: [string, string][] = [
    ["on", "onOnMock"],
    ["off", "onOffMock"],
    ["brightness_move_up", "onBrightnessMoveUpMock"],
    ["brightness_move_down", "onBrightnessMoveDownMock"],
    ["brightness_stop", "onBrightnessStopMock"],
    ["arrow_left_click", "onArrowLeftClickMock"],
    ["arrow_left_hold", "onArrowLeftHoldMock"],
    ["arrow_left_release", "onArrowLeftReleaseMock"],
    ["arrow_right_click", "onArrowRightClickMock"],
    ["arrow_right_hold", "onArrowRightHoldMock"],
    ["arrow_right_release", "onArrowRightReleaseMock"],
  ];

  for (const [action, mockName] of styrbarActions) {
    it(`dispatches ${action} to ${mockName.replace("Mock", "")}`, async () => {
      await auto.execute({
        type: "mqtt",
        topic: "zigbee2mqtt/test_styrbar",
        payload: { action },
      });
      expect(
        (auto as unknown as Record<string, ReturnType<typeof mock>>)[mockName],
      ).toHaveBeenCalledTimes(1);
    });
  }

  it("handles unknown action without throwing", async () => {
    await auto.execute({
      type: "mqtt",
      topic: "zigbee2mqtt/test_styrbar",
      payload: { action: "nonexistent" },
    });
  });
});

// ---------------------------------------------------------------------------
// IKEA RODRET
// ---------------------------------------------------------------------------

class TestRodret extends IkeaRodretAutomation {
  readonly name = "test-rodret";
  protected readonly remoteName = "test_rodret";

  readonly onOnMock = mock(() => Promise.resolve());
  readonly onOffMock = mock(() => Promise.resolve());
  readonly onBrightnessMoveUpMock = mock(() => Promise.resolve());
  readonly onBrightnessMoveDownMock = mock(() => Promise.resolve());
  readonly onBrightnessStopMock = mock(() => Promise.resolve());

  protected async onOn() {
    this.onOnMock();
  }
  protected async onOff() {
    this.onOffMock();
  }
  protected async onBrightnessMoveUp() {
    this.onBrightnessMoveUpMock();
  }
  protected async onBrightnessMoveDown() {
    this.onBrightnessMoveDownMock();
  }
  protected async onBrightnessStop() {
    this.onBrightnessStopMock();
  }
}

describe("IkeaRodretAutomation", () => {
  let auto: TestRodret;

  beforeEach(() => {
    auto = new TestRodret();
    injectMocks(auto);
  });

  it("triggers getter returns mqtt trigger for remoteName", () => {
    expect(auto.triggers[0].type).toBe("mqtt");
    expect((auto.triggers[0] as { topic: string }).topic).toBe("zigbee2mqtt/test_rodret");
  });

  it("ignores non-mqtt context", async () => {
    await auto.execute({ type: "cron", expression: "* * * * *", firedAt: new Date() });
    expect(auto.onOnMock).not.toHaveBeenCalled();
  });

  const rodretActions: [string, string][] = [
    ["on", "onOnMock"],
    ["off", "onOffMock"],
    ["brightness_move_up", "onBrightnessMoveUpMock"],
    ["brightness_move_down", "onBrightnessMoveDownMock"],
    ["brightness_stop", "onBrightnessStopMock"],
  ];

  for (const [action, mockName] of rodretActions) {
    it(`dispatches ${action} to ${mockName.replace("Mock", "")}`, async () => {
      await auto.execute({
        type: "mqtt",
        topic: "zigbee2mqtt/test_rodret",
        payload: { action },
      });
      expect(
        (auto as unknown as Record<string, ReturnType<typeof mock>>)[mockName],
      ).toHaveBeenCalledTimes(1);
    });
  }

  it("handles unknown action without throwing", async () => {
    await auto.execute({
      type: "mqtt",
      topic: "zigbee2mqtt/test_rodret",
      payload: { action: "nonexistent" },
    });
  });
});
