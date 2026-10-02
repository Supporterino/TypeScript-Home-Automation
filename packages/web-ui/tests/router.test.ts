import { describe, expect, it } from "bun:test";
import {
  automationDetailPath,
  automationsPath,
  deviceDetailPath,
  devicesPath,
  energyPath,
  homekitPath,
  isOverviewView,
  isUnder,
  logsPath,
  MOBILE_NAV_ITEMS,
  matchRoute,
  overviewPath,
  resolveRoute,
  roomPath,
  roomsPath,
  statePath,
  stripBasePath,
  unassignedDevicesPath,
  weatherPath,
} from "../src/app/lib/router.js";

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
  it("matches the overview at the root", () => {
    expect(matchRoute("/")).toEqual({ view: "overview", params: {} });
  });

  it("matches the overview alias", () => {
    expect(matchRoute("/overview")).toEqual({ view: "overview", params: {} });
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

  it("matches the energy and weather operator views", () => {
    expect(matchRoute("/energy")).toEqual({ view: "energy", params: {} });
    expect(matchRoute("/weather")).toEqual({ view: "weather", params: {} });
  });

  it("resolves an unknown top-level segment to not-found", () => {
    expect(matchRoute("/nonexistent").view).toBe("not-found");
  });

  it("resolves an unknown nested path beneath a known segment to not-found", () => {
    expect(matchRoute("/devices/a/b/c").view).toBe("not-found");
  });

  it("resolves the empty string the same as the root", () => {
    expect(matchRoute("").view).toBe("overview");
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

describe("isUnder", () => {
  it("matches the collection path itself", () => {
    expect(isUnder("/devices", "/devices")).toBe(true);
  });

  it("matches a detail route beneath the collection", () => {
    expect(isUnder("/devices/zigbee:0x1", "/devices")).toBe(true);
  });

  it("does not match a sibling path that shares a prefix without a separator", () => {
    expect(isUnder("/devices-x", "/devices")).toBe(false);
  });

  it("does not match an unrelated path", () => {
    expect(isUnder("/rooms", "/devices")).toBe(false);
  });

  it("keeps a device detail active for its collection but NOT the unassigned sibling", () => {
    const collection = devicesPath("/status");
    const unassigned = unassignedDevicesPath("/status");
    const detail = deviceDetailPath("/status", "zigbee:0x1");
    expect(isUnder(detail, collection) && !isUnder(detail, unassigned)).toBe(true);
    expect(isUnder(unassigned, collection) && !isUnder(unassigned, unassigned)).toBe(false);
  });

  it("keeps an automation detail active for its collection", () => {
    const collection = automationsPath("/status");
    const detail = automationDetailPath("/status", "motion-light");
    expect(isUnder(detail, collection)).toBe(true);
  });
});

describe("isOverviewView", () => {
  it("is active on the mounted base path", () => {
    expect(isOverviewView("/status", "/status")).toBe(true);
  });

  it("is active on the base path with a trailing slash", () => {
    expect(isOverviewView("/status/", "/status")).toBe(true);
  });

  it("is active on the /overview alias", () => {
    expect(isOverviewView("/status/overview", "/status")).toBe(true);
  });

  it("is active at the root mount and its alias", () => {
    expect(isOverviewView("/", "/")).toBe(true);
    expect(isOverviewView("/overview", "/")).toBe(true);
  });

  it("is not active on any other view", () => {
    expect(isOverviewView("/status/rooms", "/status")).toBe(false);
    expect(isOverviewView("/status/devices/unassigned", "/status")).toBe(false);
  });
});

describe("path builders round-trip through matchRoute", () => {
  it("overviewPath", () => {
    expect(resolveRoute(overviewPath("/status"), "/status").view).toBe("overview");
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

  it("energyPath and weatherPath", () => {
    expect(resolveRoute(energyPath("/status"), "/status").view).toBe("energy");
    expect(resolveRoute(weatherPath("/status"), "/status").view).toBe("weather");
  });

  it("every builder produces a path beneath a root-mounted base path", () => {
    expect(overviewPath("/")).toBe("/");
    expect(devicesPath("/")).toBe("/devices");
    expect(resolveRoute(devicesPath("/"), "/").view).toBe("devices");
  });
});

describe("MOBILE_NAV_ITEMS", () => {
  it("offers exactly the control views, in home/rooms/devices order", () => {
    expect(MOBILE_NAV_ITEMS.map((item) => item.view)).toEqual(["overview", "rooms", "devices"]);
  });

  it("never promotes an operator view into the bottom bar", () => {
    const views = new Set<string>(MOBILE_NAV_ITEMS.map((item) => item.view));
    for (const operator of [
      "automations",
      "automation-detail",
      "state",
      "logs",
      "homekit",
      "energy",
      "weather",
    ]) {
      expect(views.has(operator)).toBe(false);
    }
  });

  it("resolves every item to a control view beneath the base path", () => {
    for (const item of MOBILE_NAV_ITEMS) {
      expect(resolveRoute(item.buildPath("/status"), "/status").view).toBe(item.view);
    }
  });
});
