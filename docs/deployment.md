# Deployment & Operations

Guides for running the engine in development, Docker, and production environments.

---

## Development

```bash
git clone https://github.com/Supporterino/TypeScript-Home-Automation.git
cd TypeScript-Home-Automation

bun install
cp .env.example .env
# Edit .env with your MQTT broker details

bun run dev    # Hot-reload — restarts on file changes
```

`bun run dev` uses `bun --watch` which monitors all imported files and restarts automatically on save.

---

## Docker (standalone)

The repo includes a `Dockerfile` and `docker-compose.yml` that run the engine alongside a Mosquitto MQTT broker.

### Quick start

```bash
bun run docker:build   # Build the image
bun run docker:up      # Start engine + Mosquitto
bun run docker:down    # Stop
```

### Exposing ports

The default `docker-compose.yml` does **not** expose the engine's HTTP port to the host. To access the web UI, debug API, or health probes from outside the container, add a `ports` mapping:

```yaml
services:
  home-automation:
    # ...existing config...
    ports:
      - "8080:8080"
```

### Environment variables

Pass configuration via the `environment` section in `docker-compose.yml`:

```yaml
environment:
  - TZ=Europe/Berlin
  - MQTT_HOST=mosquitto
  - HTTP_PORT=8080
  - HTTP_TOKEN=my-secret-token
  - WEB_UI_ENABLED=true
  - STATE_PERSIST=true
  - STATE_FILE_PATH=/data/state.json
  - DEVICE_REGISTRY_ENABLED=true
  - DEVICE_REGISTRY_PERSIST=true
  - DEVICE_REGISTRY_FILE_PATH=/data/device-registry.json
```

### Persistent data

Mount a volume for state and device registry persistence so data survives container restarts:

```yaml
services:
  home-automation:
    volumes:
      - ha-data:/data
    environment:
      - STATE_FILE_PATH=/data/state.json
      - DEVICE_REGISTRY_FILE_PATH=/data/device-registry.json

volumes:
  ha-data:
```

---

## Docker (consumer package)

If you use `ts-home-automation` as an npm package in your own project, create a minimal Dockerfile:

```dockerfile
FROM oven/bun:1
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

COPY src ./src
COPY tsconfig.json ./

EXPOSE 8080
CMD ["bun", "run", "src/index.ts"]
```

Pair it with a `docker-compose.yml` that provides the MQTT broker and any configuration you need.

---

## Kubernetes

The engine exposes health probes that integrate with Kubernetes pod lifecycle management.

### Pod manifest

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: home-automation
spec:
  containers:
    - name: engine
      image: your-registry/home-automation:latest
      ports:
        - containerPort: 8080
      env:
        - name: MQTT_HOST
          value: mosquitto.default.svc.cluster.local
        - name: HTTP_TOKEN
          valueFrom:
            secretKeyRef:
              name: ha-secrets
              key: http-token
        - name: STATE_PERSIST
          value: "true"
        - name: STATE_FILE_PATH
          value: /data/state.json
      volumeMounts:
        - name: data
          mountPath: /data
      livenessProbe:
        httpGet:
          path: /healthz
          port: 8080
        initialDelaySeconds: 5
        periodSeconds: 10
      readinessProbe:
        httpGet:
          path: /readyz
          port: 8080
        initialDelaySeconds: 10
        periodSeconds: 5
  volumes:
    - name: data
      persistentVolumeClaim:
        claimName: ha-data
