import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import {
  aqaraH1Template,
  automationTemplate,
  motionLightTemplate,
  rodretTemplate,
  styrbarTemplate,
} from "../templates.js";

const VALID_TYPES = ["automation", "aqara-h1", "styrbar", "rodret", "motion-light"];
const TRIGGER_TYPES = ["mqtt", "cron", "state", "webhook"] as const;

interface NewFlags {
  trigger?: string;
  topic?: string;
  expression?: string;
  key?: string;
  path?: string;
  filter?: string;
  remote?: string;
  sensor?: string;
  light?: string;
  lux?: string;
  force?: boolean;
}

function isKebabCase(name: string): boolean {
  return /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(name);
}

async function prompt(
  rl: ReturnType<typeof createInterface>,
  question: string,
  flagValue?: string,
): Promise<string> {
  if (flagValue !== undefined) return flagValue;
  return rl.question(`  ${question}: `);
}

async function promptChoice(
  rl: ReturnType<typeof createInterface>,
  question: string,
  choices: readonly string[],
  flagValue?: string,
): Promise<string> {
  if (flagValue && choices.includes(flagValue)) return flagValue;
  console.log(`  ${question}`);
  for (let i = 0; i < choices.length; i++) {
    console.log(`    ${i + 1}) ${choices[i]}`);
  }
  const answer = await rl.question("  Choose (number or name): ");
  const idx = Number.parseInt(answer, 10) - 1;
  if (idx >= 0 && idx < choices.length) return choices[idx];
  if (choices.includes(answer)) return answer;
  console.error(`Invalid choice: ${answer}`);
  process.exit(1);
}

async function promptYesNo(
  rl: ReturnType<typeof createInterface>,
  question: string,
): Promise<boolean> {
  const answer = await rl.question(`  ${question} (y/n): `);
  return answer.toLowerCase().startsWith("y");
}

export async function runNew(type: string, name: string, flags: NewFlags): Promise<void> {
  if (!VALID_TYPES.includes(type)) {
    console.error(`Unknown type: ${type}`);
    console.error(`Available: ${VALID_TYPES.join(", ")}`);
    process.exit(1);
  }
  if (!name) {
    console.error("Usage: ts-ha new <type> <name>");
    process.exit(1);
  }
  if (!isKebabCase(name)) {
    console.error(`Name must be kebab-case (e.g. "my-automation"). Got: "${name}"`);
    process.exit(1);
  }

  const filePath = join(process.cwd(), "src", "automations", `${name}.ts`);
  if (existsSync(filePath) && !flags.force) {
    console.error(`File already exists: ${filePath}`);
    console.error("Use --force to overwrite.");
    process.exit(1);
  }

  if (canSkip(type, flags)) {
    await writeFile(filePath, generate(type, name, flags), "utf-8");
    console.log(`Created: ${filePath}`);
    return;
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    console.log(`\nCreating ${type}: ${name}\n`);
    let content: string;
    switch (type) {
      case "automation":
        content = await scaffoldAutomation(rl, name, flags);
        break;
      case "aqara-h1":
      case "styrbar":
      case "rodret":
        content = await scaffoldRemote(rl, name, flags, type);
        break;
      case "motion-light":
        content = await scaffoldMotionLight(rl, name, flags);
        break;
      default:
        content = "";
    }
    await writeFile(filePath, content, "utf-8");
    console.log(`\nCreated: ${filePath}`);
  } finally {
    rl.close();
  }
}

function canSkip(type: string, f: NewFlags): boolean {
  if (type === "automation") {
    return !!(
      (f.trigger === "mqtt" && f.topic) ||
      (f.trigger === "cron" && f.expression) ||
      (f.trigger === "state" && f.key) ||
      (f.trigger === "webhook" && f.path)
    );
  }
  if (type === "aqara-h1" || type === "styrbar" || type === "rodret") return !!f.remote;
  if (type === "motion-light") return !!(f.sensor && f.light);
  return false;
}

