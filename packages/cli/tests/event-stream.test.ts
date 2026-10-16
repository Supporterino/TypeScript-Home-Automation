import { describe, expect, it, mock } from "bun:test";
import { getEventListeners } from "node:events";
import type { StreamEvent } from "@ts-ha/shared";
import { abortableSleep, isStreamAuthError, readEventStream } from "../src/event-stream.js";

function calls(fn: ReturnType<typeof mock>): [string, RequestInit][] {
  return fn.mock.calls as [string, RequestInit][];
}

describe("readEventStream", () => {
  it("requests the stream with the Authorization header", async () => {
    const fetchMock = mock(
      async () => new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 }),
    );

    const error = await readEventStream({
      host: "engine:8080",
      token: "secret",
      signal: new AbortController().signal,
      onEvent: () => {},
      fetchImpl: fetchMock as unknown as typeof fetch,
    }).catch((err: unknown) => err);
    expect(isStreamAuthError(error)).toBe(true);

    const [url, init] = calls(fetchMock)[0];
    expect(url).toBe("http://engine:8080/api/events");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer secret");
  });

  it("omits the Authorization header without a token", async () => {
    const fetchMock = mock(async () => new Response("", { status: 401 }));

    const error = await readEventStream({
      host: "engine",
      signal: new AbortController().signal,
      onEvent: () => {},
      fetchImpl: fetchMock as unknown as typeof fetch,
    }).catch((err: unknown) => err);
    expect(isStreamAuthError(error)).toBe(true);

    const [, init] = calls(fetchMock)[0];
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it("does not reconnect after a 401", async () => {
    const fetchMock = mock(async () => new Response("", { status: 401 }));

    const error = await readEventStream({
      host: "engine",
      token: "t",
      signal: new AbortController().signal,
      onEvent: () => {},
      fetchImpl: fetchMock as unknown as typeof fetch,
    }).catch((err: unknown) => err);
    expect(isStreamAuthError(error)).toBe(true);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("delivers parsed events and stops when aborted", async () => {
    const frames =
      'data: {"category":"readiness","ready":true}\n\n' + 'data: {"category":"fell_behind"}\n\n';
    const fetchMock = mock(
      async () =>
        new Response(frames, {
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
        }),
    );
    const controller = new AbortController();
    const received: StreamEvent[] = [];
    let opened = 0;

    await readEventStream({
      host: "engine",
      token: "t",
      signal: controller.signal,
      fetchImpl: fetchMock as unknown as typeof fetch,
      onOpen: () => {
        opened += 1;
      },
      onEvent: (event) => {
        received.push(event);
        if (received.length === 2) controller.abort();
      },
    });

    expect(received.map((event) => event.category)).toEqual(["readiness", "fell_behind"]);
    expect(opened).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reports a recoverable failure and reconnects", async () => {
    const controller = new AbortController();
    const errors: Error[] = [];
    let attempts = 0;
    const fetchMock = mock(async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("connection reset");
      return new Response('data: {"category":"fell_behind"}\n\n', { status: 200 });
    });

    await readEventStream({
      host: "engine",
      signal: controller.signal,
      fetchImpl: fetchMock as unknown as typeof fetch,
      reconnectBaseMs: 1,
      onError: (error) => errors.push(error),
      onEvent: () => controller.abort(),
    });

    expect(errors).toHaveLength(1);
    expect(errors[0].message).toBe("connection reset");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("abortableSleep", () => {
  it("removes its abort listener when the timer resolves normally", async () => {
    const controller = new AbortController();

    await abortableSleep(1, controller.signal);

    // A long-lived signal must not accumulate a listener per reconnect.
    expect(getEventListeners(controller.signal, "abort")).toHaveLength(0);
  });

  it("resolves early when aborted and removes the listener", async () => {
    const controller = new AbortController();
    const pending = abortableSleep(10_000, controller.signal);

    controller.abort();

    await expect(pending).resolves.toBeUndefined();
    expect(getEventListeners(controller.signal, "abort")).toHaveLength(0);
  });

  it("resolves immediately when the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(abortableSleep(10_000, controller.signal)).resolves.toBeUndefined();
    expect(getEventListeners(controller.signal, "abort")).toHaveLength(0);
  });
});