```

### Probe details

| Probe | Path | Behaviour |
|---|---|---|
| Liveness | `GET /healthz` | Always returns 200 — confirms the process is alive |
| Readiness | `GET /readyz` | Returns 200 only when MQTT is connected and the engine has finished starting |

Both probes are unauthenticated — no `HTTP_TOKEN` required.

See [Health Probes](http/health-probes.md) for response format details.

---

## Production checklist

### Security

- **Set `HTTP_TOKEN`** to a strong, random value. Without it, the debug API and web UI are publicly accessible.
- **Never expose port 8080 directly to the internet.** Use a reverse proxy (nginx, Caddy, Traefik) with TLS termination.
- **Use environment variables or secrets** for sensitive configuration (MQTT credentials, API keys, tokens). Never commit `.env` files.

### Persistence

- Enable `STATE_PERSIST=true` so automations retain their state across restarts.
- Enable `DEVICE_REGISTRY_PERSIST=true` so the device list is available immediately on cold start (before Zigbee2MQTT sends the retained `bridge/devices` message).
- Back up `state.json` and `device-registry.json` periodically — they are plain JSON files.

### Logging

The engine uses [pino](https://getpino.io/) for structured logging:

- **Development:** Pretty-printed to stdout (when `NODE_ENV` is not `production`)
- **Production:** Newline-delimited JSON to stdout (when `NODE_ENV=production`)

Pipe stdout to your preferred log aggregator:

```bash
# Pipe to a file
bun run src/standalone.ts 2>&1 | tee /var/log/home-automation.log

# Pipe to a log shipper (e.g., Vector, Fluent Bit)
bun run src/standalone.ts | vector --config vector.toml
```

Log levels (set via `LOG_LEVEL`):

| Level | Numeric | Use case |
|---|---|---|
| `trace` | 10 | Verbose debugging (MQTT message dispatch, state comparisons) |
| `debug` | 20 | Development-time diagnostics |
| `info` | 30 | Normal operation (default) |
| `warn` | 40 | Recoverable issues (missing optional services, connection retries) |
| `error` | 50 | Failures that need attention |
| `fatal` | 60 | Unrecoverable errors |

Every log line includes structured fields for filtering:

```json
{"level":30,"time":1714500000000,"msg":"Motion detected","automation":"motion-light","sensor":"hallway"}
```

### In-memory log buffer

The engine maintains a ring buffer of the last 2500 log entries, queryable via:

- `GET /api/logs?automation=motion-light&level=40&limit=100`
- The web UI Logs tab
- `ts-ha logs` CLI command

This is purely in-memory — it does not persist across restarts and is not a substitute for a proper log aggregator in production.

---

## Monitoring

### Health endpoints

Use `/healthz` and `/readyz` for uptime monitoring with tools like [Uptime Kuma](https://github.com/louislam/uptime-kuma), Pingdom, or Kubernetes probes.

### MQTT broker monitoring

Monitor your Mosquitto broker separately:

```bash
# Check if Mosquitto is accepting connections
mosquitto_sub -h localhost -t '$SYS/broker/uptime' -C 1
```

### Resource usage

The engine is single-threaded (Bun's event loop). Typical resource usage:

- **Memory:** 50–150 MB depending on automation count and device registry size
- **CPU:** Near-zero when idle; brief spikes during MQTT message bursts
- **Disk:** State and device registry files are small (< 1 MB typically)

---

## Graceful shutdown

The engine handles `SIGINT` and `SIGTERM` for graceful shutdown. The sequence:

1. All automations receive `onStop()` — clear timers, release resources
2. Service plugins receive `onStop()`
3. State is saved to disk (if `STATE_PERSIST=true`)
4. Device registry is saved to disk (if `DEVICE_REGISTRY_PERSIST=true`)
5. MQTT disconnects cleanly
6. HTTP server stops

In Docker, set `stop_grace_period` to allow time for cleanup:

```yaml
services:
  home-automation:
    stop_grace_period: 10s
```

---

## Scaling considerations

The engine is designed as a **single-process, single-instance** application. This is intentional:

- **MQTT subscriptions** are stateful — multiple instances would receive duplicate messages
- **State store** is in-memory — multiple instances would have inconsistent state
- **HomeKit bridge** binds to a specific port and MAC address

If you need to handle more devices or automations, scale **vertically** (more CPU/RAM on the same host). The engine is lightweight enough that a Raspberry Pi 4 can handle hundreds of automations and devices.

For **high availability**, use Docker restart policies (`unless-stopped` or `always`) or a Kubernetes Deployment with `replicas: 1` and a `PersistentVolumeClaim` for state data.
