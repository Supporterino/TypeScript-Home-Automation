import {
  Automation,
  type Trigger,
  type TriggerContext,
} from "../core/automation.js";

/**
 * Example: Fetch weather data on a cron schedule and log it.
 *
 * - Trigger: Runs every day at 8:00 AM
 * - Action:  Fetches weather data from a public API and logs the result
 *
 * This demonstrates:
 * - Cron-based triggers
 * - Using the HTTP client for outbound API calls
 * - Processing external data in an automation
 *
 * Replace the API URL and logic with whatever makes sense for your setup
 * (e.g. POST to a webhook, send a notification, etc.).
 */
export default class ScheduledReport extends Automation {
  readonly name = "scheduled-report";

  readonly triggers: Trigger[] = [
    {
      type: "cron",
      // Every day at 8:00 AM
      expression: "0 8 * * *",
    },
  ];

  async execute(context: TriggerContext): Promise<void> {
    if (context.type !== "cron") return;

    this.logger.info("Running scheduled weather report");

    try {
      // Example: fetch weather from wttr.in (no API key needed)
      const response = await this.http.get<{ current_condition: unknown[] }>(
        "https://wttr.in/?format=j1",
      );

      if (response.ok) {
        this.logger.info({ weather: response.data }, "Weather report fetched");
      } else {
        this.logger.warn(
          { status: response.status },
          "Weather API returned non-OK status",
        );
      }
    } catch (err) {
      this.logger.error({ err }, "Failed to fetch weather report");
    }
  }
}
