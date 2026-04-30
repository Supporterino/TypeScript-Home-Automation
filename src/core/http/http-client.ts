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
 * Mask sensitive query parameters in a URL for safe logging.
 * Replaces values of known sensitive parameter names with "***".
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
    let lastError: unknown;

    for (let attempt = 0; attempt <= retries; attempt++) {
      if (attempt > 0) {
        const delay = Math.min(500 * 2 ** (attempt - 1), 10000);
        this.logger.debug({ url: safeUrl, method, attempt, delay }, "Retrying HTTP request");
        await new Promise((r) => setTimeout(r, delay));
      }

      const start = performance.now();
      this.logger.debug({ url: safeUrl, method }, "HTTP request");

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);

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

        const response = await fetch(url, fetchOptions);
        const durationMs = Math.round(performance.now() - start);

        let data: T;
        const contentType = response.headers.get("content-type") ?? "";
        if (contentType.includes("application/json")) {
          data = (await response.json()) as T;
        } else {
          data = (await response.text()) as unknown as T;
        }

        this.logger.debug(
          { url: safeUrl, method, status: response.status, durationMs },
          "HTTP response",
        );

        // Retry on server errors if retries remain
        if (!response.ok && response.status >= 500 && attempt < retries) {
          lastError = new Error(`HTTP ${response.status}`);
          continue;
        }

        return {
          status: response.status,
          ok: response.ok,
          headers: response.headers,
          data,
        };
      } catch (err) {
        lastError = err;
        const durationMs = Math.round(performance.now() - start);
        if (attempt < retries) {
          this.logger.warn(
            { err, url: safeUrl, method, attempt, durationMs },
            "HTTP request failed, will retry",
          );
          continue;
        }
        this.logger.error({ err, url: safeUrl, method, durationMs }, "HTTP request failed");
        throw err;
      } finally {
        clearTimeout(timer);
      }
    }

    // Should not be reached, but if all retries exhausted via 5xx path:
    throw lastError;
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
