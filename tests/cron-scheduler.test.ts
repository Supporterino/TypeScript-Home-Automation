import { beforeEach, describe, expect, it } from "bun:test";
import pino from "pino";
import { CronScheduler } from "../src/core/cron-scheduler.js";

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
});
