import { beforeEach, describe, expect, it, mock } from "bun:test";
import pino from "pino";
import type { HttpClient, HttpResponse } from "../src/core/http/http-client.js";
import { NtfyNotificationService } from "../src/core/services/ntfy-notification-service.js";

const logger = pino({ level: "silent" });

function createMockHttp(ok = true): HttpClient {
  const mockResponse: HttpResponse = {
    status: ok ? 200 : 500,
    ok,
    headers: new Headers(),
    data: {},
  };

  return {
    request: mock(() => Promise.resolve(mockResponse)),
    get: mock(() => Promise.resolve(mockResponse)),
    post: mock(() => Promise.resolve(mockResponse)),
    put: mock(() => Promise.resolve(mockResponse)),
    patch: mock(() => Promise.resolve(mockResponse)),
    del: mock(() => Promise.resolve(mockResponse)),
  } as unknown as HttpClient;
}

describe("NtfyNotificationService", () => {
  let http: ReturnType<typeof createMockHttp>;
  let ntfy: NtfyNotificationService;

  beforeEach(() => {
    http = createMockHttp();
    ntfy = new NtfyNotificationService({
      topic: "test-alerts",
      http,
      logger,
    });
  });

  it("POSTs to ntfy.sh/<topic> by default", async () => {
    await ntfy.send({ title: "Test", message: "Hello" });
    const call = (http.request as ReturnType<typeof mock>).mock.calls[0];
    expect(call[0]).toBe("https://ntfy.sh/test-alerts");
  });

  it("POSTs to custom URL when configured", async () => {
    const custom = new NtfyNotificationService({
      url: "https://ntfy.example.com",
      topic: "my-topic",
      http,
      logger,
    });
    await custom.send({ title: "Test", message: "Hello" });
    const call = (http.request as ReturnType<typeof mock>).mock.calls[0];
    expect(call[0]).toBe("https://ntfy.example.com/my-topic");
  });

  it("sets Title header from options", async () => {
    await ntfy.send({ title: "Alert Title", message: "body" });
    const call = (http.request as ReturnType<typeof mock>).mock.calls[0];
    expect(call[1].headers.Title).toBe("Alert Title");
  });

  it("sets Priority to 'default' when not specified", async () => {
    await ntfy.send({ title: "Test", message: "body" });
    const call = (http.request as ReturnType<typeof mock>).mock.calls[0];
    expect(call[1].headers.Priority).toBe("default");
  });

  it("sets explicit Priority when provided", async () => {
    await ntfy.send({ title: "Test", message: "body", priority: "urgent" });
    const call = (http.request as ReturnType<typeof mock>).mock.calls[0];
    expect(call[1].headers.Priority).toBe("urgent");
  });

  it("sets Tags header as comma-separated string", async () => {
    await ntfy.send({
      title: "Test",
      message: "body",
      tags: ["warning", "thermometer"],
    });
    const call = (http.request as ReturnType<typeof mock>).mock.calls[0];
    expect(call[1].headers.Tags).toBe("warning,thermometer");
  });

  it("does not set Tags header when tags are empty", async () => {
    await ntfy.send({ title: "Test", message: "body", tags: [] });
    const call = (http.request as ReturnType<typeof mock>).mock.calls[0];
    expect(call[1].headers.Tags).toBeUndefined();
  });

  it("sets Authorization header when token is provided", async () => {
    const authed = new NtfyNotificationService({
      topic: "secure",
      token: "tk_secret",
      http,
      logger,
    });
    await authed.send({ title: "Test", message: "body" });
    const call = (http.request as ReturnType<typeof mock>).mock.calls[0];
    expect(call[1].headers.Authorization).toBe("Bearer tk_secret");
  });

  it("does not throw when HTTP request fails", async () => {
    const failHttp = createMockHttp(false);
    const failNtfy = new NtfyNotificationService({
      topic: "test",
      http: failHttp,
      logger,
    });
    // Should not throw
    await failNtfy.send({ title: "Test", message: "body" });
  });

  it("sends message as plain text body", async () => {
    await ntfy.send({ title: "Test", message: "Hello world" });
    const call = (http.request as ReturnType<typeof mock>).mock.calls[0];
    expect(call[1].body).toBe("Hello world");
    expect(call[1].headers["Content-Type"]).toBe("text/plain");
  });

  describe("channel routing", () => {
    it("routes to the mapped ntfy topic when channel is found in the channels map", async () => {
      const withChannels = new NtfyNotificationService({
        topic: "home-general",
        channels: { alerts: "home-alerts", debug: "home-debug" },
        http,
        logger,
      });
      await withChannels.send({ title: "Test", message: "body", channel: "alerts" });
      const call = (http.request as ReturnType<typeof mock>).mock.calls[0];
      expect(call[0]).toBe("https://ntfy.sh/home-alerts");
    });

    it("falls back to the default topic when channel name is not in the channels map", async () => {
      const warnLogger = pino({ level: "silent" });
      const withChannels = new NtfyNotificationService({
        topic: "home-general",
        channels: { alerts: "home-alerts" },
        http,
        logger: warnLogger,
      });
      await withChannels.send({ title: "Test", message: "body", channel: "unknown-channel" });
      const call = (http.request as ReturnType<typeof mock>).mock.calls[0];
      expect(call[0]).toBe("https://ntfy.sh/home-general");
    });

    it("uses the default topic when no channel is specified (regression)", async () => {
      const withChannels = new NtfyNotificationService({
        topic: "home-general",
        channels: { alerts: "home-alerts" },
        http,
        logger,
      });
      await withChannels.send({ title: "Test", message: "body" });
      const call = (http.request as ReturnType<typeof mock>).mock.calls[0];
      expect(call[0]).toBe("https://ntfy.sh/home-general");
    });

    it("falls back gracefully when no channels map is configured but channel option is set", async () => {
      // ntfy configured without channels — channel option should fall back to default topic
      await ntfy.send({ title: "Test", message: "body", channel: "alerts" });
      const call = (http.request as ReturnType<typeof mock>).mock.calls[0];
      expect(call[0]).toBe("https://ntfy.sh/test-alerts");
    });
  });
});
