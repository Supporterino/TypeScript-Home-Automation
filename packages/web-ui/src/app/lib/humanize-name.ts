/**
 * Pure, presentation-only device-name humanisation (design.md D8;
 * specs/web-ui "Device Name Presentation"; wall-zones-and-fit D6;
 * specs/wall-display "Wall Glanceability"). A machine identifier — a name
 * containing the separators `_` or `-` — is split on separators, title-cased
 * word by word, and collapsed to single spaces: `livingroom_couch` becomes
 * "Livingroom Couch". A name that already reads as words (or an empty string)
 * is returned unchanged, so an already-human Zigbee name is never re-cased.
 *
 * It does not infer word boundaries inside a joined token (`livingroom` stays
 * "Livingroom"), and it never touches the raw identifier used to address,
 * route to, or command a device — only the label a person reads.
 *
 * {@link shortDeviceName} is the wall's counterpart: a card too narrow for the
 * full name presents a shortened form rather than a CSS-ellipsized prefix that
 * several cards share (specs/wall-display "A name is shortened, not truncated").
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
 * The default budget, in characters, for a wall card's shortened name — enough
 * for the distinguishing trailing words of a room-scoped device name, and short
 * enough that two cards sharing a room prefix do not collide.
 */
export const SHORT_DEVICE_NAME_MAX_LENGTH = 14;

/**
 * Shortens a device name to its distinguishing **trailing** words within
 * `maxLength` characters (wall-zones-and-fit D6; specs/wall-display "A name is
 * shortened, not truncated").
 *
 * A name that already fits the budget is returned humanized but otherwise
 * unchanged, so only a name too long for its card is shortened. A longer name
 * keeps as many whole trailing words as fit, dropping the leading words a
 * sibling card is most likely to share first — "Kitchen Ceiling Light" and
 * "Kitchen Ceiling Lamp" shorten to "Ceiling Light" and "Ceiling Lamp", which
 * distinguish the two, where a CSS ellipsis would render the same "Kitchen
 * Ceili…" twice. A single word longer than the budget is returned whole rather
 * than cut mid-word; the caller's `title`/`aria-label` keeps the full name.
 *
 * An explicit override — a card's configured label — is the caller's name to
 * pass instead of the derived short form; nothing here overrides it.
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
