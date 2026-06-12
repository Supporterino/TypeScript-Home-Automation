# HTTP Client

## Purpose

A typed wrapper around the global `fetch` API with structured pino logging, automatic retries with exponential backoff, request timeouts, and convenience methods. Shared by all services that make outbound HTTP requests.

## Requirements

### Request Execution

`request<T>(url, options?): Promise<HttpResponse<T>>` MUST:
- Accept `HttpRequestOptions`:
  ```ts
  interface HttpRequestOptions {
    method?: string;          // HTTP method (default: "GET")
    headers?: Record<string, string>;
    body?: unknown;           // Any JSON-serializable value
    timeout?: number;         // Request timeout in ms
    retries?: number;         // Max retry attempts (default: 3)
    retryDelay?: number;      // Base delay in ms for backoff (default: 1000)
    signal?: AbortSignal;     // External abort signal
    sensitiveQueryParams?: string[]; // Query params to mask in logs
  }
  ```

- Return `HttpResponse<T>`:
  ```ts
  interface HttpResponse<T> {
    ok: boolean;       // status 200-299
    status: number;    // HTTP status code
    data: T;           // Parsed response body
    headers: Record<string, string>;
  }
  ```

### Convenience Methods

The system MUST provide shorthand methods:
- `get<T>(url, options?)` — `method: "GET"`
- `post<T>(url, body?, options?)` — `method: "POST"`, body serialized
- `put(url, body?, options?)` — `method: "PUT"`
- `patch<T>(url, body?, options?)` — `method: "PATCH"`
- `del<T>(url, options?)` — `method: "DELETE"`

### Retry Behavior

The system MUST implement exponential backoff retries:
1. On request failure (network error or non-2xx response), wait `retryDelay * 2^attempt`
2. Retry up to `retries` times
3. If all retries fail, return the last response (or throw on network error)
4. Do NOT retry on timeout or abort

### Timeout

The system MUST support request timeout via `AbortController`. If `timeout` is set, the request is aborted after the specified milliseconds. A timeout counts as a network failure subject to retry logic.

### Logging

Every request MUST log:
- `debug`: Request sent with `{ method, url, status, durationMs }`
- `error`: Request failed with `{ err, url, method }`
- Sensitive query parameters (listed in `sensitiveQueryParams`) MUST be masked in logs: `"***"`

### JSON Handling

The system MUST:
- Auto-serialize body to JSON with `Content-Type: application/json`
- Auto-parse JSON response bodies
- Handle non-JSON responses gracefully (return as `data` field)
- Handle empty responses (`204 No Content`) — return `data` as `null` or `undefined`

### Shared Instance

The engine creates a single shared `HttpClient` instance with a `{ service: "http" }` scoped child logger. All services receive this shared instance via their factory function or constructor.
