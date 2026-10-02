import type { Logger } from "pino";

export interface HttpRequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  headers?: Record<string, string>;
  body?: unknown;
  timeout?: number;
  /**
   * Number of retry attempts for transient failures (network errors, 5xx responses).
   * Retries use exponential backoff starting at 500ms.
   * @default 0
   */
  retries?: number;
}

export interface HttpResponse<T = unknown> {
  status: number;
  ok: boolean;
  headers: Headers;
  data: T;
}

/** Query parameter names whose values are masked in log output. */
const SENSITIVE_PARAMS = new Set(["appid", "apikey", "api_key", "token", "key", "secret"]);

/**
 * HTTP methods considered idempotent and therefore safe to retry on transient
 * failures. Non-idempotent methods (`POST`, `PATCH`) are never auto-retried, to
 * avoid duplicate side effects on the server.
 */
const IDEMPOTENT_METHODS = new Set(["GET", "HEAD", "PUT", "DELETE"]);

/**
 * Determine whether a URL path segment looks like an opaque credential token
 * (long hex/base64-ish string) that should be masked in logs.
 */
function looksLikeToken(segment: string): boolean {
  return segment.length >= 16 && /^[A-Za-z0-9_-]+$/.test(segment);
}

/**
 * Mask sensitive credentials in a URL for safe logging.
 *
 * Replaces values of known sensitive query parameter names with "***", and
 * masks token-like path segments (e.g. a Nanoleaf API token in
 * `/api/v1/{token}/...`) so credentials placed in the path are not written to
 * log output in plaintext.
 */
function sanitizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    let masked = false;

    for (const name of parsed.searchParams.keys()) {
      if (SENSITIVE_PARAMS.has(name.toLowerCase())) {
        parsed.searchParams.set(name, "***");
        masked = true;
      }
    }

    const segments = parsed.pathname.split("/");
    for (const [i, segment] of segments.entries()) {
      if (!segment) continue;
      // Mask credential-looking segments. The Nanoleaf token sits after
      // `api/v1`; a conservative long-token heuristic covers it while leaving
      // short benign endpoints (e.g. `/api/v1/status`) untouched.
      if (looksLikeToken(segment)) {
        segments[i] = "***";
        masked = true;
      }
    }
    if (masked) {
      parsed.pathname = segments.join("/");
    }

    return masked ? parsed.toString() : url;
  } catch {
    return url;
  }
}

export class HttpClient {
  constructor(private readonly logger: Logger) {}

