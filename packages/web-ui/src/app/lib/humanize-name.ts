/**
 * Pure, presentation-only device-name humanisation (design.md D8;
 * specs/web-ui "Device Name Presentation"). A machine identifier — a name
 * containing the separators `_` or `-` — is split on separators, title-cased
 * word by word, and collapsed to single spaces: `livingroom_couch` becomes
 * "Livingroom Couch". A name that already reads as words (or an empty string)
 * is returned unchanged, so an already-human Zigbee name is never re-cased.
 *
 * It does not infer word boundaries inside a joined token (`livingroom` stays
 * "Livingroom"), and it never touches the raw identifier used to address,
 * route to, or command a device — only the label a person reads.
 */

/** Whether the name looks like a machine identifier rather than human words. */
function hasSeparator(rawName: string): boolean {
  return rawName.includes("_") || rawName.includes("-");
}

/**
 * Derives a human-readable label from a device's raw name. Separator-containing
 * identifiers become title-cased words; every other name is returned unchanged.
 */
export function humanizeDeviceName(rawName: string): string {
  if (!hasSeparator(rawName)) return rawName;

  return rawName
    .split(/[_-]+/)
    .join(" ")
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .filter((word) => word.length > 0)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
