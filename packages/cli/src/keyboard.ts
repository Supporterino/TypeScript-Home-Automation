/**
 * Whether the dashboard should act on a global shortcut — declined while a
 * tab's text input is active.
 */
export function shouldHandleGlobalShortcut(inputActive: boolean): boolean {
  return !inputActive;
}
