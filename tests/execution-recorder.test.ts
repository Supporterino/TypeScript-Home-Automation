import { describe, expect, it, mock } from "bun:test";
import pino from "pino";
import type { TriggerContext } from "../src/core/automation.js";
import {
  type ExecutionCompletionEvent,
  ExecutionRecorder,
} from "../src/core/observability/execution-recorder.js";

const logger = pino({ level: "silent" });

const cronTrigger = (expression = "0 7 * * *"): TriggerContext => ({
  type: "cron",
  expression,
  firedAt: new Date(0),
});

describe("ExecutionRecorder", () => {
  describe("execution history (task 8.3)", () => {
    it("returns an empty history for an automation that has never run", () => {
      const recorder = new ExecutionRecorder(logger);
      expect(recorder.getHistory("never-run")).toEqual([]);
    });

    it("records a successful run with start time, trigger, duration, and outcome", async () => {
      const recorder = new ExecutionRecorder(logger);
      const trigger = cronTrigger();

      await recorder.run("motion-light", trigger, async () => {
        /* succeeds */
      });

      const history = recorder.getHistory("motion-light");
      expect(history).toHaveLength(1);
      expect(history[0].outcome).toBe("success");
      expect(history[0].trigger).toEqual(trigger);
      expect(typeof history[0].startedAt).toBe("number");
      expect(typeof history[0].durationMs).toBe("number");
      expect(history[0].error).toBeUndefined();
    });

    it("records a failed run with its error message, and rethrows", async () => {
      const recorder = new ExecutionRecorder(logger);
      const trigger = cronTrigger();

      await expect(
        recorder.run("motion-light", trigger, async () => {
          throw new Error("boom");
        }),
      ).rejects.toThrow("boom");

      const history = recorder.getHistory("motion-light");
      expect(history).toHaveLength(1);
      expect(history[0].outcome).toBe("failure");
      expect(history[0].error).toBe("boom");
    });

    it("retains only the most recent records, oldest discarded first, when run more than the limit", async () => {
      const recorder = new ExecutionRecorder(logger, 3);

      for (let i = 0; i < 5; i++) {
        await recorder.run("motion-light", cronTrigger(`run-${i}`), async () => {});
      }

      const history = recorder.getHistory("motion-light");
      expect(history).toHaveLength(3);
      // Newest first; the oldest two (run-0, run-1) were discarded.
      expect(history.map((r) => (r.trigger as { expression: string }).expression)).toEqual([
        "run-4",
        "run-3",
        "run-2",
      ]);
    });
  });

  describe("observed writes (tasks 8.2b, 8.2c)", () => {
    it("returns an empty, non-truncated set for an automation with no observed writes", () => {
      const recorder = new ExecutionRecorder(logger);
      expect(recorder.getObservedWrites("motion-light")).toEqual({ keys: [], truncated: false });
    });

    it("accumulates distinct keys across calls", () => {
      const recorder = new ExecutionRecorder(logger, 20, 5);
      recorder.recordObservedWrite("motion-light", "lights_on");
      recorder.recordObservedWrite("motion-light", "night_mode");

      expect(recorder.getObservedWrites("motion-light")).toEqual({
        keys: ["lights_on", "night_mode"],
        truncated: false,
      });
    });

    it("never exceeds the configured limit", () => {
      const recorder = new ExecutionRecorder(logger, 20, 3);
      for (let i = 0; i < 10; i++) {
        recorder.recordObservedWrite("motion-light", `key-${i}`);
      }

      const observed = recorder.getObservedWrites("motion-light");
      expect(observed.keys).toHaveLength(3);
    });

    it("evicts the least-recently-written key first, and reports truncation past the limit", () => {
      const recorder = new ExecutionRecorder(logger, 20, 3);
      recorder.recordObservedWrite("motion-light", "a");
      recorder.recordObservedWrite("motion-light", "b");
      recorder.recordObservedWrite("motion-light", "c");
      expect(recorder.getObservedWrites("motion-light")).toEqual({
        keys: ["a", "b", "c"],
        truncated: false,
      });

      recorder.recordObservedWrite("motion-light", "d");
      const observed = recorder.getObservedWrites("motion-light");
      expect(observed.keys).toEqual(["b", "c", "d"]);
      expect(observed.truncated).toBe(true);
    });

    it("re-writing an existing key moves it to most-recently-written without growing the set", () => {
      const recorder = new ExecutionRecorder(logger, 20, 3);
      recorder.recordObservedWrite("motion-light", "a");
      recorder.recordObservedWrite("motion-light", "b");
      recorder.recordObservedWrite("motion-light", "c");
      recorder.recordObservedWrite("motion-light", "a"); // re-write, moves to the end

      const observed = recorder.getObservedWrites("motion-light");
      expect(observed.keys).toEqual(["b", "c", "a"]);
      expect(observed.truncated).toBe(false);

      // The next genuinely new key evicts "b" (now least-recently-written), not "a".
      recorder.recordObservedWrite("motion-light", "d");
      expect(recorder.getObservedWrites("motion-light").keys).toEqual(["c", "a", "d"]);
    });

    it("keeps separate observed-write sets per automation", () => {
      const recorder = new ExecutionRecorder(logger, 20, 3);
      recorder.recordObservedWrite("motion-light", "a");
      recorder.recordObservedWrite("night-mode", "b");

      expect(recorder.getObservedWrites("motion-light").keys).toEqual(["a"]);
      expect(recorder.getObservedWrites("night-mode").keys).toEqual(["b"]);
    });
  });

  describe("completion broadcasts (tasks 8.7, 8.8)", () => {
    it("notifies a subscribed listener with automation, trigger, duration, and outcome", async () => {
      const recorder = new ExecutionRecorder(logger);
      const events: ExecutionCompletionEvent[] = [];
      recorder.onCompletion((e) => events.push(e));

      const trigger = cronTrigger();
      await recorder.run("motion-light", trigger, async () => {});

      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        automation: "motion-light",
        trigger,
        outcome: "success",
      });
      expect(typeof events[0].durationMs).toBe("number");
    });

    it("notifies on failure too, with outcome failure", async () => {
      const recorder = new ExecutionRecorder(logger);
      const events: ExecutionCompletionEvent[] = [];
      recorder.onCompletion((e) => events.push(e));

      await expect(
        recorder.run("motion-light", cronTrigger(), async () => {
          throw new Error("boom");
        }),
      ).rejects.toThrow();

      expect(events).toHaveLength(1);
      expect(events[0].outcome).toBe("failure");
    });

    it("stops notifying after unsubscribe", async () => {
      const recorder = new ExecutionRecorder(logger);
      const events: ExecutionCompletionEvent[] = [];
      const unsubscribe = recorder.onCompletion((e) => events.push(e));
      unsubscribe();

      await recorder.run("motion-light", cronTrigger(), async () => {});
      expect(events).toHaveLength(0);
    });

    it("isolates a throwing listener from the others", async () => {
      const recorder = new ExecutionRecorder(logger);
      const events: ExecutionCompletionEvent[] = [];
      recorder.onCompletion(() => {
        throw new Error("listener boom");
      });
      recorder.onCompletion((e) => events.push(e));

      await recorder.run("motion-light", cronTrigger(), async () => {});
      expect(events).toHaveLength(1);
    });
  });

  describe("recording failure does not fail the run (task 8.4)", () => {
    it("swallows a throwing completion listener and still resolves normally on success", async () => {
      const errorLogger = { error: mock(() => {}) } as unknown as typeof logger;
      const recorder = new ExecutionRecorder(errorLogger);
      recorder.onCompletion(() => {
        throw new Error("recording failed");
      });

      // Must resolve without throwing — the listener failure must not
      // surface as, or be mistaken for, an automation execution failure.
      await recorder.run("motion-light", cronTrigger(), async () => {});

      expect(errorLogger.error).toHaveBeenCalledTimes(1);
      // The run itself is still recorded despite the listener's failure.
      expect(recorder.getHistory("motion-light")).toHaveLength(1);
      expect(recorder.getHistory("motion-light")[0].outcome).toBe("success");
    });

    it("swallows a throwing completion listener and still rethrows only the original error on failure", async () => {
      const errorLogger = { error: mock(() => {}) } as unknown as typeof logger;
      const recorder = new ExecutionRecorder(errorLogger);
      recorder.onCompletion(() => {
        throw new Error("recording failed");
      });

      await expect(
        recorder.run("motion-light", cronTrigger(), async () => {
          throw new Error("original automation error");
        }),
      ).rejects.toThrow("original automation error");

      expect(errorLogger.error).toHaveBeenCalledTimes(1);
      expect(recorder.getHistory("motion-light")).toHaveLength(1);
      expect(recorder.getHistory("motion-light")[0].outcome).toBe("failure");
    });
  });

  describe("concurrent overlapping runs (design.md R9)", () => {
    it("attributes both runs of the same automation without loss or duplication", async () => {
      const recorder = new ExecutionRecorder(logger);
      const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

      await Promise.all([
        recorder.run("motion-light", cronTrigger("first"), async () => {
          await delay(10);
        }),
        recorder.run("motion-light", cronTrigger("second"), async () => {
          await delay(3);
        }),
      ]);

      const history = recorder.getHistory("motion-light");
      expect(history).toHaveLength(2);
      const expressions = history
        .map((r) => (r.trigger as { expression: string }).expression)
        .sort();
      expect(expressions).toEqual(["first", "second"]);
    });
  });
});
