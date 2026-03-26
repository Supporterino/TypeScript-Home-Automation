import type { Logger } from "pino";

export interface HttpRequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  headers?: Record<string, string>;
  body?: unknown;
  timeout?: number;
}

export interface HttpResponse<T = unknown> {
  status: number;
  ok: boolean;
  headers: Headers;
  data: T;
}

export class HttpClient {
  constructor(private readonly logger: Logger) {}

  /**
   * Make an HTTP request. Uses Bun's native fetch under the hood.
   *
   * @param url The URL to request
   * @param options Request options (method, headers, body, timeout)
   * @returns Typed response with parsed JSON body
   */
  async request<T = unknown>(
    url: string,
    options: HttpRequestOptions = {},
  ): Promise<HttpResponse<T>> {
    const { method = "GET", headers = {}, body, timeout = 30000 } = options;

    this.logger.debug({ url, method }, "HTTP request");

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
        fetchOptions.body = JSON.stringify(body);
      }

      const response = await fetch(url, fetchOptions);

      let data: T;
      const contentType = response.headers.get("content-type") ?? "";
      if (contentType.includes("application/json")) {
        data = (await response.json()) as T;
      } else {
        data = (await response.text()) as unknown as T;
      }

      this.logger.debug(
        { url, method, status: response.status },
        "HTTP response",
      );

      return {
        status: response.status,
        ok: response.ok,
        headers: response.headers,
        data,
      };
    } catch (err) {
      this.logger.error({ err, url, method }, "HTTP request failed");
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  /** Convenience: GET request */
  async get<T = unknown>(
    url: string,
    headers?: Record<string, string>,
  ): Promise<HttpResponse<T>> {
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
}
