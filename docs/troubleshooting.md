# Troubleshooting & FAQ

Common issues, debugging tips, and frequently asked questions.

---

## Setup issues

### MQTT connection fails

**Symptoms:** Engine starts but logs `MQTT connection error` or `MQTT offline` repeatedly.

**Checklist:**

1. **Verify the broker is running:**

    ```bash
    mosquitto_sub -h localhost -t '$SYS/broker/uptime' -C 1
    ```

2. **Check `MQTT_HOST` and `MQTT_PORT`** — `localhost` won't work from inside a Docker container; use the service name (e.g. `mosquitto`) or the host IP.

3. **Authentication** — if your broker requires credentials, set `MQTT_USERNAME` and `MQTT_PASSWORD` in your `.env`.

4. **Firewall** — ensure port 1883 (or your custom port) is open between the engine and the broker.

5. **Zigbee2MQTT prefix** — verify `ZIGBEE2MQTT_PREFIX` matches your Zigbee2MQTT configuration (default: `zigbee2mqtt`).

### Engine starts but no automations load

**Checklist:**

1. **`automationsDir` path** — must be an absolute path or resolvable relative path. Use `import.meta.url` for reliable resolution:

    ```ts
    automationsDir: new URL("./automations", import.meta.url).pathname,
    ```

2. **Default export** — each automation file must export the class as the default export:

    ```ts
    export default class MyAutomation extends Automation { /* ... */ }
    ```

3. **File extensions** — the engine scans for `.ts` and `.js` files only. Files ending in `.d.ts` are excluded.

4. **Recursive scanning** — if automations are in subdirectories, set `AUTOMATIONS_RECURSIVE=true` or pass `recursive: true` to `createEngine()`.

5. **Runtime errors** — check the logs for import errors or constructor exceptions. Set `LOG_LEVEL=debug` for more detail.

### TypeScript compilation errors

- **Missing `.js` extensions** — relative imports must include the `.js` extension:

    ```ts
    // Correct
    import { MyHelper } from "./helpers/utils.js";

    // Wrong — will fail at runtime
    import { MyHelper } from "./helpers/utils";
    ```

- **Node built-ins** — use the `node:` prefix:

    ```ts
    import { readFile } from "node:fs/promises";
    ```

- **tsconfig.json** — ensure `moduleResolution` is set to `"bundler"` and `module` to `"ESNext"`.

---

## Runtime issues

### Automation doesn't fire

**MQTT trigger not firing:**

1. Verify the topic is correct — use `mosquitto_sub` to confirm messages are arriving:

    ```bash
    mosquitto_sub -h localhost -t 'zigbee2mqtt/my_sensor' -v
    ```

2. Check the **filter function** — if defined, it must return `true` for the trigger to fire. Remove the filter temporarily to confirm the trigger itself works.

3. **Wildcard topics** — `+` matches exactly one level, `#` matches zero or more remaining levels. `zigbee2mqtt/+/set` matches `zigbee2mqtt/bulb/set` but not `zigbee2mqtt/room/bulb/set`.

**State trigger not firing:**

- `StateManager.set()` only fires listeners when the value **actually changes**. Primitives use strict equality (`===`); objects use `JSON.stringify` comparison. Setting the same value again is a no-op.
- Object key order matters: `{ a: 1, b: 2 }` and `{ b: 2, a: 1 }` produce different `JSON.stringify` output and will trigger a change even though they are semantically equal.

**Cron trigger not firing:**

