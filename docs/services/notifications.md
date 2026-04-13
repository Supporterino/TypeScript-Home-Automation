# Notifications

The engine supports an optional notification service for sending push notifications from automations. The `NotificationService` interface is abstract — a built-in ntfy.sh implementation is provided, and you can implement your own for any provider.

---

## Built-in: ntfy.sh

[ntfy](https://ntfy.sh/) is a free, open-source push notification service. You can use the hosted service at `ntfy.sh` or self-host your own instance.

```ts
import { createEngine, NtfyNotificationService } from "ts-home-automation";

const engine = createEngine({
  automationsDir: "./src/automations",
  notifications: (http, logger) =>
    new NtfyNotificationService({
      topic: "my-home-alerts",
      http,
      logger,
      // Optional: self-hosted instance
      // url: "https://ntfy.example.com",
      // Optional: authentication token
      // token: "tk_xxxxxxxxxxxxxxxxxxxx",
    }),
});
```

---

## Using in automations

```ts
// Simple notification
await this.notify({
  title: "Front door opened",
  message: "Front door was opened while nobody is home",
});

// With priority and tags
await this.notify({
  title: "Water leak detected!",
  message: "Sensor under the kitchen sink triggered",
  priority: "urgent",
  tags: ["warning", "water"],
});
```

If no notification service is configured, `this.notify()` logs a warning and does nothing — automations are safe to call it unconditionally.

### Notification options

| Field | Type | Default | Description |
|---|---|---|---|
| `title` | `string` | required | Notification title |
| `message` | `string` | required | Notification body |
| `priority` | `"min" \| "low" \| "default" \| "high" \| "urgent"` | `"default"` | Delivery priority |
| `tags` | `string[]` | `[]` | Tags / emoji shortcuts (e.g. `["warning", "rotating_light"]`) |

---

## Custom implementation

Implement `NotificationService` to integrate any provider (Telegram, Pushover, Home Assistant, etc.):

```ts
import type { NotificationService, NotificationOptions } from "ts-home-automation";

class TelegramNotifications implements NotificationService {
  async send(options: NotificationOptions): Promise<void> {
    const text = `*${options.title}*\n${options.message}`;
    await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: "Markdown" }),
    });
  }
}

const engine = createEngine({
  automationsDir: "...",
  notifications: new TelegramNotifications(),
});
```

You can also pass a factory function that receives the shared HTTP client and logger:

```ts
notifications: (http, logger) => new TelegramNotifications(http, logger),
```
