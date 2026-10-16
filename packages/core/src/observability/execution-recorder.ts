import type { ExecutionOutcome, ExecutionRecord, ObservedWrites } from "@ts-ha/shared";
import type { Logger } from "pino";
import type { TriggerContext } from "../automation.js";
import { runInAutomationContext } from "./execution-context.js";

export type { ExecutionOutcome, ExecutionRecord, ObservedWrites } from "@ts-ha/shared";

/** Broadcast when an automation run completes, success or failure. */
export interface ExecutionCompletionEvent {
  automation: string;
  trigger: TriggerContext;
  durationMs: number;
  outcome: ExecutionOutcome;
}

export type ExecutionCompletionListener = (event: ExecutionCompletionEvent) => void;

/** Per-automation retention default for execution history. */
const DEFAULT_HISTORY_LIMIT = 20;

/** Per-automation retention default for observed write keys. */
const DEFAULT_OBSERVED_WRITES_LIMIT = 20;

/**
 * Records automation execution history and observed state writes, and broadcasts
 * execution completions to subscribers. Every consumer derives from the same `run()`
 * call so history, counters, and the completion event cannot disagree.
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
   * Run `fn` inside an execution context attributed to `automationName`, timing it and
   * recording the outcome; rethrows `fn`'s rejection unchanged. A failure while
   * recording is logged and swallowed, never mistaken for a run failure.
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
   * Return `automationName`'s retained execution history, most recent first; empty
   * for an automation that has never run. The caller distinguishes "never run" from
   * "unknown automation" itself.
   */
  getHistory(automationName: string): ExecutionRecord[] {
    const list = this.history.get(automationName);
    if (!list) return [];
    return [...list].reverse();
  }

  /**
   * Record that `automationName` wrote `key`, evicting the least-recently-written key
   * once the set exceeds the bound. Re-writing a tracked key just moves it to MRU.
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
   * Return `automationName`'s observed writes, oldest-retained first, and whether the
   * set has been truncated. Empty and non-truncated for an automation that never wrote.
   */
  getObservedWrites(automationName: string): ObservedWrites {
    const entry = this.observedWrites.get(automationName);
    if (!entry) return { keys: [], truncated: false };
    return { keys: [...entry.keys], truncated: entry.truncated };
  }

  /**
   * Subscribe to execution completions; a throwing listener is logged and does not
   * prevent the others from running. Returns an unsubscribe function.
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
