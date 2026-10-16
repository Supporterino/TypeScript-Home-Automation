/**
 * The harness dev server's rebuild scheduling: a build in flight sets a pending flag
 * rather than dropping a change.
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
 * A rebuild request arrived. An idle loop starts building; a busy one coalesces the
 * request into a re-run.
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
