import { describe, expect, it } from "bun:test";
import { cn } from "../src/app/ui/cn.js";

// Pure test — no DOM. `cn` must resolve the Lumen radius utilities: the caller's
// (last) override wins deterministically over the custom radius scale.

describe("cn custom radius merging", () => {
  it("lets a rounded override replace the custom tile radius", () => {
    expect(cn("rounded-tile", "rounded-none")).toBe("rounded-none");
  });

  it("lets a rounded override replace the custom card radius", () => {
    expect(cn("rounded-card", "rounded-full")).toBe("rounded-full");
  });

  it("lets a rounded override replace the custom pill radius", () => {
    expect(cn("rounded-pill", "rounded-full")).toBe("rounded-full");
  });

  it("keeps the primitive radius when the caller does not override it", () => {
    expect(cn("rounded-tile", "p-4")).toBe("rounded-tile p-4");
    expect(cn("rounded-input")).toBe("rounded-input");
  });
});