- Check the `TZ` environment variable — cron expressions are evaluated in this timezone.
- Verify the expression at [crontab.guru](https://crontab.guru/).

**Device triggers not firing:**

- Ensure `DEVICE_REGISTRY_ENABLED=true` is set. Without it, `device_state`, `device_joined`, and `device_left` triggers are silently skipped at startup (a warning is logged).

### Web UI not accessible

1. **Enable it:** `WEB_UI_ENABLED=true`
2. **Check the port:** `HTTP_PORT` must be non-zero (default: 8080). Set to `0` disables the entire HTTP server.
3. **Check the path:** Default is `/status` — navigate to `http://localhost:8080/status`.
4. **Authentication:** If `HTTP_TOKEN` is set, you must log in at `/status/login` first.
5. **Docker:** Ensure the port is mapped (`-p 8080:8080`).

### HomeKit pairing fails

- **Port conflict:** The HomeKit bridge binds to port 47128 by default. Ensure nothing else is using it.
- **mDNS on Docker/Linux:** HAP-NodeJS uses mDNS (Bonjour) for discovery. In Docker, use `network_mode: host` or ensure mDNS is properly bridged.
- **Pairing code:** Use the PIN code configured in the `HomekitService` options (format: `"XXX-XX-XXX"`).
- **Reset pairing:** Delete the `homekit-persist/` directory and restart to clear stale pairing data.

---

## Debugging

### Enable debug logging

```bash
LOG_LEVEL=debug bun run dev
```

At `debug` level, the engine logs:

- Every MQTT message received and dispatched
- State changes with old and new values
- HTTP requests with URLs (sensitive params masked) and response times
- Automation lifecycle events (register, start, stop)
- Service plugin lifecycle events

### Query the log buffer

The engine keeps the last 2500 log entries in memory. Query them via the API:

```bash
# All logs
curl -H "Authorization: Bearer $TOKEN" http://localhost:8080/api/logs

# Filter by automation
curl http://localhost:8080/api/logs?automation=motion-light&limit=50

# Filter by level (40 = warn and above)
curl http://localhost:8080/api/logs?level=40
```

### CLI inspection

```bash
# Check if the engine is running and healthy
ts-ha config list
ts-ha state list

# View live logs with follow mode
ts-ha logs -f

# Filter logs by automation
ts-ha logs --automation motion-light --level warn

# Interactive dashboard
ts-ha dashboard
```

### Manual trigger

Test an automation without waiting for its trigger:

```bash
# Via CLI
ts-ha automations trigger motion-light --type mqtt \
  --topic "zigbee2mqtt/test" --payload '{"occupancy": true}'

# Via API
curl -X POST http://localhost:8080/api/automations/motion-light/trigger \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"type": "mqtt", "topic": "manual/test", "payload": {"occupancy": true}}'
```

---

## Performance tips

### MQTT subscription efficiency

- **Prefer exact topics** over wildcard patterns. Exact-match subscriptions use O(1) `Map` lookup; wildcard subscriptions require linear scanning.
- **Use `filter` functions** to discard irrelevant messages early, before `execute()` is called.

### State listener cleanup

- Always remove event listeners in `onStop()` to prevent memory leaks:

    ```ts
    private handler = (key: string, val: unknown) => { /* ... */ };

    async onStart() {
      this.state.onChange("my_key", this.handler);
    }

    async onStop() {
      this.state.offChange("my_key", this.handler);
    }
    ```

- The engine warns when more than 10 listeners are registered for a single state key — this usually indicates a leak.

### Timer cleanup

Always clear timers in `onStop()`:

```ts
private timer: ReturnType<typeof setTimeout> | null = null;

async onStop() {
  if (this.timer) {
    clearTimeout(this.timer);
    this.timer = null;
  }
}
```

---

## Known limitations

- **Single instance only** — the engine is not designed for horizontal scaling. Running multiple instances against the same MQTT broker will cause duplicate message processing.
- **No hot-reload of automations** — adding or modifying automation files requires an engine restart (use `bun run dev` for file-watch restart during development).
- **State persistence is not atomic during operation** — state is only saved on shutdown. A crash or `kill -9` may lose recent state changes. For critical state, consider writing to the state file more frequently by calling `this.state.save()` manually (though this is not part of the public API contract).
- **Web UI is not a full SCADA system** — it provides monitoring and basic control. For complex dashboards, use Grafana or Home Assistant alongside this framework.
- **HomeKit accessory limit** — HAP-NodeJS supports up to ~150 accessories per bridge. For larger setups, consider running multiple bridges on different ports.

---

## FAQ

### Can I use Node.js instead of Bun?

The framework is built for and tested on [Bun](https://bun.sh/). It uses Bun-specific APIs (`Bun.serve()`, `Bun.file()`, `Bun.build()`). Node.js is not supported.

### Can I use this without Zigbee2MQTT?

Yes. The MQTT service connects to any MQTT broker. You can subscribe to arbitrary topics and publish to any topic — Zigbee2MQTT is not required. The `publishToDevice()` helper and device registry are Zigbee2MQTT-specific, but the core trigger system works with any MQTT data source.

### How do I run multiple automation directories?

The engine supports a single `automationsDir`. To organise automations in subdirectories, set `AUTOMATIONS_RECURSIVE=true` or pass `recursive: true` to `createEngine()`.

### Can I register automations programmatically?

Yes. Instead of file-based discovery, instantiate automations and register them manually:

```ts
const engine = createEngine({ automationsDir: "./empty-dir" });
await engine.start();
await engine.manager.register(new MyAutomation());
```

### How do I update to a new version?

```bash
bun update ts-home-automation
```

Check the [release notes](https://github.com/Supporterino/TypeScript-Home-Automation/releases) for breaking changes. The package follows semantic versioning.

### Where are logs stored?

Logs are written to **stdout only**. There is no built-in file logging. Use your OS or container runtime to capture stdout to files if needed. The in-memory log buffer (2500 entries) is for the API and web UI — it does not persist across restarts.

### How do I add authentication to webhooks?

Webhook endpoints (`/webhook/*`) are unauthenticated by default. If you need authentication, validate the request inside your automation's `execute()` method:

```ts
async execute(context: TriggerContext): Promise<void> {
  if (context.type !== "webhook") return;

  const token = context.headers["x-webhook-secret"];
  if (token !== "my-secret") {
    this.logger.warn("Unauthorized webhook attempt");
    return;
  }
  // ... handle the webhook
}
```

### Can I use this with Home Assistant?

Yes, as a complement. Both can connect to the same MQTT broker. This framework handles automations in TypeScript while Home Assistant handles its own automations, dashboards, and integrations. They coexist without conflict as long as they don't send conflicting commands to the same devices simultaneously.
