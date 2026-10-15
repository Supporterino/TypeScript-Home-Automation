/**
 * A unique marker carried by the harness's own documents and by no shipped asset
 * (design.md D9; specs/web-ui "Build Process" — "A development-only module does
 * not reach the shipped build").
 *
 * The same technique as `registry.ts`'s `WALL_CHUNK_MARKER`, which the wall grid
 * renders as `data-wall-chunk`: the string is rendered onto each harness
 * document's root element, so it travels with the harness's real code rather than
 * living in a constant nothing uses. `tests/web-ui-assets.test.ts` then asserts it
 * appears in no emitted asset — and, in the same test, that the harness still
 * renders it, so renaming or dropping the constant cannot quietly neuter the
 * guard.
 *
 * It is deliberately unlike any other string in the tree: a marker that also
 * appears in shared code or in a class name would make the asset assertion fail
 * for the wrong reason.
 */
export const WALL_HARNESS_MARKER = "ts-ha-wall-harness";
