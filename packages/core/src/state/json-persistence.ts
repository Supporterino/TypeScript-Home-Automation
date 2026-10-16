import { copyFile, open, readFile, rename } from "node:fs/promises";
import type { Logger } from "pino";

/**
 * JSON-file persistence primitives shared by {@link StateManager} and
 * `DeviceStateStore` (design.md D6, R3).
 *
 * Both stores keep their own in-memory map and serialization, but the durable
 * write (atomic temp-file + `fsync` + `.bak`) and the load-with-backup-recovery
 * flow are identical; only the noun in their log lines differs, which the
 * `label` argument supplies ("state" / "device state").
 */

/**
 * Load and apply a JSON file, falling back to the `.bak` backup when the
 * primary file is missing-but-that-is-fine or corrupt.
 *
 * `apply` receives the parsed object and the path it was read from (primary or
 * backup) so the caller can log — or ignore — the source. Read errors and
 * parse errors are logged and swallowed; the store is left as `apply` leaves it.
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
 * Durably write `contents` to `filePath` atomically.
 *
 * Writes to a temp file, `fsync`s it to disk, preserves any existing file as a
 * `.bak` backup (best-effort), then atomically renames the temp file over
 * `filePath`. An interrupted write can never leave `filePath` truncated. The
 * caller is responsible for the parent directory existing.
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
