/**
 * Subcommand alias normalization for the domains whose bare invocation lists
 * (specs/cli "Command Surface"): `ts-ha devices`, `ts-ha automations`,
 * `ts-ha state`, `ts-ha rooms`, and `ts-ha walls` all list with no subcommand.
 *
 * The bare form and `ls` are aliases for `list`; every other subcommand is
 * returned unchanged. Pure so it can be unit-tested without importing the
 * dispatcher (which runs `main()` on import).
 */
export function normalizeListSubcommand(subcommand: string): string {
  return subcommand === "" || subcommand === "ls" ? "list" : subcommand;
}
