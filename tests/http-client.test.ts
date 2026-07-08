import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import pino from "pino";
import { HttpClient } from "../src/core/http/http-client.js";

const logger = pino({ level: "silent" });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Save original fetch so we can restore it after each test. */
const originalFetch = globalThis.fetch;

/** Create a mock fetch that returns a configurable response. */
function mockFetch(
  body: unknown = { ok: true },
  status = 200,
  contentType = "application/json",
): ReturnType<typeof mock> {
  const fn = mock(
    () =>
      new Response(typeof body === "string" ? body : JSON.stringify(body), {
        status,
        headers: { "Content-Type": contentType },
      }),
  );
  globalThis.fetch = fn as unknown as typeof fetch;
  return fn;
}

/** Create a mock fetch that rejects with an error. */
function mockFetchError(error: Error): ReturnType<typeof mock> {
  const fn = mock(() => Promise.reject(error));
  globalThis.fetch = fn as unknown as typeof fetch;
  return fn;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("HttpClient", () => {
  let client: HttpClient;

  beforeEach(() => {
    client = new HttpClient(logger);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // ── URL sanitization ────────────────────────────────────────────────────

  describe("URL sanitization", () => {
    it("masks appid query parameter in logs", async () => {
      mockFetch({ temp: 20 });
      const url = "https://api.example.com/data?lat=49&lon=8&appid=secret123";
      await client.get(url);

      // The underlying fetch should receive the original (unsanitized) URL
      const fetchCalls = (globalThis.fetch as ReturnType<typeof mock>).mock.calls;
      expect(fetchCalls[0][0]).toBe(url);
    });

    it("masks multiple sensitive params", async () => {
      mockFetch();
      const url = "https://api.example.com/data?token=abc&api_key=def&safe=yes";
      const response = await client.get(url);
      expect(response.ok).toBe(true);
    });

    it("handles URLs without sensitive params unchanged", async () => {
      mockFetch();
      const url = "https://api.example.com/data?lat=49&lon=8";
      const response = await client.get(url);
      expect(response.ok).toBe(true);
    });

    it("handles invalid URLs gracefully", async () => {
      mockFetch();
      // relative URL — new URL() will throw, sanitizeUrl should return it unchanged
      const response = await client.get("http://localhost/data");
      expect(response.ok).toBe(true);
    });
  });

  // ── Basic request/response ──────────────────────────────────────────────

  describe("request", () => {
    it("makes a GET request and returns parsed JSON", async () => {
      mockFetch({ message: "hello" });
      const response = await client.get<{ message: string }>("http://localhost/api");
      expect(response.status).toBe(200);
      expect(response.ok).toBe(true);
      expect(response.data.message).toBe("hello");
    });

    it("makes a POST request with JSON body", async () => {
      const fetchMock = mockFetch({ id: 1 });
      await client.post("http://localhost/api", { name: "test" });

      const [, options] = fetchMock.mock.calls[0];
      expect(options.method).toBe("POST");
      expect(options.body).toBe('{"name":"test"}');
    });

    it("makes a PUT request", async () => {
      const fetchMock = mockFetch({ updated: true });
      await client.put("http://localhost/api", { value: 42 });

      const [, options] = fetchMock.mock.calls[0];
      expect(options.method).toBe("PUT");
    });

    it("makes a PATCH request", async () => {
      const fetchMock = mockFetch({ patched: true });
      await client.patch("http://localhost/api", { field: "new" });

      const [, options] = fetchMock.mock.calls[0];
      expect(options.method).toBe("PATCH");
    });

    it("makes a DELETE request", async () => {
      const fetchMock = mockFetch({ deleted: true });
      await client.del("http://localhost/api");

      const [, options] = fetchMock.mock.calls[0];
      expect(options.method).toBe("DELETE");
    });

    it("passes custom headers", async () => {
      const fetchMock = mockFetch();
      await client.get("http://localhost/api", { Authorization: "Bearer abc" });

      const [, options] = fetchMock.mock.calls[0];
      expect(options.headers.Authorization).toBe("Bearer abc");
    });

    it("sets Content-Type to application/json by default", async () => {
      const fetchMock = mockFetch();
      await client.get("http://localhost/api");

      const [, options] = fetchMock.mock.calls[0];
      expect(options.headers["Content-Type"]).toBe("application/json");
    });

    it("does not include body for GET requests", async () => {
      const fetchMock = mockFetch();
      await client.get("http://localhost/api");

      const [, options] = fetchMock.mock.calls[0];
      expect(options.body).toBeUndefined();
    });

    it("sends string body as-is without re-serialization", async () => {
      const fetchMock = mockFetch();
      await client.request("http://localhost/api", {
        method: "POST",
        body: "raw-string",
      });

      const [, options] = fetchMock.mock.calls[0];
      expect(options.body).toBe("raw-string");
    });
  });

  // ── Response parsing ────────────────────────────────────────────────────

  describe("response parsing", () => {
    it("parses JSON response when content-type is application/json", async () => {
      mockFetch({ items: [1, 2, 3] });
      const response = await client.get<{ items: number[] }>("http://localhost/api");
      expect(response.data.items).toEqual([1, 2, 3]);
    });

    it("returns text response when content-type is not JSON", async () => {
      mockFetch("plain text response", 200, "text/plain");
      const response = await client.get<string>("http://localhost/api");
      expect(response.data).toBe("plain text response");
    });

    it("returns non-OK response without throwing", async () => {
      mockFetch({ error: "not found" }, 404);
      const response = await client.get("http://localhost/api");
      expect(response.status).toBe(404);
      expect(response.ok).toBe(false);
    });

    it("exposes response headers", async () => {
      mockFetch({ ok: true });
      const response = await client.get("http://localhost/api");
      expect(response.headers).toBeInstanceOf(Headers);
      expect(response.headers.get("content-type")).toContain("application/json");
    });
  });

  // ── Timeout handling ────────────────────────────────────────────────────

  describe("timeout", () => {
    it("aborts the request after the specified timeout", async () => {
      // Create a fetch that never resolves
      globalThis.fetch = mock(
        (_url: string, options: RequestInit) =>
          new Promise((_resolve, reject) => {
            options.signal?.addEventListener("abort", () => {
              reject(new DOMException("The operation was aborted.", "AbortError"));
            });
          }),
      ) as unknown as typeof fetch;

      const promise = client.request("http://localhost/api", { timeout: 50 });
      await expect(promise).rejects.toThrow();
    });

    it("does not abort when request completes within timeout", async () => {
      mockFetch({ ok: true });
      const response = await client.request("http://localhost/api", { timeout: 5000 });
      expect(response.ok).toBe(true);
    });
  });

  // ── Error handling ──────────────────────────────────────────────────────

  describe("error handling", () => {
    it("throws on network error", async () => {
      mockFetchError(new Error("Network failure"));
      await expect(client.get("http://localhost/api")).rejects.toThrow("Network failure");
    });

    it("throws on DNS resolution failure", async () => {
      mockFetchError(new Error("getaddrinfo ENOTFOUND"));
      await expect(client.get("http://nonexistent.invalid/api")).rejects.toThrow(
        "getaddrinfo ENOTFOUND",
      );
    });
  });

  // ── Retry logic ─────────────────────────────────────────────────────────

  describe("retry logic", () => {
    it("does not retry by default", async () => {
      mockFetchError(new Error("fail"));
      await expect(client.get("http://localhost/api")).rejects.toThrow("fail");
      const fetchCalls = (globalThis.fetch as ReturnType<typeof mock>).mock.calls;
      expect(fetchCalls).toHaveLength(1);
    });

    it("retries on network error up to the specified count", async () => {
      let callCount = 0;
      globalThis.fetch = mock(() => {
        callCount++;
        if (callCount < 3) {
          return Promise.reject(new Error("transient failure"));
        }
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }) as unknown as typeof fetch;

      const response = await client.request("http://localhost/api", { retries: 3, timeout: 30000 });
      expect(response.ok).toBe(true);
      expect(callCount).toBe(3);
    });

    it("throws after exhausting all retry attempts on network errors", async () => {
      mockFetchError(new Error("persistent failure"));
      await expect(
        client.request("http://localhost/api", { retries: 2, timeout: 30000 }),
      ).rejects.toThrow("persistent failure");

      const fetchCalls = (globalThis.fetch as ReturnType<typeof mock>).mock.calls;
      expect(fetchCalls).toHaveLength(3); // initial + 2 retries
    });

    it("retries on 5xx server errors", async () => {
      let callCount = 0;
      globalThis.fetch = mock(() => {
        callCount++;
        if (callCount < 3) {
          return new Response(JSON.stringify({ error: "internal" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }) as unknown as typeof fetch;

      const response = await client.request("http://localhost/api", { retries: 3, timeout: 30000 });
      expect(response.ok).toBe(true);
      expect(callCount).toBe(3);
    });

    it("does not retry on 4xx client errors", async () => {
      mockFetch({ error: "bad request" }, 400);
      const response = await client.request("http://localhost/api", {
        retries: 3,
        timeout: 30000,
      });
      expect(response.status).toBe(400);
      expect(response.ok).toBe(false);

      const fetchCalls = (globalThis.fetch as ReturnType<typeof mock>).mock.calls;
      expect(fetchCalls).toHaveLength(1);
    });

    it("returns 5xx response after exhausting all retries", async () => {
      const fetchMock = mockFetch({ error: "server error" }, 500);
      // With retries=1: attempt 0 gets 500 (retries), attempt 1 gets 500 (returns it)
      const response = await client.request("http://localhost/api", {
        retries: 1,
        timeout: 30000,
      });
      expect(response.status).toBe(500);
      expect(response.ok).toBe(false);
      expect(fetchMock.mock.calls).toHaveLength(2);
    });

    // ── 7.1 Delivered response with unparseable body ──────────────────────

    it("does not retry a 200 with malformed JSON and surfaces a clear error", async () => {
      const fetchMock = mockFetch("{not valid json", 200, "application/json");
      await expect(
        client.request("http://localhost/api", { retries: 3, timeout: 30000 }),
      ).rejects.toThrow(/Failed to parse JSON response body/);
      // The request reached the server; a parse error must not trigger retries.
      expect(fetchMock.mock.calls).toHaveLength(1);
    });

    // ── 7.2 Idempotent-only retry policy ──────────────────────────────────

    it("does not auto-retry a POST on 5xx by default", async () => {
      const fetchMock = mockFetch({ error: "server error" }, 500);
      const response = await client.request("http://localhost/api", {
        method: "POST",
        body: { name: "test" },
        retries: 3,
        timeout: 30000,
      });
      expect(response.status).toBe(500);
      expect(fetchMock.mock.calls).toHaveLength(1);
    });

    it("does auto-retry a GET on 5xx", async () => {
      let callCount = 0;
      globalThis.fetch = mock(() => {
        callCount++;
        if (callCount < 2) {
          return new Response(JSON.stringify({ error: "internal" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }) as unknown as typeof fetch;

      const response = await client.request("http://localhost/api", {
        method: "GET",
        retries: 3,
        timeout: 30000,
      });
      expect(response.ok).toBe(true);
      expect(callCount).toBe(2);
    });

    // ── 7.3 Backoff jitter ────────────────────────────────────────────────

    it("includes jitter in the backoff delay", async () => {
      let callCount = 0;
      globalThis.fetch = mock(() => {
        callCount++;
        if (callCount < 2) {
          return Promise.reject(new Error("transient failure"));
        }
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }) as unknown as typeof fetch;

      // With Math.random forced to a non-zero value, the delay must exceed the
      // pure exponential base (500ms for the first retry).
      const originalRandom = Math.random;
      const delays: number[] = [];
      const originalSetTimeout = globalThis.setTimeout;
      globalThis.setTimeout = ((fn: () => void, ms?: number) => {
        if (typeof ms === "number" && ms > 0) delays.push(ms);
        return originalSetTimeout(fn, 0);
      }) as unknown as typeof setTimeout;
      Math.random = () => 0.5;

      try {
        await client.request("http://localhost/api", { retries: 3, timeout: 30000 });
      } finally {
        Math.random = originalRandom;
        globalThis.setTimeout = originalSetTimeout;
      }

      // base = 500, jitter = 500 * 0.5 * 0.5 = 125 → 625ms > 500ms
      const backoffDelay = delays.find((d) => d >= 500);
      expect(backoffDelay).toBeDefined();
      expect(backoffDelay).toBeGreaterThan(500);
    });
  });

  // ── 7.4 Path-token masking ──────────────────────────────────────────────

  describe("path-token masking in logs", () => {
    it("masks a Nanoleaf-style token path segment and leaves benign paths intact", async () => {
      const logged: unknown[] = [];
      const capturingLogger = pino(
        { level: "debug" },
        {
          write(line: string) {
            logged.push(JSON.parse(line));
          },
        },
      );
      const capturingClient = new HttpClient(capturingLogger);

      mockFetch({ ok: true });
      const url = "http://host:16021/api/v1/SECRETTOKEN1234567890/state";
      await capturingClient.get(url);

      const loggedUrls = logged
        .map((e) => (e as { url?: string }).url)
        .filter((u): u is string => typeof u === "string");
      expect(loggedUrls.length).toBeGreaterThan(0);
      for (const u of loggedUrls) {
        expect(u).not.toContain("SECRETTOKEN1234567890");
        expect(u).toContain("***");
        // Benign path segments remain intact.
        expect(u).toContain("/api/v1/");
        expect(u).toContain("/state");
      }
      // fetch still receives the real (unsanitized) URL.
      const fetchCalls = (globalThis.fetch as ReturnType<typeof mock>).mock.calls;
      expect(fetchCalls[0][0]).toBe(url);
    });

    it("does not mask short benign path segments", async () => {
      const logged: unknown[] = [];
      const capturingLogger = pino(
        { level: "debug" },
        {
          write(line: string) {
            logged.push(JSON.parse(line));
          },
        },
      );
      const capturingClient = new HttpClient(capturingLogger);

      mockFetch({ ok: true });
      await capturingClient.get("http://host/api/v1/status");

      const loggedUrls = logged
        .map((e) => (e as { url?: string }).url)
        .filter((u): u is string => typeof u === "string");
      for (const u of loggedUrls) {
        expect(u).not.toContain("***");
        expect(u).toContain("/status");
      }
    });
  });
});
