/**
 * The shared text-input treatment: `BASE_INPUT_CLASSES` plus a height variant, so
 * the focus ring stays consistent across text fields.
 */

const BASE_INPUT_CLASSES =
  "w-full rounded-input border border-hairline bg-surface px-3 text-sm text-ink motion-toggle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

/** Standard-height (40px) text input. */
export const INPUT_CLASSES = `touch-target h-10 ${BASE_INPUT_CLASSES}`;

/** Compact (32px) text input, for dense filter rows. */
export const INPUT_CLASSES_SM = `touch-target h-8 ${BASE_INPUT_CLASSES}`;
