import type { Logger } from "pino";
import type { TriggerContext } from "../automation.js";
import { runInAutomationContext } from "./execution-context.js";

/** Whether an automation run completed successfully or raised an error. */
export type ExecutionOutcome = "success" | "failure";

/**
 * A single retained execution record for one automation (design.md D11;
 * task 8.3).
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

/** Broadcast when an automation run completes, success or failure. */
export interface ExecutionCompletionEvent {
  automation: string;
  trigger: TriggerContext;
  durationMs: number;
  outcome: ExecutionOutcome;
}

export type ExecutionCompletionListener = (event: ExecutionCompletionEvent) => void;

/** Per-automation retention default for execution history (design.md R10). */
const DEFAULT_HISTORY_LIMIT = 20;

/** Per-automation retention default for observed write keys (design.md R15). */
const DEFAULT_OBSERVED_WRITES_LIMIT = 20;

/**
 * Records automation execution history and observed state writes, and
 * broadcasts execution completions to subscribers (the realtime event
 * stream, Prometheus counters).
 *
 * Every one of those consumers derives from the same `run()` call so history,
 * counters, and the completion event can never disagree (design.md D18;
 * task 8.8).
 */
export class ExecutionRecorder {
  private readonly history: Map<string, ExecutionRecord[]> = new Map();
  private readonly observedWrites: Map<string, { keys: string[]; truncated: boolean }> = new Map();
  private readonly completionListeners: Set<ExecutionCompletionListener> = new Set();

  constructor(
    private readonly logger: Logger,
    private readonly historyLimit: number = DEFAULT_HISTORY_LIMIT,
    private readonly observedWritesLimit: number = DEFAULT_OBSERVED_WRITES_LIMIT,
  ) {}

  /**
   * Runs `fn` inside an execution context attributed to `automationName`,
   * timing it and recording the outcome regardless of whether it resolves
   * or rejects. Rethrows `fn`'s rejection unchanged, so existing callers'
   * `.catch()` / `try`/`catch` handling is unaffected by this wrapping
   * (design.md D11; task 8.1).
   *
   * A failure while recording the outcome (history bookkeeping, or a
   * subscriber's completion listener) is logged and swallowed — it MUST
   * NOT surface as, or be mistaken for, a failure of the automation run
   * itself (design.md task 8.4).
   */
  async run(
    automationName: string,
    trigger: TriggerContext,
    fn: () => Promise<void>,
  ): Promise<void> {
    const startedAt = Date.now();
    try {
      await runInAutomationContext(automationName, fn);
      this.finish({
        automationName,
        trigger,
        startedAt,
        durationMs: Date.now() - startedAt,
        outcome: "success",
      });
    } catch (err) {
      this.finish({
        automationName,
        trigger,
        startedAt,
        durationMs: Date.now() - startedAt,
        outcome: "failure",
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }

  private finish(args: {
    automationName: string;
    trigger: TriggerContext;
    startedAt: number;
    durationMs: number;
    outcome: ExecutionOutcome;
    error?: string;
  }): void {
    const { automationName, ...record } = args;
    try {
      this.pushHistory(automationName, record);
    } catch (err) {
      this.logger.error({ err, automation: automationName }, "Failed to record execution history");
    }
    this.notifyCompletion({
      automation: automationName,
      trigger: record.trigger,
      durationMs: record.durationMs,
      outcome: record.outcome,
    });
  }

  private pushHistory(automationName: string, record: ExecutionRecord): void {
    let list = this.history.get(automationName);
    if (!list) {
      list = [];
      this.history.set(automationName, list);
    }
    list.push(record);
    if (list.length > this.historyLimit) {
      list.shift();
    }
  }

  /**
   * Returns `automationName`'s retained execution history, most recent
   * first. Returns an empty array for an automation that has never run
   * (task 8.3) — the caller distinguishes "never run" from "unknown
   * automation" itself, since this recorder has no notion of which
   * automations exist.
   */
  getHistory(automationName: string): ExecutionRecord[] {
    const list = this.history.get(automationName);
    if (!list) return [];
    return [...list].reverse();
  }

  /**
   * Records that `automationName` wrote `key`, evicting the
   * least-recently-written key once the retained set exceeds the bound
   * (design.md R15; task 8.2b). Writing an already-tracked key moves it to
   * most-recently-written without growing the set.
   */
  recordObservedWrite(automationName: string, key: string): void {
    let entry = this.observedWrites.get(automationName);
    if (!entry) {
      entry = { keys: [], truncated: false };
      this.observedWrites.set(automationName, entry);
    }

    const existingIdx = entry.keys.indexOf(key);
    if (existingIdx !== -1) {
      entry.keys.splice(existingIdx, 1);
    }
    entry.keys.push(key);

    if (entry.keys.length > this.observedWritesLimit) {
      entry.keys.shift();
      entry.truncated = true;
    }
  }

  /**
   * Returns `automationName`'s observed writes, oldest-retained first, and
   * whether the set has ever been truncated (tasks 8.2b, 8.2c). An
   * automation that has never written any state key returns an empty,
   * non-truncated set — distinguishable from "writes nothing" only by the
   * caller framing this as observations accumulated since startup, not a
   * complete description (design.md R12).
   */
  getObservedWrites(automationName: string): ObservedWrites {
    const entry = this.observedWrites.get(automationName);
    if (!entry) return { keys: [], truncated: false };
    return { keys: [...entry.keys], truncated: entry.truncated };
  }

  /**
   * Subscribe to execution completions — used to broadcast the realtime
   * `automation_execution` event category and to increment the Prometheus
   * execution/failure counters (design.md D18; tasks 8.7, 8.8). Each
   * listener is isolated: a throwing listener is logged and does not
   * prevent the others from running, mirroring `EventBus`/`LogBuffer`.
   *
   * Returns an unsubscribe function.
   */
  onCompletion(listener: ExecutionCompletionListener): () => void {
    this.completionListeners.add(listener);
    return () => {
      this.completionListeners.delete(listener);
    };
  }

  private notifyCompletion(event: ExecutionCompletionEvent): void {
    for (const listener of this.completionListeners) {
      try {
        listener(event);
      } catch (err) {
        this.logger.error(
          { err, automation: event.automation },
          "Execution completion listener failed",
        );
      }
    }
  }
}
