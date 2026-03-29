import { addTarget, getConfigPath, listTargets, removeTarget, setActiveTarget } from "../config.js";
import { formatTable } from "../format.js";

export async function listConfig(json: boolean): Promise<void> {
  const { targets, active } = await listTargets();

  if (json) {
    console.log(JSON.stringify({ targets, active }, null, 2));
    return;
  }

  const rows = targets.map((t) => [
    t.name === active ? `* ${t.name}` : `  ${t.name}`,
    t.host,
    t.token ? "(set)" : "(none)",
  ]);

  console.log(formatTable(["  TARGET", "HOST", "TOKEN"], rows));
  console.log(`\nConfig: ${getConfigPath()}`);
}

export async function addConfig(name: string, host: string, token: string): Promise<void> {
  await addTarget(name, host, token);
  console.log(`Added target "${name}" → ${host}`);
}

export async function removeConfig(name: string): Promise<void> {
  const removed = await removeTarget(name);
  if (removed) {
    console.log(`Removed target "${name}"`);
  } else {
    console.log(`Target "${name}" not found.`);
  }
}

export async function useConfig(name: string): Promise<void> {
  await setActiveTarget(name);
  console.log(`Active target set to "${name}"`);
}
