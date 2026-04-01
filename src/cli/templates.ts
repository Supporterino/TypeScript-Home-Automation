/**
 * Automation file templates for the scaffolding command.
 */

export function toPascalCase(kebab: string): string {
  return kebab
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

interface TriggerDef {
  type: "mqtt" | "cron" | "state" | "webhook";
  topic?: string;
  expression?: string;
  key?: string;
  path?: string;
  filter?: string;
}

function renderTrigger(t: TriggerDef): string {
  switch (t.type) {
    case "mqtt": {
      const lines = [
        `      type: "mqtt",`,
        `      topic: "${t.topic ?? "zigbee2mqtt/device_name"}",`,
      ];
      if (t.filter) lines.push(`      filter: (payload) => ${t.filter},`);
      return `    {\n${lines.join("\n")}\n    }`;
    }
    case "cron":
      return `    {\n      type: "cron",\n      expression: "${t.expression ?? "0 * * * *"}",\n    }`;
    case "state": {
      const lines = [`      type: "state",`, `      key: "${t.key ?? "state_key"}",`];
      if (t.filter) lines.push(`      filter: (newValue) => ${t.filter},`);
      return `    {\n${lines.join("\n")}\n    }`;
    }
    case "webhook":
      return `    {\n      type: "webhook",\n      path: "${t.path ?? "hook"}",\n    }`;
    default:
      return `    { type: "mqtt", topic: "zigbee2mqtt/device" }`;
  }
}

export function automationTemplate(name: string, triggers: TriggerDef[]): string {
  const className = toPascalCase(name);
  const triggerType = triggers[0]?.type ?? "mqtt";
  const triggerStrings = triggers.map(renderTrigger).join(",\n");

  return `import { Automation, type Trigger, type TriggerContext } from "../core/automation.js";

export default class ${className} extends Automation {
  readonly name = "${name}";

  readonly triggers: Trigger[] = [
${triggerStrings},
  ];

  async execute(context: TriggerContext): Promise<void> {
    if (context.type !== "${triggerType}") return;

    this.logger.info("Automation triggered");
    // TODO: Add your automation logic here
  }
}
`;
}

export function aqaraH1Template(name: string, remoteName: string): string {
  const className = toPascalCase(name);
  return `import { AqaraH1Automation } from "../core/aqara-h1-automation.js";

export default class ${className} extends AqaraH1Automation {
  readonly name = "${name}";
  protected readonly remoteName = "${remoteName}";

  // Uncomment the handlers you need:

  // protected async onSingleLeft(): Promise<void> {}
  // protected async onDoubleLeft(): Promise<void> {}
  // protected async onTripleLeft(): Promise<void> {}
  // protected async onHoldLeft(): Promise<void> {}
  // protected async onSingleRight(): Promise<void> {}
  // protected async onDoubleRight(): Promise<void> {}
  // protected async onTripleRight(): Promise<void> {}
  // protected async onHoldRight(): Promise<void> {}
  // protected async onSingleBoth(): Promise<void> {}
  // protected async onDoubleBoth(): Promise<void> {}
  // protected async onTripleBoth(): Promise<void> {}
  // protected async onHoldBoth(): Promise<void> {}
}
`;
}

export function styrbarTemplate(name: string, remoteName: string): string {
  const className = toPascalCase(name);
  return `import { IkeaStyrbarAutomation } from "../core/ikea-styrbar-automation.js";

export default class ${className} extends IkeaStyrbarAutomation {
  readonly name = "${name}";
  protected readonly remoteName = "${remoteName}";

  // Uncomment the handlers you need:

  // protected async onOn(): Promise<void> {}
  // protected async onOff(): Promise<void> {}
  // protected async onBrightnessMoveUp(): Promise<void> {}
  // protected async onBrightnessMoveDown(): Promise<void> {}
  // protected async onBrightnessStop(): Promise<void> {}
  // protected async onArrowLeftClick(): Promise<void> {}
  // protected async onArrowLeftHold(): Promise<void> {}
  // protected async onArrowLeftRelease(): Promise<void> {}
  // protected async onArrowRightClick(): Promise<void> {}
  // protected async onArrowRightHold(): Promise<void> {}
  // protected async onArrowRightRelease(): Promise<void> {}
}
`;
}

export function rodretTemplate(name: string, remoteName: string): string {
  const className = toPascalCase(name);
  return `import { IkeaRodretAutomation } from "../core/ikea-rodret-automation.js";

export default class ${className} extends IkeaRodretAutomation {
  readonly name = "${name}";
  protected readonly remoteName = "${remoteName}";

  // Uncomment the handlers you need:

  // protected async onOn(): Promise<void> {}
  // protected async onOff(): Promise<void> {}
  // protected async onBrightnessMoveUp(): Promise<void> {}
  // protected async onBrightnessMoveDown(): Promise<void> {}
  // protected async onBrightnessStop(): Promise<void> {}
}
`;
}

export function motionLightTemplate(
  name: string,
  sensorName: string,
  lightName: string,
  luxThreshold: number,
): string {
  const className = toPascalCase(name);
  return `import { Automation, type Trigger, type TriggerContext } from "../core/automation.js";
import type { OccupancyPayload } from "../types/zigbee.js";

export default class ${className} extends Automation {
  readonly name = "${name}";

  private readonly SENSOR_NAME = "${sensorName}";
  private readonly LIGHT_NAME = "${lightName}";
  /** Only trigger when illuminance is below this value (lux). */
  private readonly LUX_THRESHOLD = ${luxThreshold};
  private readonly LIGHT_DURATION_MS = 5 * 60 * 1000; // 5 minutes

  private turnOffTimer: ReturnType<typeof setTimeout> | null = null;

  readonly triggers: Trigger[] = [
    {
      type: "mqtt",
      topic: \`zigbee2mqtt/\${this.SENSOR_NAME}\`,
      filter: (payload) =>
        (payload as unknown as OccupancyPayload).occupancy === true,
    },
  ];

  async execute(context: TriggerContext): Promise<void> {
    if (context.type !== "mqtt") return;

    const payload = context.payload as unknown as OccupancyPayload;
    const lux = payload.illuminance_lux ?? payload.illuminance ?? 0;

    // Only activate when sensor lux is below threshold (room is dark enough)
    if (lux >= this.LUX_THRESHOLD) {
      this.logger.debug({ lux, threshold: this.LUX_THRESHOLD }, "Too bright, ignoring motion");
      return;
    }

    this.logger.info("Motion detected, turning on light");
    this.mqtt.publishToDevice(this.LIGHT_NAME, {
      state: "ON",
      brightness: 254,
      transition: 1,
    });

    if (this.turnOffTimer) clearTimeout(this.turnOffTimer);
    this.turnOffTimer = setTimeout(() => {
      this.logger.info("No recent motion, turning off light");
      this.mqtt.publishToDevice(this.LIGHT_NAME, { state: "OFF" });
      this.turnOffTimer = null;
    }, this.LIGHT_DURATION_MS);
  }

  async onStop(): Promise<void> {
    if (this.turnOffTimer) {
      clearTimeout(this.turnOffTimer);
      this.turnOffTimer = null;
    }
  }
}
`;
}
