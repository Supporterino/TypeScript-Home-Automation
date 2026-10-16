/**
 * Realtime event-stream reader: fetches the stream (an `EventSource` cannot
 * attach an `Authorization` header), parses it, and reconnects on drops.
 */

import type { StreamEvent } from "@ts-ha/shared";
import { parseSseFrames } from "./sse.js";

const DEFAULT_RECONNECT_BASE_MS = 1_000;
const DEFAULT_RECONNECT_MAX_MS = 30_000;

/** Marker code carried by the plain `Error` for a stream `401`. */
const STREAM_AUTH_CODE = "unauthorized";

/** Build the distinguishable 401 marker error (a plain `Error`, not a subclass). */
function streamAuthError(message = "Event stream authentication failed (HTTP 401)"): Error {
  return Object.assign(new Error(message), { name: "StreamAuthError", code: STREAM_AUTH_CODE });
}

/** Whether an error is the reader's distinguishable 401 marker. */
export function isStreamAuthError(error: unknown): boolean {
  return error instanceof Error && (error as { code?: unknown }).code === STREAM_AUTH_CODE;
}

export interface EventStreamOptions {
  /** Target host, with or without a scheme. */
  host: string;
  /** Bearer token, attached when configured. */
  token?: string;
  /** Cancels the reader; the returned promise settles once it observes it. */
  signal: AbortSignal;
  onEvent: (event: StreamEvent) => void;
  /** Called after each successful connection (including the first). */
  onOpen?: () => void;
  /**
   * Called on a failure; for a `401` it runs before the reader throws the
   * distinguishable error and stops (no reconnect).
   */
  onError?: (error: Error) => void;
  reconnectBaseMs?: number;
  reconnectMaxMs?: number;
  /** Injectable for tests. */
  fetchImpl?: typeof fetch;
}

/** Read `GET /api/events` until `signal` aborts, reconnecting on drops. */
export async function readEventStream(options: EventStreamOptions): Promise<void> {
  const baseUrl = options.host.startsWith("http") ? options.host : `http://${options.host}`;
  const fetchImpl = options.fetchImpl ?? fetch;
  const base = options.reconnectBaseMs ?? DEFAULT_RECONNECT_BASE_MS;
  const max = options.reconnectMaxMs ?? DEFAULT_RECONNECT_MAX_MS;

  let attempt = 0;

  while (!options.signal.aborted) {
    try {
      const response = await fetchImpl(`${baseUrl}/api/events`, {
        method: "GET",
        headers: {
          Accept: "text/event-stream",
          ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
        },
        signal: options.signal,
      });

      if (response.status === 401) {
        const error = streamAuthError();
        options.onError?.(error);
        throw error;
      }

      if (!response.ok || !response.body) {
        throw new Error(`Event stream request failed: HTTP ${response.status}`);
      }

      attempt = 0;
      options.onOpen?.();

      await consume(response.body, options.signal, options.onEvent);
    } catch (error) {
      if (options.signal.aborted) return;
      if (isStreamAuthError(error)) throw error;
      options.onError?.(error as Error);
    }

    if (options.signal.aborted) return;
    attempt += 1;
    await abortableSleep(Math.min(max, base * 2 ** (attempt - 1)), options.signal);
  }
}

/** Pump a response body through the frame parser until it closes or aborts. */
async function consume(
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal,
  onEvent: (event: StreamEvent) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (!signal.aborted) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const { events, rest } = parseSseFrames(buffer);
    buffer = rest;

    for (const payload of events) {
      try {
        onEvent(JSON.parse(payload) as StreamEvent);
      } catch {
        // A malformed frame is dropped, not fatal.
      }
    }
  }
}

/**
 * Abortable delay — resolves early (and immediately) when `signal` aborts; the
 * `abort` listener is removed on both the abort and timeout paths.
 */
export function abortableSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const onAbort = (): void => {
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}
