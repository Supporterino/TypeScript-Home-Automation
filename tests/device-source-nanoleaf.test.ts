import { describe, expect, it, mock } from "bun:test";
import pino from "pino";
import { NanoleafDeviceSource } from "../src/core/device-sources/nanoleaf-source.js";
import { formatQualifiedId } from "../src/core/device-sources/qualified-id.js";
import type { HttpClient, HttpResponse } from "../src/core/http/http-client.js";
import { NanoleafService } from "../src/core/services/nanoleaf-service.js";

const logger = pino({ level: "silent" });

/** Builds an HttpClient mock whose GET responses vary by path suffix. */
function createMockHttp(): HttpClient {
  const state = {
    state: {
      on: { value: true },
      brightness: { value: 50 },
      hue: { value: 120 },
      sat: { value: 80 },
    },
  };
  const effects = ["Northern Lights", "Nemo", "Static"];

  const get = mock((url: string) => {
    if (url.endsWith("/effects/effectsList")) {
      return Promise.resolve({ status: 200, ok: true, headers: new Headers(), data: effects });
    }
    if (url.endsWith("/effects/select")) {
      return Promise.resolve({ status: 200, ok: true, headers: new Headers(), data: "Nemo" });
    }
    // getState() and getDeviceInfo() both hit the base URL and expect a device-info-shaped body.
    return Promise.resolve({ status: 200, ok: true, headers: new Headers(), data: state });
  });

  const okResponse: HttpResponse = { status: 200, ok: true, headers: new Headers(), data: {} };
  return {
    get,
    post: mock(() => Promise.resolve(okResponse)),
    put: mock(() => Promise.resolve({ ...okResponse, status: 204 })),
    patch: mock(() => Promise.resolve(okResponse)),
    del: mock(() => Promise.resolve(okResponse)),
    request: mock(() => Promise.resolve(okResponse)),
  } as unknown as HttpClient;
}

describe("NanoleafDeviceSource", () => {
  it("reports unavailable and yields no devices when the nanoleaf service is null", () => {
    const source = new NanoleafDeviceSource(null, logger, 1_000_000);
    expect(source.available).toBe(false);
    expect(source.list()).toEqual([]);
  });

  it("enumerates registered devices with power, brightness, and colour capabilities", async () => {
    const nanoleaf = new NanoleafService(createMockHttp(), logger);
    nanoleaf.register("panels", { host: "192.168.1.60", token: "abc" });
    const source = new NanoleafDeviceSource(nanoleaf, logger, 20);
    source.start();

    await new Promise((r) => setTimeout(r, 40));

    const devices = source.list();
    expect(devices).toHaveLength(1);
    expect(devices[0].qualifiedId).toBe(formatQualifiedId("nanoleaf", "panels"));
    const properties = devices[0].capabilities.map((c) => c.property);
    expect(properties).toEqual(
      expect.arrayContaining(["on", "brightness", "hue", "saturation", "effect"]),
    );

    const onCap = devices[0].capabilities.find((c) => c.property === "on");
    expect(onCap?.valueOn).toBe(true);
    expect(onCap?.valueOff).toBe(false);

    source.stop();
  });

  it("describes the effect list as an enumerated capability with the device's own values", async () => {
    const nanoleaf = new NanoleafService(createMockHttp(), logger);
    nanoleaf.register("panels", { host: "192.168.1.60", token: "abc" });
    const source = new NanoleafDeviceSource(nanoleaf, logger, 20);
    source.start();

    await new Promise((r) => setTimeout(r, 40));

    const device = source.get("panels");
    const effectCap = device?.capabilities.find((c) => c.property === "effect");
    expect(effectCap?.valueType).toBe("enum");
    expect(effectCap?.permittedValues).toEqual(["Northern Lights", "Nemo", "Static"]);
    expect(device?.state.effect).toBe("Nemo");

    source.stop();
  });

  it("marks an unreachable device without halting the refresh cycle for others", async () => {
    const failingHttp = createMockHttp();
    (failingHttp.get as ReturnType<typeof mock>).mockImplementation(() =>
      Promise.reject(new Error("network error")),
    );
    const nanoleaf = new NanoleafService(failingHttp, logger);
    nanoleaf.register("broken", { host: "192.168.1.61", token: "abc" });
    const source = new NanoleafDeviceSource(nanoleaf, logger, 20);
    source.start();

    await new Promise((r) => setTimeout(r, 40));
    expect(source.get("broken")?.reachable).toBe(false);

    // The cycle continues; a second tick still runs.
    await new Promise((r) => setTimeout(r, 40));
    expect(source.get("broken")?.reachable).toBe(false);

    source.stop();
  });

  it("dispatches a command through NanoleafService", async () => {
    const http = createMockHttp();
    const nanoleaf = new NanoleafService(http, logger);
    nanoleaf.register("panels", { host: "192.168.1.60", token: "abc" });
    const source = new NanoleafDeviceSource(nanoleaf, logger, 1_000_000);
    source.start();

    const outcome = await source.command("panels", { on: true });
    expect(outcome).toEqual({ status: "ok" });
    expect(http.put).toHaveBeenCalled();

    source.stop();
  });

  it("returns not_found for an unknown device id", async () => {
    const nanoleaf = new NanoleafService(createMockHttp(), logger);
    const source = new NanoleafDeviceSource(nanoleaf, logger, 1_000_000);
    source.start();

    const outcome = await source.command("unknown", {});
    expect(outcome).toEqual({ status: "not_found" });

    source.stop();
  });

  it("returns unavailable for a command when the nanoleaf service is null", async () => {
    const source = new NanoleafDeviceSource(null, logger, 1_000_000);
    const outcome = await source.command("panels", {});
    expect(outcome).toEqual({ status: "unavailable" });
  });

  it("stop() clears the poll timer so no further refresh occurs", async () => {
    const http = createMockHttp();
    const nanoleaf = new NanoleafService(http, logger);
    nanoleaf.register("panels", { host: "192.168.1.60", token: "abc" });
    const source = new NanoleafDeviceSource(nanoleaf, logger, 20);
    source.start();
    await new Promise((r) => setTimeout(r, 30));
    source.stop();

    const getSpy = http.get as ReturnType<typeof mock>;
    const callsAtStop = getSpy.mock.calls.length;
    await new Promise((r) => setTimeout(r, 60));
    expect(getSpy.mock.calls.length).toBe(callsAtStop);
  });
});
