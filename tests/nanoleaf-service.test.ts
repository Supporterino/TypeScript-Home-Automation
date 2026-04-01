import { beforeEach, describe, expect, it, mock } from "bun:test";
import pino from "pino";
import type { HttpClient, HttpResponse } from "../src/core/http-client.js";
import { NanoleafService } from "../src/core/nanoleaf-service.js";

const logger = pino({ level: "silent" });

function createMockHttp(responseData: unknown = {}): HttpClient {
  const mockResponse: HttpResponse = {
    status: 200,
    ok: true,
    headers: new Headers(),
    data: responseData,
  };

  return {
    get: mock(() => Promise.resolve(mockResponse)),
    post: mock(() => Promise.resolve(mockResponse)),
    put: mock(() => Promise.resolve({ ...mockResponse, status: 204 })),
    patch: mock(() => Promise.resolve(mockResponse)),
    del: mock(() => Promise.resolve(mockResponse)),
    request: mock(() => Promise.resolve(mockResponse)),
  } as unknown as HttpClient;
}

describe("NanoleafService", () => {
  let nanoleaf: NanoleafService;
  let http: ReturnType<typeof createMockHttp>;

  beforeEach(() => {
    http = createMockHttp();
    nanoleaf = new NanoleafService(http, logger);
  });

  describe("device registration", () => {
    it("registers a device with IP and token", () => {
      nanoleaf.register("panels", { host: "192.168.1.60", token: "abc123" });
      expect(nanoleaf.getDeviceInfo("panels")).resolves.toBeDefined();
    });

    it("registers multiple devices", () => {
      nanoleaf.registerMany({
        a: { host: "192.168.1.60", token: "aaa" },
        b: { host: "192.168.1.61", token: "bbb" },
      });
      expect(nanoleaf.getDeviceInfo("a")).resolves.toBeDefined();
      expect(nanoleaf.getDeviceInfo("b")).resolves.toBeDefined();
    });

    it("throws for unregistered devices", () => {
      expect(nanoleaf.turnOn("unknown")).rejects.toThrow(
        'Nanoleaf device "unknown" is not registered',
      );
    });
  });

  describe("host normalization", () => {
    it("strips http:// scheme", async () => {
      nanoleaf.register("p", { host: "http://192.168.1.60", token: "t" });
      await nanoleaf.turnOn("p");
      const url = (http.put as ReturnType<typeof mock>).mock.calls[0][0] as string;
      expect(url).toStartWith("http://192.168.1.60:16021/");
      expect(url).not.toContain("http://http://");
    });

    it("strips https:// scheme", async () => {
      nanoleaf.register("p", { host: "https://panels.local", token: "t" });
      await nanoleaf.turnOn("p");
      const url = (http.put as ReturnType<typeof mock>).mock.calls[0][0] as string;
      expect(url).toStartWith("http://panels.local:16021/");
    });

    it("strips trailing slashes", async () => {
      nanoleaf.register("p", { host: "192.168.1.60/", token: "t" });
      await nanoleaf.turnOn("p");
      const url = (http.put as ReturnType<typeof mock>).mock.calls[0][0] as string;
      expect(url).toContain("192.168.1.60:16021/");
    });

    it("strips default port if included", async () => {
      nanoleaf.register("p", { host: "192.168.1.60:16021", token: "t" });
      await nanoleaf.turnOn("p");
      const url = (http.put as ReturnType<typeof mock>).mock.calls[0][0] as string;
      expect(url).toContain("192.168.1.60:16021/");
      expect(url).not.toContain(":16021:16021");
    });

    it("accepts mDNS .local hostnames", async () => {
      nanoleaf.register("p", { host: "nanoleaf-abc.local", token: "t" });
      await nanoleaf.turnOn("p");
      const url = (http.put as ReturnType<typeof mock>).mock.calls[0][0] as string;
      expect(url).toStartWith("http://nanoleaf-abc.local:16021/");
    });

    it("supports custom port override", async () => {
      nanoleaf.register("p", { host: "192.168.1.60", token: "t", port: 9999 });
      await nanoleaf.turnOn("p");
      const url = (http.put as ReturnType<typeof mock>).mock.calls[0][0] as string;
      expect(url).toContain(":9999/");
    });
  });

  describe("power control", () => {
    beforeEach(() => {
      nanoleaf.register("p", { host: "192.168.1.60", token: "tok" });
    });

    it("turnOn sends PUT /state with on: true", async () => {
      await nanoleaf.turnOn("p");
      const call = (http.put as ReturnType<typeof mock>).mock.calls[0];
      expect(call[0]).toContain("/state");
      expect(call[1]).toEqual({ on: { value: true } });
    });

    it("turnOff sends PUT /state with on: false", async () => {
      await nanoleaf.turnOff("p");
      const call = (http.put as ReturnType<typeof mock>).mock.calls[0];
      expect(call[1]).toEqual({ on: { value: false } });
    });

    it("toggle reads state and inverts", async () => {
      http = createMockHttp({
        state: { on: { value: true }, brightness: {}, hue: {}, sat: {}, ct: {}, colorMode: "hs" },
      });
      nanoleaf = new NanoleafService(http, logger);
      nanoleaf.register("p", { host: "192.168.1.60", token: "tok" });
      await nanoleaf.toggle("p");
      const putCall = (http.put as ReturnType<typeof mock>).mock.calls[0];
      expect(putCall[1]).toEqual({ on: { value: false } });
    });
  });

  describe("brightness and color", () => {
    beforeEach(() => {
      nanoleaf.register("p", { host: "192.168.1.60", token: "tok" });
    });

    it("setBrightness sends value", async () => {
      await nanoleaf.setBrightness("p", 80);
      const call = (http.put as ReturnType<typeof mock>).mock.calls[0];
      expect(call[1]).toEqual({ brightness: { value: 80 } });
    });

    it("setBrightness sends value with duration", async () => {
      await nanoleaf.setBrightness("p", 50, 3);
      const call = (http.put as ReturnType<typeof mock>).mock.calls[0];
      expect(call[1]).toEqual({ brightness: { value: 50, duration: 3 } });
    });

    it("setColor sends hue and saturation", async () => {
      await nanoleaf.setColor("p", 120, 100);
      const call = (http.put as ReturnType<typeof mock>).mock.calls[0];
      expect(call[1]).toEqual({ hue: { value: 120 }, sat: { value: 100 } });
    });

    it("setColorTemp sends ct value", async () => {
      await nanoleaf.setColorTemp("p", 4000);
      const call = (http.put as ReturnType<typeof mock>).mock.calls[0];
      expect(call[1]).toEqual({ ct: { value: 4000 } });
    });
  });

  describe("effects", () => {
    beforeEach(() => {
      http = createMockHttp(["Color Burst", "Northern Lights"]);
      nanoleaf = new NanoleafService(http, logger);
      nanoleaf.register("p", { host: "192.168.1.60", token: "tok" });
    });

    it("getEffects calls GET /effects/effectsList", async () => {
      const effects = await nanoleaf.getEffects("p");
      const url = (http.get as ReturnType<typeof mock>).mock.calls[0][0] as string;
      expect(url).toContain("/effects/effectsList");
      expect(effects).toEqual(["Color Burst", "Northern Lights"]);
    });

    it("setEffect sends PUT /effects with select", async () => {
      await nanoleaf.setEffect("p", "Northern Lights");
      const call = (http.put as ReturnType<typeof mock>).mock.calls[0];
      expect(call[0]).toContain("/effects");
      expect(call[1]).toEqual({ select: "Northern Lights" });
    });
  });

  describe("identify", () => {
    it("sends PUT /identify", async () => {
      nanoleaf.register("p", { host: "192.168.1.60", token: "tok" });
      await nanoleaf.identify("p");
      const url = (http.put as ReturnType<typeof mock>).mock.calls[0][0] as string;
      expect(url).toContain("/identify");
    });
  });

  describe("URL construction", () => {
    it("includes token in base URL", async () => {
      nanoleaf.register("p", { host: "192.168.1.60", token: "my-secret-token" });
      await nanoleaf.turnOn("p");
      const url = (http.put as ReturnType<typeof mock>).mock.calls[0][0] as string;
      expect(url).toContain("/api/v1/my-secret-token/");
    });
  });

  describe("error handling", () => {
    it("throws on non-OK GET response", async () => {
      const errorHttp = {
        get: mock(() =>
          Promise.resolve({ status: 401, ok: false, headers: new Headers(), data: {} }),
        ),
        put: mock(() =>
          Promise.resolve({ status: 200, ok: true, headers: new Headers(), data: {} }),
        ),
      } as unknown as HttpClient;

      const n = new NanoleafService(errorHttp, logger);
      n.register("p", { host: "192.168.1.60", token: "bad" });
      expect(n.getEffects("p")).rejects.toThrow("HTTP 401");
    });

    it("throws on non-OK PUT response", async () => {
      const errorHttp = {
        get: mock(() =>
          Promise.resolve({ status: 200, ok: true, headers: new Headers(), data: {} }),
        ),
        put: mock(() =>
          Promise.resolve({ status: 500, ok: false, headers: new Headers(), data: {} }),
        ),
      } as unknown as HttpClient;

      const n = new NanoleafService(errorHttp, logger);
      n.register("p", { host: "192.168.1.60", token: "t" });
      expect(n.turnOn("p")).rejects.toThrow("HTTP 500");
    });
  });
});
