/** Automation execution observability contracts. */

import type { TriggerContext } from "./automation.js";

/** Whether an automation run completed successfully or raised an error. */
export type ExecutionOutcome = "success" | "failure";

/**
 * A single retained execution record for one automation.
 */
export interface ExecutionRecord {
  /** Epoch milliseconds when the run started. */
  startedAt: number;
  /** The trigger context that caused this run. */
  trigger: TriggerContext;
  /** Wall-clock duration of the run, in milliseconds. */
  durationMs: number;
  outcome: ExecutionOutcome;
  /** Present only when `outcome` is `"failure"`. */
  error?: string;
}

/** An automation's observed writes, bounded and possibly truncated. */
export interface ObservedWrites {
  /** Distinct state keys observed being written, oldest-retained first. */
  keys: string[];
  /** `true` once a least-recently-written key was evicted; never resets. */
  truncated: boolean;
}
