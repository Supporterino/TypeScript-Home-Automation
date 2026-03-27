import { describe, it, expect, beforeEach, mock } from "bun:test";
import pino from "pino";
import { ShellyService } from "../src/core/shelly-service.js";
import type { HttpClient, HttpResponse } from "../src/core/http-client.js";

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
    put: mock(() => Promise.resolve(mockResponse)),
    patch: mock(() => Promise.resolve(mockResponse)),
    del: mock(() => Promise.resolve(mockResponse)),
    request: mock(() => Promise.resolve(mockResponse)),
  } as unknown as HttpClient;
}

describe("ShellyService", () => {
  let shelly: ShellyService;
  let http: ReturnType<typeof createMockHttp>;

  beforeEach(() => {
    http = createMockHttp({ was_on: false });
    shelly = new ShellyService(http, logger);
  });

  describe("device registration", () => {
    it("registers a device by name and host", () => {
      shelly.register("plug1", "192.168.1.50");
      // Should not throw when used
      expect(shelly.getDeviceInfo("plug1")).resolves.toBeDefined();
    });

    it("registers multiple devices with an array", () => {
      shelly.registerMany([
        { name: "plug1", host: "192.168.1.50" },
        { name: "plug2", host: "192.168.1.51" },
      ]);
      expect(shelly.getDeviceInfo("plug1")).resolves.toBeDefined();
      expect(shelly.getDeviceInfo("plug2")).resolves.toBeDefined();
    });

    it("registers multiple devices with a record", () => {
      shelly.registerMany({
        plug1: "192.168.1.50",
        plug2: "192.168.1.51",
      });
      expect(shelly.getDeviceInfo("plug1")).resolves.toBeDefined();
      expect(shelly.getDeviceInfo("plug2")).resolves.toBeDefined();
    });

    it("throws for unregistered devices", () => {
      expect(shelly.turnOn("unknown")).rejects.toThrow(
        'Shelly device "unknown" is not registered',
      );
    });
  });

  describe("switch control", () => {
    beforeEach(() => {
      shelly.register("plug", "192.168.1.50");
    });

    it("turnOn sends correct RPC URL", async () => {
      await shelly.turnOn("plug");
      expect(http.get).toHaveBeenCalledTimes(1);
      const url = (http.get as ReturnType<typeof mock>).mock.calls[0][0] as string;
      expect(url).toContain("http://192.168.1.50/rpc/Switch.Set");
      expect(url).toContain("id=0");
      expect(url).toContain("on=true");
    });

    it("turnOn with toggleAfter includes toggle_after param", async () => {
      await shelly.turnOn("plug", 3600);
      const url = (http.get as ReturnType<typeof mock>).mock.calls[0][0] as string;
      expect(url).toContain("toggle_after=3600");
    });

    it("turnOff sends correct RPC URL", async () => {
      await shelly.turnOff("plug");
      const url = (http.get as ReturnType<typeof mock>).mock.calls[0][0] as string;
      expect(url).toContain("on=false");
    });

    it("turnOff with toggleAfter includes toggle_after param", async () => {
      await shelly.turnOff("plug", 60);
      const url = (http.get as ReturnType<typeof mock>).mock.calls[0][0] as string;
      expect(url).toContain("toggle_after=60");
    });

    it("toggle sends correct RPC URL", async () => {
      await shelly.toggle("plug");
      const url = (http.get as ReturnType<typeof mock>).mock.calls[0][0] as string;
      expect(url).toContain("/rpc/Switch.Toggle");
      expect(url).toContain("id=0");
    });
  });

  describe("status and info", () => {
    beforeEach(() => {
      http = createMockHttp({ output: true, apower: 42.5 });
      shelly = new ShellyService(http, logger);
      shelly.register("plug", "192.168.1.50");
    });

    it("getStatus returns parsed response", async () => {
      const status = await shelly.getStatus("plug");
      expect(status.output).toBe(true);
      expect(status.apower).toBe(42.5);
    });

    it("getStatus calls correct URL", async () => {
      await shelly.getStatus("plug");
      const url = (http.get as ReturnType<typeof mock>).mock.calls[0][0] as string;
      expect(url).toContain("/rpc/Switch.GetStatus");
    });

    it("getConfig calls correct URL", async () => {
      await shelly.getConfig("plug");
      const url = (http.get as ReturnType<typeof mock>).mock.calls[0][0] as string;
      expect(url).toContain("/rpc/Switch.GetConfig");
    });

    it("getDeviceInfo calls correct URL without params", async () => {
      await shelly.getDeviceInfo("plug");
      const url = (http.get as ReturnType<typeof mock>).mock.calls[0][0] as string;
      expect(url).toContain("/rpc/Shelly.GetDeviceInfo");
      expect(url).not.toContain("?");
    });

    it("getSysStatus calls correct URL", async () => {
      await shelly.getSysStatus("plug");
      const url = (http.get as ReturnType<typeof mock>).mock.calls[0][0] as string;
      expect(url).toContain("/rpc/Sys.GetStatus");
    });

    it("isOn returns true when output is true", async () => {
      expect(await shelly.isOn("plug")).toBe(true);
    });

    it("isOn returns false when output is false", async () => {
      http = createMockHttp({ output: false, apower: 0 });
      shelly = new ShellyService(http, logger);
      shelly.register("plug", "192.168.1.50");
      expect(await shelly.isOn("plug")).toBe(false);
    });

    it("getPower returns apower value", async () => {
      expect(await shelly.getPower("plug")).toBe(42.5);
    });
  });

  describe("reboot", () => {
    beforeEach(() => {
      shelly.register("plug", "192.168.1.50");
    });

    it("calls Shelly.Reboot without delay", async () => {
      await shelly.reboot("plug");
      const url = (http.get as ReturnType<typeof mock>).mock.calls[0][0] as string;
      expect(url).toContain("/rpc/Shelly.Reboot");
      expect(url).not.toContain("delay_ms");
    });

    it("calls Shelly.Reboot with delay", async () => {
      await shelly.reboot("plug", 5000);
      const url = (http.get as ReturnType<typeof mock>).mock.calls[0][0] as string;
      expect(url).toContain("delay_ms=5000");
    });
  });

  describe("error handling", () => {
    it("throws on non-OK HTTP response", async () => {
      const errorHttp = {
        get: mock(() =>
          Promise.resolve({
            status: 500,
            ok: false,
            headers: new Headers(),
            data: {},
          }),
        ),
      } as unknown as HttpClient;

      const s = new ShellyService(errorHttp, logger);
      s.register("plug", "192.168.1.50");
      expect(s.turnOn("plug")).rejects.toThrow("HTTP 500");
    });
  });
});
