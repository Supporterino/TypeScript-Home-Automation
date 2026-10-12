/**
 * Global-shortcut gating for the dashboard.
 *
 * `@opentui/react`'s `useKeyboard` registers every handler on one shared
 * emitter and invokes all of them, so a tab's early `return` does not stop the
 * parent `Dashboard` handler. While a tab owns a free-text input (the Devices
 * inline editor, the Rooms batch-command input), the parent must itself decline
 * to act — otherwise typing a digit switches tabs and `q` quits.
 *
 * Pure so it can be unit-tested without a render harness.
 */
export function shouldHandleGlobalShortcut(inputActive: boolean): boolean {
  return !inputActive;
}
