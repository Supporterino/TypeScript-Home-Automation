import type { StateChangeHandler, StateManager } from "../state/state-manager.js";
import { currentAutomationName } from "./execution-context.js";
import type { ExecutionRecorder } from "./execution-recorder.js";

/**
 * Attributes state writes to the automation currently executing, via an extra
 * `onAnyChange` subscriber (the write path is untouched). Returns an
 * unsubscribe function.
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
