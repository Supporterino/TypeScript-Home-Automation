/**
 * The shared text-input treatment. Every form text field composes it so the
 * height and focus ring stay consistent; the 40px default is the standard
 * control height and the 32px compact variant is for dense filter rows.
 */

const BASE_INPUT_CLASSES =
  "w-full rounded-input border border-hairline bg-surface px-3 text-sm text-ink motion-toggle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

/** Standard-height (40px) text input. */
export const INPUT_CLASSES = `touch-target h-10 ${BASE_INPUT_CLASSES}`;

/** Compact (32px) text input, for dense filter rows. */
export const INPUT_CLASSES_SM = `touch-target h-8 ${BASE_INPUT_CLASSES}`;
