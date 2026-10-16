/** Normalize the bare form and `ls` to `list`; other subcommands pass through. */
export function normalizeListSubcommand(subcommand: string): string {
  return subcommand === "" || subcommand === "ls" ? "list" : subcommand;
}
