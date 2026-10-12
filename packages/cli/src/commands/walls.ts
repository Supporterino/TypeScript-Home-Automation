import type { WallProfileConfig } from "@ts-ha/shared";
import type { DebugClient } from "../client.js";
import { formatTable } from "../format.js";

/** List wall profiles (administration only — the terminal never renders a wall). */
export async function listWalls(client: DebugClient, json: boolean): Promise<void> {
  const result = await client.getWalls();

  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (result.walls.length === 0) {
    console.log("No wall profiles defined.");
    return;
  }

  const rows = result.walls.map((wall) => [
    wall.name,
    String(wall.version),
    String(wall.config.widgets.length),
  ]);
  console.log(formatTable(["NAME", "VERSION", "WIDGETS"], rows));
  console.log(`\n${result.count} profile${result.count === 1 ? "" : "s"}`);
}

/** Print one profile's configuration. */
export async function getWall(client: DebugClient, name: string, json: boolean): Promise<void> {
  const wall = await client.getWall(name);

  if (json) {
    console.log(JSON.stringify(wall, null, 2));
    return;
  }

  console.log(`Name:     ${wall.name}`);
  console.log(`Version:  ${wall.version}`);
  console.log(`Widgets:  ${wall.config.widgets.length}`);
  console.log("Config:");
  console.log(JSON.stringify(wall.config, null, 2));
}

export async function createWall(
  client: DebugClient,
  name: string,
  configJson: string,
  json: boolean,
): Promise<void> {
  const config = parseWallConfig(configJson);
  const wall = await client.createWall(name, config);

  if (json) {
    console.log(JSON.stringify(wall, null, 2));
    return;
  }

  console.log(`Created wall "${wall.name}" with ${wall.config.widgets.length} widget(s).`);
}

export async function updateWall(
  client: DebugClient,
  name: string,
  configJson: string,
  json: boolean,
): Promise<void> {
  const config = parseWallConfig(configJson);
  const wall = await client.updateWall(name, { config });

  if (json) {
    console.log(JSON.stringify(wall, null, 2));
    return;
  }

  console.log(`Updated wall "${wall.name}" (${wall.config.widgets.length} widget(s)).`);
}

export async function deleteWall(client: DebugClient, name: string, json: boolean): Promise<void> {
  const result = await client.deleteWall(name);

  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`Deleted wall "${result.name}".`);
}

/** Parse a `<config>` argument, exiting on invalid JSON or a non-object. */
function parseWallConfig(raw: string): WallProfileConfig {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.error("Invalid JSON config.");
    process.exit(1);
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    console.error("Wall config must be a JSON object.");
    process.exit(1);
  }

  return parsed as WallProfileConfig;
}
