# Health Probes

The engine includes an HTTP server (enabled by default on port 8080) that exposes health probe endpoints. These are designed for use with Kubernetes, Docker Compose, and any other orchestrator that supports HTTP health checks.

Set `HTTP_PORT=0` to disable the HTTP server entirely (also disables webhook triggers and the web status page).

---

## Endpoints

| Endpoint | Purpose | Success | Failure |
|---|---|---|---|
| `GET /healthz` | Liveness — is the process alive? | `200 OK` always | Process is dead |
| `GET /readyz` | Readiness — is the engine ready to handle traffic? | `200 OK` when all checks pass | `503 Service Unavailable` with failed checks |

Health probe endpoints are always unauthenticated — even when `HTTP_TOKEN` is configured — for Kubernetes compatibility.

---

## Readiness checks

The `/readyz` endpoint verifies:

- **`mqtt`** — MQTT client is connected to the broker
- **`engine`** — the engine has completed startup

### Success response (200)

```json
{
  "status": "ready",
  "checks": {
    "mqtt": true,
    "engine": true
  },
  "startedAt": 1712998800000,
  "tz": "Europe/Berlin"
}
```

### Failure response (503)

```json
{
  "status": "not ready",
  "checks": {
    "mqtt": false,
    "engine": true
  }
}
```

---

## Kubernetes example

```yaml
livenessProbe:
  httpGet:
    path: /healthz
    port: 8080
  initialDelaySeconds: 5
  periodSeconds: 10
  failureThreshold: 3

readinessProbe:
  httpGet:
    path: /readyz
    port: 8080
  initialDelaySeconds: 10
  periodSeconds: 5
  failureThreshold: 3
```

---

## Docker Compose

The included `docker-compose.yml` configures a healthcheck automatically using `/readyz`:

```yaml
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:8080/readyz"]
  interval: 30s
  timeout: 5s
  retries: 3
  start_period: 10s
```
