import { copyFile, open, readFile, rename } from "node:fs/promises";
import type { Logger } from "pino";

/**
 * JSON-file persistence primitives shared by {@link StateManager} and
 * `DeviceStateStore`: an atomic temp-file + `fsync` + `.bak` write and a
 * load-with-backup-recovery flow, parameterised by a `label` for log lines.
 */

/**
 * Load and apply a JSON file, falling back to the `.bak` backup when the primary is
 * missing or corrupt; `apply` receives the parsed object and its source path.
 */
export async function readJsonWithBackup(
  filePath: string,
  logger: Logger,
  label: string,
  apply: (parsed: Record<string, unknown>, file: string) => void,
): Promise<void> {
  let data: string;
  try {
    data = await readFile(filePath, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      logger.debug({ file: filePath }, `No persisted ${label} file found, starting fresh`);
    } else {
      logger.error({ err, file: filePath }, `Failed to load persisted ${label}`);
    }
    return;
  }

  try {
    apply(JSON.parse(data) as Record<string, unknown>, filePath);
    return;
  } catch (err) {
    // Primary file is corrupt/unparseable — attempt recovery from the backup.
    logger.error(
      { err, file: filePath },
      `Persisted ${label} file is corrupt, attempting backup recovery`,
    );
  }

  const backupPath = `${filePath}.bak`;
  try {
    const backup = await readFile(backupPath, "utf-8");
    apply(JSON.parse(backup) as Record<string, unknown>, backupPath);
  } catch (err) {
    logger.error(
      { err, file: backupPath },
      `Backup ${label} file missing or corrupt, starting with an empty store`,
    );
  }
}

/**
 * Durably write `contents` to `filePath`: temp file, `fsync`, `.bak` backup, then an atomic
 * rename. The caller ensures the parent directory exists.
 */
export async function writeJsonAtomically(
  filePath: string,
  contents: string,
  logger: Logger,
  label: string,
): Promise<void> {
  const tmpPath = `${filePath}.tmp`;

  const fh = await open(tmpPath, "w");
  try {
    await fh.writeFile(contents, "utf-8");
    await fh.sync();
  } finally {
    await fh.close();
  }

  // Best-effort backup of the previous good file — a failed backup (e.g. the
  // file does not exist yet) MUST NOT block the primary save.
  try {
    await copyFile(filePath, `${filePath}.bak`);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      logger.warn({ err, file: filePath }, `Failed to back up prior ${label} file`);
    }
  }

  await rename(tmpPath, filePath);
}
