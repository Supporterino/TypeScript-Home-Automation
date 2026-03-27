import type { Logger } from "pino";
import type { HttpClient } from "./http-client.js";
import type { NotificationOptions, NotificationService } from "./notification-service.js";

/**
 * Configuration for the ntfy.sh notification service.
 */
export interface NtfyConfig {
  /** ntfy.sh server URL (default: "https://ntfy.sh"). */
  url?: string;
  /** Topic to publish notifications to. */
  topic: string;
  /** Optional: bearer token for access-controlled topics. */
  token?: string;
  /** HTTP client instance (injected by the engine). */
  http: HttpClient;
  /** Logger instance (injected by the engine). */
  logger: Logger;
}

/**
 * Notification service implementation using ntfy.sh.
 *
 * Sends push notifications via HTTP POST to a ntfy.sh server (public or
 * self-hosted). Messages are sent as plain text with headers for title,
 * priority, and tags.
 *
 * @example
 * ```ts
 * import { createEngine, NtfyNotificationService } from "ts-home-automation";
 *
 * // The engine provides http and logger automatically:
 * const engine = createEngine({
 *   automationsDir: "...",
 *   notifications: (http, logger) =>
 *     new NtfyNotificationService({
 *       topic: "my-home-alerts",
 *       http,
 *       logger,
 *     }),
 * });
 * ```
 *
 * @see https://docs.ntfy.sh/publish/
 */
export class NtfyNotificationService implements NotificationService {
  private readonly url: string;
  private readonly topic: string;
  private readonly token?: string;
  private readonly http: HttpClient;
  private readonly logger: Logger;

  constructor(config: NtfyConfig) {
    this.url = config.url ?? "https://ntfy.sh";
    this.topic = config.topic;
    this.token = config.token;
    this.http = config.http;
    this.logger = config.logger;
  }

  async send(options: NotificationOptions): Promise<void> {
    const { title, message, priority = "default", tags = [] } = options;

    const headers: Record<string, string> = {
      "Content-Type": "text/plain",
      Title: title,
      Priority: priority,
    };

    if (tags.length > 0) {
      headers.Tags = tags.join(",");
    }

    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }

    const endpoint = `${this.url}/${this.topic}`;

    this.logger.debug({ title, priority, tags, endpoint }, "Sending ntfy.sh notification");

    try {
      const response = await this.http.request(endpoint, {
        method: "POST",
        headers,
        body: message,
      });

      if (response.ok) {
        this.logger.info({ title, priority }, "Notification sent via ntfy.sh");
      } else {
        this.logger.error({ status: response.status, title }, "ntfy.sh returned non-OK status");
      }
    } catch (err) {
      this.logger.error({ err, title }, "Failed to send ntfy.sh notification");
    }
  }
}
