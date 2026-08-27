import { describe, expect, it } from "bun:test";
import {
  currentAutomationName,
  runInAutomationContext,
} from "../src/core/observability/execution-context.js";

/** A microtask-yielding delay, so assertions genuinely exercise `await`. */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("execution-context", () => {
  it("returns null outside any execution context", () => {
    expect(currentAutomationName()).toBeNull();
  });

  it("reports the automation name synchronously inside the context", () => {
    runInAutomationContext("motion-light", () => {
      expect(currentAutomationName()).toBe("motion-light");
    });
  });

  it("survives an await inside the context (task 8.1)", async () => {
    await runInAutomationContext("motion-light", async () => {
      await delay(5);
      expect(currentAutomationName()).toBe("motion-light");
    });
  });

  it("is null again once the context has exited", async () => {
    await runInAutomationContext("motion-light", async () => {
      await delay(1);
    });
    expect(currentAutomationName()).toBeNull();
  });

  it("does not cross-attribute between two concurrent contexts (task 8.1)", async () => {
    const observedInA: (string | null)[] = [];
    const observedInB: (string | null)[] = [];

    const runA = runInAutomationContext("automation-a", async () => {
      observedInA.push(currentAutomationName());
      await delay(10);
      observedInA.push(currentAutomationName());
      await delay(5);
      observedInA.push(currentAutomationName());
    });

    const runB = runInAutomationContext("automation-b", async () => {
      observedInB.push(currentAutomationName());
      await delay(3);
      observedInB.push(currentAutomationName());
      await delay(8);
      observedInB.push(currentAutomationName());
    });

    await Promise.all([runA, runB]);

    expect(observedInA).toEqual(["automation-a", "automation-a", "automation-a"]);
    expect(observedInB).toEqual(["automation-b", "automation-b", "automation-b"]);
  });

  it("nested calls without their own context inherit the enclosing one", async () => {
    async function helperService(): Promise<string | null> {
      await delay(1);
      return currentAutomationName();
    }

    const result = await runInAutomationContext("motion-light", () => helperService());
    expect(result).toBe("motion-light");
  });
});
