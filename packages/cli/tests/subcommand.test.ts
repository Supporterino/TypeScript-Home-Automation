import { describe, expect, it } from "bun:test";
import { normalizeListSubcommand } from "../src/subcommand.js";

// Regression coverage for the dispatcher's alias handling.

describe("normalizeListSubcommand", () => {
  it("treats the bare form as list", () => {
    expect(normalizeListSubcommand("")).toBe("list");
  });

  it("treats ls as list", () => {
    expect(normalizeListSubcommand("ls")).toBe("list");
  });

  it("leaves list unchanged", () => {
    expect(normalizeListSubcommand("list")).toBe("list");
  });

  it("leaves every other subcommand unchanged", () => {
    expect(normalizeListSubcommand("get")).toBe("get");
    expect(normalizeListSubcommand("command")).toBe("command");
    expect(normalizeListSubcommand("hide")).toBe("hide");
    expect(normalizeListSubcommand("rm")).toBe("rm");
  });
});
