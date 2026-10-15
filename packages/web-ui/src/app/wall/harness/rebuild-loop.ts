/**
 * The harness dev server's rebuild scheduling (design.md D8; task 3.1).
 *
 * `scripts/harness.ts` rebuilds both harness documents when their source
 * changes, and it must not drop a change that lands while a build is in flight:
 * an edit saved mid-build would otherwise sit unseen until the next save, which
 * is the worst kind of dev-server bug to chase.
 *
 * The rule is the one `scripts/build-web-ui.ts` already proves for its watch
 * loop — a build in flight sets a pending flag rather than returning, and a
 * finished build re-runs when that flag is set. It is expressed here as two pure
 * transitions so the scheduling is reachable by `bun test` without a server, a
 * filesystem watcher, or any timing.
 *
 * Imported only by `scripts/harness.ts`; nothing in the app reaches it.
 */

/** The rebuild loop's state: whether a build is running, and whether one is owed. */
export interface RebuildState {
  /** Whether a build is in flight. */
  readonly building: boolean;
  /** Whether a change arrived while one was — i.e. whether a re-run is owed. */
  readonly pending: boolean;
}

/** The loop's state before anything has changed. */
export const IDLE_REBUILD: RebuildState = { building: false, pending: false };

/** What to do about an arriving rebuild request, and the state it leaves behind. */
export interface RebuildTransition {
  readonly next: RebuildState;
  /** Whether the caller must start building now. */
  readonly run: boolean;
}

/**
 * A rebuild request arrived (a debounced batch of filesystem events). An idle
 * loop starts building; a busy one coalesces the request into a re-run, so the
 * change is not lost and no second build runs concurrently.
 */
export function requestRebuild(state: RebuildState): RebuildTransition {
  if (state.building) return { next: { building: true, pending: true }, run: false };
  return { next: { building: true, pending: false }, run: true };
}

/**
 * A build finished. A change that arrived while it ran starts another
 * immediately; otherwise the loop goes idle.
 */
export function settleRebuild(state: RebuildState): RebuildTransition {
  if (state.pending) return { next: { building: true, pending: false }, run: true };
  return { next: IDLE_REBUILD, run: false };
}