function generate(type: string, name: string, f: NewFlags): string {
  type TDef = {
    type: "mqtt" | "cron" | "state" | "webhook";
    topic?: string;
    expression?: string;
    key?: string;
    path?: string;
    filter?: string;
  };
  if (type === "automation") {
    const t: TDef[] = [];
    if (f.trigger === "mqtt") t.push({ type: "mqtt", topic: f.topic, filter: f.filter });
    else if (f.trigger === "cron") t.push({ type: "cron", expression: f.expression });
    else if (f.trigger === "state") t.push({ type: "state", key: f.key, filter: f.filter });
    else if (f.trigger === "webhook") t.push({ type: "webhook", path: f.path });
    return automationTemplate(name, t);
  }
  if (type === "aqara-h1") return aqaraH1Template(name, f.remote ?? "");
  if (type === "styrbar") return styrbarTemplate(name, f.remote ?? "");
  if (type === "rodret") return rodretTemplate(name, f.remote ?? "");
  if (type === "motion-light") {
    const lux = Number.parseInt(f.lux ?? "30", 10) || 30;
    return motionLightTemplate(name, f.sensor ?? "", f.light ?? "", lux);
  }
  return "";
}

async function scaffoldAutomation(
  rl: ReturnType<typeof createInterface>,
  name: string,
  flags: NewFlags,
): Promise<string> {
  type TDef = {
    type: "mqtt" | "cron" | "state" | "webhook";
    topic?: string;
    expression?: string;
    key?: string;
    path?: string;
    filter?: string;
  };
  const triggers: TDef[] = [];
  const triggerType = await promptChoice(rl, "Trigger type?", TRIGGER_TYPES, flags.trigger);
  triggers.push(await promptTrigger(rl, triggerType, flags));
  if (!flags.trigger) {
    while (await promptYesNo(rl, "Add another trigger?")) {
      const t = await promptChoice(rl, "Trigger type?", TRIGGER_TYPES);
      triggers.push(await promptTrigger(rl, t, {}));
    }
  }
  return automationTemplate(name, triggers);
}

async function promptTrigger(
  rl: ReturnType<typeof createInterface>,
  type: string,
  f: NewFlags,
): Promise<{
  type: "mqtt" | "cron" | "state" | "webhook";
  topic?: string;
  expression?: string;
  key?: string;
  path?: string;
  filter?: string;
}> {
  if (type === "mqtt") {
    const topic = await prompt(rl, "MQTT topic (e.g. zigbee2mqtt/sensor_name)", f.topic);
    let filter: string | undefined = f.filter;
    if (!filter && (await promptYesNo(rl, "Add a payload filter?"))) {
      filter = await prompt(rl, "Filter expression (e.g. payload.occupancy === true)");
    }
    return { type: "mqtt", topic, filter };
  }
  if (type === "cron") {
    const expression = await prompt(rl, "Cron expression (e.g. 0 7 * * *)", f.expression);
    return { type: "cron", expression };
  }
  if (type === "state") {
    const key = await prompt(rl, "State key (e.g. night_mode)", f.key);
    let filter: string | undefined = f.filter;
    if (!filter && (await promptYesNo(rl, "Add a filter?"))) {
      filter = await prompt(rl, "Filter expression (e.g. newValue === true)");
    }
    return { type: "state", key, filter };
  }
  if (type === "webhook") {
    const path = await prompt(rl, "Webhook path (e.g. deploy)", f.path);
    return { type: "webhook", path };
  }
  return { type: "mqtt" };
}

async function scaffoldRemote(
  rl: ReturnType<typeof createInterface>,
  name: string,
  flags: NewFlags,
  deviceType: "aqara-h1" | "styrbar" | "rodret",
): Promise<string> {
  const remoteName = await prompt(rl, "Remote friendly name in Zigbee2MQTT", flags.remote);
  if (deviceType === "aqara-h1") return aqaraH1Template(name, remoteName);
  if (deviceType === "styrbar") return styrbarTemplate(name, remoteName);
  return rodretTemplate(name, remoteName);
}

async function scaffoldMotionLight(
  rl: ReturnType<typeof createInterface>,
  name: string,
  flags: NewFlags,
): Promise<string> {
  const sensor = await prompt(rl, "Motion sensor friendly name", flags.sensor);
  const light = await prompt(rl, "Light friendly name", flags.light);
  const luxStr = await prompt(rl, "Lux threshold (only activates below, default: 30)", flags.lux);
  return motionLightTemplate(name, sensor, light, Number.parseInt(luxStr, 10) || 30);
}
