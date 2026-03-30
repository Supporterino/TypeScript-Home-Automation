import { CronJob } from "cron";
import type { Logger } from "pino";

interface ScheduledJob {
  id: string;
  expression: string;
  job: CronJob;
}

export class CronScheduler {
  private jobs: ScheduledJob[] = [];
  private readonly timeZone: string | undefined;

  constructor(private readonly logger: Logger) {
    this.timeZone = process.env.TZ || undefined;
    if (this.timeZone) {
      this.logger.info({ timeZone: this.timeZone }, "Cron scheduler using timezone");
    }
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

    this.jobs.push({ id, expression, job });
    this.logger.info({ id, expression }, "Cron job scheduled");
  }

  /**
   * Remove a scheduled job by id.
   */
  remove(id: string): void {
    const index = this.jobs.findIndex((j) => j.id === id);
    if (index !== -1) {
      this.jobs[index].job.stop();
      this.jobs.splice(index, 1);
      this.logger.debug({ id }, "Cron job removed");
    }
  }

  /**
   * Remove all jobs matching a prefix (e.g. all jobs for an automation).
   */
  removeByPrefix(prefix: string): void {
    const toRemove = this.jobs.filter((j) => j.id.startsWith(prefix));
    for (const job of toRemove) {
      job.job.stop();
    }
    this.jobs = this.jobs.filter((j) => !j.id.startsWith(prefix));
    if (toRemove.length > 0) {
      this.logger.debug({ prefix, count: toRemove.length }, "Cron jobs removed by prefix");
    }
  }

  /**
   * Stop all scheduled jobs.
   */
  stopAll(): void {
    for (const job of this.jobs) {
      job.job.stop();
    }
    this.logger.info({ count: this.jobs.length }, "All cron jobs stopped");
    this.jobs = [];
  }
}
