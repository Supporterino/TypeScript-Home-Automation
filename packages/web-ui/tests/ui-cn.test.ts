import { describe, expect, it } from "bun:test";
import { cn } from "../src/app/ui/cn.js";

// Pure test — no DOM. `cn` must resolve the Lumen radius utilities (design.md
// D3, D5): without registering the custom radius scale, `rounded-tile` and a
// caller's `rounded-*` override would both survive and stylesheet order would
// decide. These assert the caller (last) wins deterministically.

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
