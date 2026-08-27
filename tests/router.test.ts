import { describe, expect, it } from "bun:test";
import {
  automationDetailPath,
  automationsPath,
  dashboardPath,
  deviceDetailPath,
  devicesPath,
  homekitPath,
  logsPath,
  matchRoute,
  resolveRoute,
  roomPath,
  roomsPath,
  statePath,
  stripBasePath,
  unassignedDevicesPath,
} from "../src/core/web-ui/app/lib/router.js";

describe("stripBasePath", () => {
  it("returns the path unchanged when basePath is /", () => {
    expect(stripBasePath("/devices", "/")).toBe("/devices");
  });

  it("strips a non-root base path", () => {
    expect(stripBasePath("/status/devices", "/status")).toBe("/devices");
  });

  it("returns / for an exact base path match", () => {
    expect(stripBasePath("/status", "/status")).toBe("/");
  });

  it("returns null for a path outside the base path", () => {
    expect(stripBasePath("/other/devices", "/status")).toBeNull();
  });

  it("returns null for a path that merely shares a prefix without a separator", () => {
    expect(stripBasePath("/statusx/devices", "/status")).toBeNull();
  });
});

describe("matchRoute", () => {
  it("matches the dashboard at the root", () => {
    expect(matchRoute("/")).toEqual({ view: "dashboard", params: {} });
  });

  it("matches the rooms index", () => {
    expect(matchRoute("/rooms")).toEqual({ view: "rooms", params: {} });
  });

  it("matches a room by id", () => {
    expect(matchRoute("/rooms/living-room")).toEqual({
      view: "room",
      params: { id: "living-room" },
    });
  });

  it("matches the devices list", () => {
    expect(matchRoute("/devices")).toEqual({ view: "devices", params: {} });
  });

  it("prefers the static unassigned route over the device-detail param route", () => {
    expect(matchRoute("/devices/unassigned")).toEqual({
      view: "unassigned-devices",
      params: {},
    });
  });

  it("matches a device detail by qualified id, decoding the delimiter", () => {
    expect(matchRoute("/devices/zigbee%3A0xabc123")).toEqual({
      view: "device-detail",
      params: { qualifiedId: "zigbee:0xabc123" },
    });
  });

  it("matches the automations list", () => {
    expect(matchRoute("/automations")).toEqual({ view: "automations", params: {} });
  });

  it("matches an automation detail by name", () => {
    expect(matchRoute("/automations/motion-light")).toEqual({
      view: "automation-detail",
      params: { name: "motion-light" },
    });
  });

  it("matches state, logs, and homekit", () => {
    expect(matchRoute("/state").view).toBe("state");
    expect(matchRoute("/logs").view).toBe("logs");
    expect(matchRoute("/homekit").view).toBe("homekit");
  });

  it("resolves an unknown top-level segment to not-found", () => {
    expect(matchRoute("/nonexistent").view).toBe("not-found");
  });

  it("resolves an unknown nested path beneath a known segment to not-found", () => {
    expect(matchRoute("/devices/a/b/c").view).toBe("not-found");
  });

  it("resolves the empty string the same as the root", () => {
    expect(matchRoute("").view).toBe("dashboard");
  });
});

describe("resolveRoute", () => {
  it("strips the base path before matching", () => {
    expect(resolveRoute("/status/devices", "/status")).toEqual({ view: "devices", params: {} });
  });

  it("matches directly when mounted at /", () => {
    expect(resolveRoute("/rooms/abc", "/")).toEqual({ view: "room", params: { id: "abc" } });
  });

  it("resolves not-found for a path outside the base path", () => {
    expect(resolveRoute("/elsewhere", "/status").view).toBe("not-found");
  });
});

describe("path builders round-trip through matchRoute", () => {
  it("dashboardPath", () => {
    expect(resolveRoute(dashboardPath("/status"), "/status").view).toBe("dashboard");
  });

  it("roomsPath", () => {
    expect(resolveRoute(roomsPath("/status"), "/status").view).toBe("rooms");
  });

  it("roomPath", () => {
    const match = resolveRoute(roomPath("/status", "living room & den"), "/status");
    expect(match).toEqual({ view: "room", params: { id: "living room & den" } });
  });

  it("devicesPath and unassignedDevicesPath", () => {
    expect(resolveRoute(devicesPath("/status"), "/status").view).toBe("devices");
    expect(resolveRoute(unassignedDevicesPath("/status"), "/status").view).toBe(
      "unassigned-devices",
    );
  });

  it("deviceDetailPath round-trips a qualified id containing the source delimiter", () => {
    const match = resolveRoute(deviceDetailPath("/status", "shelly:kitchen plug"), "/status");
    expect(match).toEqual({
      view: "device-detail",
      params: { qualifiedId: "shelly:kitchen plug" },
    });
  });

  it("automationsPath and automationDetailPath", () => {
    expect(resolveRoute(automationsPath("/status"), "/status").view).toBe("automations");
    const match = resolveRoute(automationDetailPath("/status", "motion light"), "/status");
    expect(match).toEqual({ view: "automation-detail", params: { name: "motion light" } });
  });

  it("statePath, logsPath, homekitPath", () => {
    expect(resolveRoute(statePath("/status"), "/status").view).toBe("state");
    expect(resolveRoute(logsPath("/status"), "/status").view).toBe("logs");
    expect(resolveRoute(homekitPath("/status"), "/status").view).toBe("homekit");
  });

  it("every builder produces a path beneath a root-mounted base path", () => {
    expect(dashboardPath("/")).toBe("/");
    expect(devicesPath("/")).toBe("/devices");
    expect(resolveRoute(devicesPath("/"), "/").view).toBe("devices");
  });
});
