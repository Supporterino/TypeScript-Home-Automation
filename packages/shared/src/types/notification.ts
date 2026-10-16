/**
 * Notification priority levels.
 */
export type NotificationPriority = "min" | "low" | "default" | "high" | "urgent";

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
  /** Named destination channel, provider-specific in meaning; omit for the default. */
  channel?: string;
}

/**
 * Abstract interface for notification services.
 */
export interface NotificationService {
  /**
   * Sends a notification; implementations should handle errors gracefully.
   */
  send(options: NotificationOptions): Promise<void>;
}
