import type { StateChangeHandler, StateManager } from "../state/state-manager.js";
import { currentAutomationName } from "./execution-context.js";
import type { ExecutionRecorder } from "./execution-recorder.js";

/**
 * Attributes state writes to the automation currently executing, without any
 * change to `StateManager` itself (design.md D11, D20; task 8.2).
 *
 * Uses the existing `onAnyChange` global listener rather than instrumenting
 * `set()`/`setInternal()` directly, so stored values and change-listener
 * notification are provably unchanged — this is an additional subscriber,
 * not a modification to the write path. The listener runs synchronously
 * within the same call stack as the write, which is itself synchronous
 * within the automation's `execute()` — so `currentAutomationName()` still
 * resolves correctly here even though the write happens deep inside a
 * promise chain after an `await` (`AsyncLocalStorage` context, not a stack
 * frame, is what survives).
 *
 * A write made with no automation currently executing (an HTTP API request,
 * or the manager's own `setInternal`/`deleteInternal` calls for rooms and
 * enabled-flags) is left unattributed, matching the "Non-automation work is
 * unattributed" scenario.
 *
 * Returns an unsubscribe function.
 */
export function wireStateWriteAttribution(
  state: StateManager,
  recorder: ExecutionRecorder,
): () => void {
  const handler: StateChangeHandler = (key) => {
    const automationName = currentAutomationName();
    if (automationName) {
      recorder.recordObservedWrite(automationName, key);
    }
  };

  state.onAnyChange(handler);
  return () => state.offAnyChange(handler);
}
