import { describe, expect, it } from "bun:test";
import { DEFAULT_WEB_UI_PATH, parseWebUiOptions } from "../src/index.js";

// design.md D3, D8; specs/web-ui "Enabling", "URL Path", "No token parsing in
// the UI package". The parser reads only `WEB_UI_ENABLED` / `WEB_UI_PATH`.

describe("parseWebUiOptions", () => {
  it("returns null when WEB_UI_ENABLED is unset", () => {
    expect(parseWebUiOptions({})).toBeNull();
  });

  it.each([
    "false",
    "0",
    "no",
    "",
    "FALSE",
    " no ",
  ] as const)("returns null when WEB_UI_ENABLED='%s'", (value) => {
    expect(parseWebUiOptions({ WEB_UI_ENABLED: value })).toBeNull();
  });

  it.each([
    "true",
    "TRUE",
    "1",
    "yes",
    " true ",
    "YES",
    " 1 ",
  ] as const)("enables with WEB_UI_ENABLED='%s'", (value) => {
    expect(parseWebUiOptions({ WEB_UI_ENABLED: value })).toEqual({
      path: DEFAULT_WEB_UI_PATH,
      token: "",
    });
  });

  it("defaults the path to /status", () => {
    const options = parseWebUiOptions({ WEB_UI_ENABLED: "true" });
    expect(options?.path).toBe("/status");
  });

  it("reads WEB_UI_PATH from env", () => {
    const options = parseWebUiOptions({ WEB_UI_ENABLED: "true", WEB_UI_PATH: "/dashboard" });
    expect(options?.path).toBe("/dashboard");
  });

  it("accepts the root path /", () => {
    const options = parseWebUiOptions({ WEB_UI_ENABLED: "true", WEB_UI_PATH: "/" });
    expect(options?.path).toBe("/");
  });

  it("rejects a path that does not start with /", () => {
    expect(() => parseWebUiOptions({ WEB_UI_ENABLED: "true", WEB_UI_PATH: "dashboard" })).toThrow(
      /must start with "\/"/,
    );
  });

  it("ignores HTTP_TOKEN", () => {
    const options = parseWebUiOptions({
      WEB_UI_ENABLED: "true",
      WEB_UI_PATH: "/status",
      HTTP_TOKEN: "super-secret",
    });
    expect(options).toEqual({ path: "/status", token: "" });
    expect(JSON.stringify(options)).not.toContain("super-secret");
  });
});
