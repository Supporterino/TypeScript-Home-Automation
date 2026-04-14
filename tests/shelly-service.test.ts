import { beforeEach, describe, expect, it, mock } from "bun:test";
import pino from "pino";
import type { HttpClient, HttpResponse } from "../src/core/http/http-client.js";
import { ShellyService } from "../src/core/services/shelly-service.js";

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

    it("strips http:// scheme from host", async () => {
      shelly.register("plug", "http://192.168.1.50");
      await shelly.turnOn("plug");
      const url = (http.get as ReturnType<typeof mock>).mock.calls[0][0] as string;
      expect(url).toStartWith("http://192.168.1.50/rpc/");
      expect(url).not.toContain("http://http://");
    });

    it("strips https:// scheme from host", async () => {
      shelly.register("plug", "https://shelly-plug.local");
      await shelly.turnOn("plug");
      const url = (http.get as ReturnType<typeof mock>).mock.calls[0][0] as string;
      expect(url).toBe("http://shelly-plug.local/rpc/Switch.Set?id=0&on=true");
    });

    it("strips trailing slashes from host", async () => {
      shelly.register("plug", "192.168.1.50/");
      await shelly.turnOn("plug");
      const url = (http.get as ReturnType<typeof mock>).mock.calls[0][0] as string;
      expect(url).toStartWith("http://192.168.1.50/rpc/");
    });

    it("accepts hostname with port", async () => {
      shelly.register("plug", "shelly-plug.local:8080");
      await shelly.turnOn("plug");
      const url = (http.get as ReturnType<typeof mock>).mock.calls[0][0] as string;
      expect(url).toStartWith("http://shelly-plug.local:8080/rpc/");
    });

    it("accepts mDNS .local hostnames", async () => {
      shelly.register("plug", "shellyplusplugs-aabbcc.local");
      await shelly.turnOn("plug");
      const url = (http.get as ReturnType<typeof mock>).mock.calls[0][0] as string;
      expect(url).toStartWith("http://shellyplusplugs-aabbcc.local/rpc/");
    });

    it("throws for unregistered devices", () => {
      expect(shelly.turnOn("unknown")).rejects.toThrow('Shelly device "unknown" is not registered');
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

  describe("cover control", () => {
    beforeEach(() => {
      http = createMockHttp({ state: "open", current_pos: 75, apower: 0 });
      shelly = new ShellyService(http, logger);
      shelly.register("shutter", "192.168.1.60");
    });

    it("coverOpen sends Cover.Open RPC", async () => {
      await shelly.coverOpen("shutter");
      const url = (http.get as ReturnType<typeof mock>).mock.calls[0][0] as string;
      expect(url).toContain("/rpc/Cover.Open");
      expect(url).toContain("id=0");
    });

    it("coverOpen sends duration param when provided", async () => {
      await shelly.coverOpen("shutter", 5);
      const url = (http.get as ReturnType<typeof mock>).mock.calls[0][0] as string;
      expect(url).toContain("duration=5");
    });

    it("coverClose sends Cover.Close RPC", async () => {
      await shelly.coverClose("shutter");
      const url = (http.get as ReturnType<typeof mock>).mock.calls[0][0] as string;
      expect(url).toContain("/rpc/Cover.Close");
    });

    it("coverClose sends duration param when provided", async () => {
      await shelly.coverClose("shutter", 3);
      const url = (http.get as ReturnType<typeof mock>).mock.calls[0][0] as string;
      expect(url).toContain("duration=3");
    });

    it("coverStop sends Cover.Stop RPC", async () => {
      await shelly.coverStop("shutter");
      const url = (http.get as ReturnType<typeof mock>).mock.calls[0][0] as string;
      expect(url).toContain("/rpc/Cover.Stop");
    });

    it("coverGoToPosition sends pos param", async () => {
      await shelly.coverGoToPosition("shutter", 50);
      const url = (http.get as ReturnType<typeof mock>).mock.calls[0][0] as string;
      expect(url).toContain("/rpc/Cover.GoToPosition");
      expect(url).toContain("pos=50");
    });

    it("coverMoveRelative sends rel param", async () => {
      await shelly.coverMoveRelative("shutter", -20);
      const url = (http.get as ReturnType<typeof mock>).mock.calls[0][0] as string;
      expect(url).toContain("/rpc/Cover.GoToPosition");
      expect(url).toContain("rel=-20");
    });

    it("getCoverStatus calls Cover.GetStatus", async () => {
      const status = await shelly.getCoverStatus("shutter");
      const url = (http.get as ReturnType<typeof mock>).mock.calls[0][0] as string;
      expect(url).toContain("/rpc/Cover.GetStatus");
      expect(status.state).toBe("open");
    });

    it("getCoverConfig calls Cover.GetConfig", async () => {
      await shelly.getCoverConfig("shutter");
      const url = (http.get as ReturnType<typeof mock>).mock.calls[0][0] as string;
      expect(url).toContain("/rpc/Cover.GetConfig");
    });

    it("coverCalibrate calls Cover.Calibrate", async () => {
      await shelly.coverCalibrate("shutter");
      const url = (http.get as ReturnType<typeof mock>).mock.calls[0][0] as string;
      expect(url).toContain("/rpc/Cover.Calibrate");
    });

    it("getCoverPosition returns current_pos from status", async () => {
      const pos = await shelly.getCoverPosition("shutter");
      expect(pos).toBe(75);
    });

    it("getCoverPosition returns null when uncalibrated", async () => {
      http = createMockHttp({ state: "stopped", current_pos: null });
      shelly = new ShellyService(http, logger);
      shelly.register("shutter", "192.168.1.60");
      const pos = await shelly.getCoverPosition("shutter");
      expect(pos).toBeNull();
    });

    it("getCoverState returns state from status", async () => {
      const state = await shelly.getCoverState("shutter");
      expect(state).toBe("open");
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