  /**
   * Make an HTTP request. Uses Bun's native fetch under the hood.
   *
   * @param url The URL to request
   * @param options Request options (method, headers, body, timeout, retries)
   * @returns Typed response with parsed JSON body
   */
  async request<T = unknown>(
    url: string,
    options: HttpRequestOptions = {},
  ): Promise<HttpResponse<T>> {
    const { method = "GET", headers = {}, body, timeout = 30000, retries = 0 } = options;

    const safeUrl = sanitizeUrl(url);
    // Only idempotent methods are eligible for automatic retries.
    const maxAttempts = retries > 0 && IDEMPOTENT_METHODS.has(method) ? retries : 0;
    let lastError: unknown;

    for (let attempt = 0; attempt <= maxAttempts; attempt++) {
      if (attempt > 0) {
        // Exponential backoff with randomized jitter to avoid synchronized
        // retry storms (thundering herd), capped at the 10s ceiling.
        const base = Math.min(500 * 2 ** (attempt - 1), 10000);
        const delay = Math.min(base + Math.random() * base * 0.5, 10000);
        this.logger.debug({ url: safeUrl, method, attempt, delay }, "Retrying HTTP request");
        await new Promise((r) => setTimeout(r, delay));
      }

      const start = performance.now();
      this.logger.debug({ url: safeUrl, method }, "HTTP request");

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);

      let response: Response;
      let durationMs: number;
      // ----- Network attempt (retry-eligible) -----
      try {
        const fetchOptions: RequestInit = {
          method,
          headers: {
            "Content-Type": "application/json",
            ...headers,
          },
          signal: controller.signal,
        };

        if (body !== undefined) {
          fetchOptions.body = typeof body === "string" ? body : JSON.stringify(body);
        }

        response = await fetch(url, fetchOptions);
        durationMs = Math.round(performance.now() - start);

        this.logger.debug(
          { url: safeUrl, method, status: response.status, durationMs },
          "HTTP response",
        );

        // Retry decision happens BEFORE body parsing so that a delivered
        // response is never misclassified as a transient network failure.
        if (!response.ok && response.status >= 500 && attempt < maxAttempts) {
          lastError = new Error(`HTTP ${response.status}`);
          continue;
        }
      } catch (err) {
        lastError = err;
        const failedMs = Math.round(performance.now() - start);
        if (attempt < maxAttempts) {
          this.logger.warn(
            { err, url: safeUrl, method, attempt, durationMs: failedMs },
            "HTTP request failed, will retry",
          );
          continue;
        }
        this.logger.error(
          { err, url: safeUrl, method, durationMs: failedMs },
          "HTTP request failed",
        );
        throw err;
      } finally {
        clearTimeout(timer);
      }

      // ----- Body parse (terminal: never retried) -----
      // The request already reached the server; a parse error is attributable
      // to the response content, not a transient failure.
      const data = await this.parseBody<T>(response, safeUrl);

      return {
        status: response.status,
        ok: response.ok,
        headers: response.headers,
        data,
      };
    }

    // Should not be reached, but if all retries exhausted via 5xx path:
    throw lastError;
  }

  /**
   * Parse a delivered response body. Handles JSON, text, and empty
   * (`204`/no content) responses. On a JSON parse failure, throws a descriptive
   * error including the status and sanitized URL — this is a terminal error and
   * must NOT trigger a retry.
   */
  private async parseBody<T>(response: Response, safeUrl: string): Promise<T> {
    // Empty / no-content responses yield null data without a parse error.
    if (response.status === 204) {
      return null as unknown as T;
    }

    const contentType = response.headers.get("content-type") ?? "";
    const text = await response.text();

    if (text.length === 0) {
      return null as unknown as T;
    }

    if (contentType.includes("application/json")) {
      try {
        return JSON.parse(text) as T;
      } catch (err) {
        const errMsg = `Failed to parse JSON response body (HTTP ${response.status}) from ${safeUrl}`;
        this.logger.error({ err, url: safeUrl, status: response.status }, errMsg);
        throw new Error(errMsg);
      }
    }

    return text as unknown as T;
  }

  /** Convenience: GET request */
  async get<T = unknown>(url: string, headers?: Record<string, string>): Promise<HttpResponse<T>> {
    return this.request<T>(url, { method: "GET", headers });
  }

  /** Convenience: POST request */
  async post<T = unknown>(
    url: string,
    body: unknown,
    headers?: Record<string, string>,
  ): Promise<HttpResponse<T>> {
    return this.request<T>(url, { method: "POST", body, headers });
  }

  /** Convenience: PUT request */
  async put<T = unknown>(
    url: string,
    body: unknown,
    headers?: Record<string, string>,
  ): Promise<HttpResponse<T>> {
    return this.request<T>(url, { method: "PUT", body, headers });
  }

  /** Convenience: PATCH request */
  async patch<T = unknown>(
    url: string,
    body: unknown,
    headers?: Record<string, string>,
  ): Promise<HttpResponse<T>> {
    return this.request<T>(url, { method: "PATCH", body, headers });
  }

  /** Convenience: DELETE request */
  async del<T = unknown>(url: string, headers?: Record<string, string>): Promise<HttpResponse<T>> {
    return this.request<T>(url, { method: "DELETE", headers });
  }
}
