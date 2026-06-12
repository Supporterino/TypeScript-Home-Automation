# Notifications

## Purpose

Push notification delivery via ntfy.sh (public or self-hosted). Automations call `this.notify()` to send alerts, and the engine routes them through the configured notification service. No-ops gracefully when no service is configured.

## Requirements

### Notification Service Interface

The system MUST define a `NotificationService` interface:
```ts
interface NotificationService {
  send(options: NotificationOptions): Promise<void>;
}
```

### Notification Options

```ts
interface NotificationOptions {
  title: string;         // Notification title
  message: string;       // Notification body
  priority?: NotificationPriority;  // default: "default"
  tags?: string[];       // Tag list (joined with commas)
  channel?: string;      // Logical channel name (routed via channels map)
}

type NotificationPriority = "min" | "low" | "default" | "high" | "urgent";
```

### ntfy.sh Implementation

The `NtfyNotificationService` MUST implement `NotificationService`.

#### Configuration

```ts
interface NtfyConfig {
  url?: string;          // ntfy server URL (default: "https://ntfy.sh")
  topic: string;         // Default topic to publish to
  channels?: Record<string, string>;  // Channel name → topic mapping
  token?: string;        // Bearer token for access-controlled topics
  http: HttpClient;      // Injected by engine
  logger: Logger;        // Injected by engine
}
```

#### Message Delivery

`send(options)` MUST:
1. Resolve the target topic:
   - If `channel` is set, look up in `channels` map
   - If found, use the mapped topic
   - If not found, log warning and fall back to default topic
2. Set ntfy headers:
   - `Content-Type: text/plain`
   - `Title: <title>`
   - `Priority: <priority>` 
   - `Tags: <tags>` (comma-separated, only if tags present)
   - `Authorization: Bearer <token>` (only if token is set)
3. POST message body as plain text to `{url}/{topic}`
4. Log info on success, error on non-OK, error on network failure
5. Never throw — all failures are caught and logged

### Automation Convenience

The `Automation` base class MUST provide:
```ts
protected async notify(options: NotificationOptions): Promise<void>
```
This method:
- Retrieves the notification service from the registry
- Logs a warning and no-ops if no service is configured
- Delegates to `service.send()` otherwise

### Engine Integration

The engine registers the notification service under the `"notifications"` key in the `ServiceRegistry`. It is exposed as `engine.notifications` (nullable getter) for external access.
