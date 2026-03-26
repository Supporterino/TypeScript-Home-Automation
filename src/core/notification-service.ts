/**
 * Notification priority levels.
 */
export type NotificationPriority =
  | "min"
  | "low"
  | "default"
  | "high"
  | "urgent";

/**
 * Options for sending a notification.
 */
export interface NotificationOptions {
  /** Notification title. */
  title: string;
  /** Notification body message. */
  message: string;
  /** Priority level (defaults to "default"). */
  priority?: NotificationPriority;
  /** Tags / emoji shortcodes (e.g. ["warning", "thermometer"]). */
  tags?: string[];
}

/**
 * Abstract interface for notification services.
 *
 * Implement this interface to integrate any push notification provider
 * (ntfy.sh, Pushover, Telegram, email, etc.) into the automation engine.
 *
 * The engine accepts an optional `NotificationService` — if none is
 * provided, `this.notify` in automations will be a no-op that logs
 * a warning.
 *
 * @example
 * ```ts
 * import { createEngine, NtfyNotificationService } from "ts-home-automation";
 *
 * const engine = createEngine({
 *   automationsDir: "...",
 *   notifications: new NtfyNotificationService({
 *     url: "https://ntfy.sh",
 *     topic: "my-home-alerts",
 *   }),
 * });
 * ```
 */
export interface NotificationService {
  /**
   * Send a notification.
   *
   * Implementations should handle errors gracefully and not throw
   * unless the failure is unrecoverable.
   */
  send(options: NotificationOptions): Promise<void>;
}
