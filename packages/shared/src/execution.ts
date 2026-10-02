/**
 * Automation execution observability contracts (design.md D11; tasks 8.3,
 * 8.2b, 8.2c).
 */

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

/**
 * An automation's observed writes, bounded and possibly truncated
 * (design.md R15; tasks 8.2b, 8.2c).
 */
export interface ObservedWrites {
  /** Distinct state keys observed being written, oldest-retained first. */
  keys: string[];
  /**
   * `true` once the retained set has ever exceeded the limit and a
   * least-recently-written key was evicted — permanently, since the evicted
   * key's presence in the automation's history cannot be recovered by later
   * shrinking back under the limit (design.md R12, R15).
   */
  truncated: boolean;
}
