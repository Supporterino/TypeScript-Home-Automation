/**
 * Pure, presentation-only device-name humanisation: a separator-containing
 * identifier is split, title-cased, and collapsed to spaces.
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

/**
 * The default budget, in characters, for a wall card's shortened name.
 */
export const SHORT_DEVICE_NAME_MAX_LENGTH = 14;

/**
 * Shortens a device name to its distinguishing trailing words within
 * `maxLength` characters, keeping whole words and never cutting mid-word.
 */
export function shortDeviceName(rawName: string, maxLength = SHORT_DEVICE_NAME_MAX_LENGTH): string {
  const name = humanizeDeviceName(rawName).trim();
  if (name.length <= maxLength) return name;

  const words = name.split(" ").filter((word) => word.length > 0);
  const taken: string[] = [];
  for (let i = words.length - 1; i >= 0; i -= 1) {
    const word = words[i];
    if (word === undefined) continue;
    // Always keep the last word, so a name can never shorten to nothing.
    if (taken.length > 0 && word.length + 1 + taken.join(" ").length > maxLength) break;
    taken.unshift(word);
  }
  return taken.join(" ");
}
