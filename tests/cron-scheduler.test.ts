import { beforeEach, describe, expect, it } from "bun:test";
import pino from "pino";
import { CronScheduler } from "../src/core/scheduling/cron-scheduler.js";

const logger = pino({ level: "silent" });

describe("CronScheduler", () => {
  let cron: CronScheduler;

  beforeEach(() => {
    cron = new CronScheduler(logger);
  });

  it("schedules a job without throwing", () => {
    expect(() => {
      cron.schedule("test:job", "* * * * *", () => {});
    }).not.toThrow();
    cron.stopAll();
  });

  it("removes a job by id", () => {
    cron.schedule("test:remove", "* * * * *", () => {});
    // Should not throw
    cron.remove("test:remove");
    cron.stopAll();
  });

  it("removes jobs by prefix", () => {
    cron.schedule("auto1:cron:0", "* * * * *", () => {});
    cron.schedule("auto1:cron:1", "*/5 * * * *", () => {});
    cron.schedule("auto2:cron:0", "0 * * * *", () => {});

    cron.removeByPrefix("auto1:");
    // auto2 should still be schedulable (no crash on stopAll)
    cron.stopAll();
  });

  it("stopAll clears all jobs", () => {
    cron.schedule("a:0", "* * * * *", () => {});
    cron.schedule("b:0", "*/2 * * * *", () => {});
    cron.stopAll();
    // Calling stopAll again should be safe
    cron.stopAll();
  });

  it("rejects invalid cron expressions", () => {
    expect(() => {
      cron.schedule("bad:job", "not a cron", () => {});
    }).toThrow();
  });

  describe("error handling", () => {
    // Access the internal jobs map to fire a job's onTick directly, since we
    // cannot wait for a real cron schedule in a unit test.
    function fireJob(id: string): void {
      const jobs = (cron as unknown as { jobs: Map<string, { job: { fireOnTick: () => void } }> })
        .jobs;
      const entry = jobs.get(id);
      if (!entry) throw new Error(`job ${id} not found`);
      entry.job.fireOnTick();
    }

    it("catches an async rejection from a callback without unhandled rejection", async () => {
      let sawError = false;
      const original = process.listeners("unhandledRejection");
      const onUnhandled = () => {
        sawError = true;
      };
      process.on("unhandledRejection", onUnhandled);

      let called = false;
      cron.schedule("reject:job", "* * * * *", async () => {
        called = true;
        throw new Error("async boom");
      });
      fireJob("reject:job");

      // Let microtasks + a tick settle so any unhandled rejection would surface.
      await new Promise((resolve) => setTimeout(resolve, 20));

      process.off("unhandledRejection", onUnhandled);
      for (const l of original) {
        if (!process.listeners("unhandledRejection").includes(l)) {
          process.on("unhandledRejection", l as (...args: unknown[]) => void);
        }
      }

      expect(called).toBe(true);
      expect(sawError).toBe(false);
      cron.stopAll();
    });

    it("keeps other jobs running when one callback rejects", async () => {
      let otherRan = false;
      cron.schedule("bad:job2", "* * * * *", async () => {
        throw new Error("boom");
      });
      cron.schedule("good:job", "* * * * *", () => {
        otherRan = true;
      });

      fireJob("bad:job2");
      fireJob("good:job");
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(otherRan).toBe(true);
      cron.stopAll();
    });
  });

  describe("re-scheduling", () => {
    it("stops the old job when an existing id is re-scheduled", () => {
      const jobs = (cron as unknown as { jobs: Map<string, { job: { stop: () => void } }> }).jobs;

      cron.schedule("dup:job", "* * * * *", () => {});
      const firstJob = jobs.get("dup:job")?.job;
      if (!firstJob) throw new Error("first job not scheduled");
      let stopped = false;
      const originalStop = firstJob.stop.bind(firstJob);
      firstJob.stop = () => {
        stopped = true;
        originalStop();
      };

      cron.schedule("dup:job", "*/5 * * * *", () => {});

      expect(stopped).toBe(true);
      // The map should hold the new job, not the old one.
      expect(jobs.get("dup:job")?.job).not.toBe(firstJob);
      cron.stopAll();
    });
  });
});
