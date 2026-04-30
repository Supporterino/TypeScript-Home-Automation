import { CronJob } from "cron";
import type { Logger } from "pino";

interface ScheduledJob {
  id: string;
  expression: string;
  job: CronJob;
}

/** @internal */
export class CronScheduler {
  private readonly jobs: Map<string, ScheduledJob> = new Map();
  private readonly timeZone: string | undefined;

  constructor(private readonly logger: Logger) {
    // Empty TZ string is treated as unset (use system default)
    this.timeZone = process.env.TZ || undefined;
    this.logger.info(
      {
        timeZone: this.timeZone ?? "system default",
        systemTime: new Date().toISOString(),
        localHour: new Date().getHours(),
      },
      "Cron scheduler initialized",
    );
  }

  /**
   * Schedule a cron job.
   *
   * @param id Unique identifier for the job (typically automation name + trigger index)
   * @param expression Cron expression (e.g. "0 7 * * *" for daily at 7 AM)
   * @param callback Function to execute when the cron fires
   */
  schedule(id: string, expression: string, callback: () => void): void {
    const job = CronJob.from({
      cronTime: expression,
      onTick: () => {
        this.logger.debug({ id, expression }, "Cron job triggered");
        try {
          callback();
        } catch (err) {
          this.logger.error({ err, id }, "Error in cron job handler");
        }
      },
      start: true,
      timeZone: this.timeZone,
    });

    this.jobs.set(id, { id, expression, job });
    this.logger.info({ id, expression }, "Cron job scheduled");
  }

  /**
   * Remove a scheduled job by id.
   */
  remove(id: string): void {
    const entry = this.jobs.get(id);
    if (entry) {
      entry.job.stop();
      this.jobs.delete(id);
      this.logger.debug({ id }, "Cron job removed");
    }
  }

  /**
   * Remove all jobs matching a prefix (e.g. all jobs for an automation).
   */
  removeByPrefix(prefix: string): void {
    let count = 0;
    for (const [id, entry] of this.jobs) {
      if (id.startsWith(prefix)) {
        entry.job.stop();
        this.jobs.delete(id);
        count++;
      }
    }
    if (count > 0) {
      this.logger.debug({ prefix, count }, "Cron jobs removed by prefix");
    }
  }

  /**
   * Stop all scheduled jobs.
   */
  stopAll(): void {
    for (const entry of this.jobs.values()) {
      entry.job.stop();
    }
    this.logger.info({ count: this.jobs.size }, "All cron jobs stopped");
    this.jobs.clear();
  }
}
