import { describe, expect, it } from "bun:test";
import type { DeviceDescriptor } from "../src/app/types.js";
import { favoriteDevices } from "../src/app/wall/widgets/favorites-model.js";

// Pure selection for the wall favorites widget — no DOM. The displayed set is
// derived from the favorites list and live device map on every render, so a
// change streamed from another client is reflected (design.md D7; task 5.6).

function device(qualifiedId: string): DeviceDescriptor {
  return {
    source: "zigbee",
    id: qualifiedId,
    qualifiedId,
    displayName: qualifiedId,
    state: {},
    capabilities: [],
    reachable: true,
    observation: { mode: "push", observedAt: 0 },
    hidden: false,
  };
}

function devices(...ids: string[]): Map<string, DeviceDescriptor> {
  return new Map(ids.map((id) => [id, device(id)]));
}

describe("favoriteDevices", () => {
  it("resolves the favorited identifiers to live descriptors in favorites order", () => {
    const result = favoriteDevices(["zigbee:b", "zigbee:a"], devices("zigbee:a", "zigbee:b"));
    expect(result.map((d) => d.qualifiedId)).toEqual(["zigbee:b", "zigbee:a"]);
  });

  it("drops an identifier with no live descriptor", () => {
    const result = favoriteDevices(["zigbee:a", "shelly:gone"], devices("zigbee:a"));
    expect(result.map((d) => d.qualifiedId)).toEqual(["zigbee:a"]);
  });

  it("returns an empty set when nothing is favorited", () => {
    expect(favoriteDevices([], devices("zigbee:a"))).toEqual([]);
  });

  it("yields the updated set when the favorites list changes", () => {
    // This is the shape of a streamed favorites update: the state event
    // replaces the list, and the derived set follows on the next render.
    const before = favoriteDevices(["zigbee:a"], devices("zigbee:a", "shelly:plug"));
    const after = favoriteDevices(["zigbee:a", "shelly:plug"], devices("zigbee:a", "shelly:plug"));

    expect(before.map((d) => d.qualifiedId)).toEqual(["zigbee:a"]);
    expect(after.map((d) => d.qualifiedId)).toEqual(["zigbee:a", "shelly:plug"]);
  });

  it("reflects a removal by dropping the device from the set", () => {
    const devicesById = devices("zigbee:a", "zigbee:b");
    expect(favoriteDevices(["zigbee:a", "zigbee:b"], devicesById)).toHaveLength(2);
    expect(favoriteDevices(["zigbee:b"], devicesById).map((d) => d.qualifiedId)).toEqual([
      "zigbee:b",
    ]);
  });
});
