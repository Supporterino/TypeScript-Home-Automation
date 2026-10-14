import { describe, expect, it } from "bun:test";
import { reportedValueConfirms } from "../src/app/lib/reconcile-report.js";

describe("reportedValueConfirms", () => {
  describe("primitives", () => {
    it("confirms an identical string", () => {
      expect(reportedValueConfirms("ON", "ON")).toBe(true);
    });

    it("confirms an identical boolean", () => {
      expect(reportedValueConfirms(true, true)).toBe(true);
    });

    it("confirms an identical number", () => {
      expect(reportedValueConfirms(42, 42)).toBe(true);
    });

    it("does not confirm a different boolean", () => {
      expect(reportedValueConfirms(true, false)).toBe(false);
    });

    it("does not confirm a different string", () => {
      expect(reportedValueConfirms("ON", "OFF")).toBe(false);
    });

    it("confirms NaN with NaN", () => {
      expect(reportedValueConfirms(Number.NaN, Number.NaN)).toBe(true);
    });

    it("does not confirm a finite number with NaN", () => {
      expect(reportedValueConfirms(0, Number.NaN)).toBe(false);
    });

    it("treats -0 and +0 as distinct", () => {
      expect(reportedValueConfirms(-0, 0)).toBe(false);
      expect(reportedValueConfirms(0, 0)).toBe(true);
    });

    it("does not confirm across a type mismatch", () => {
      expect(reportedValueConfirms("ON", true)).toBe(false);
      expect(reportedValueConfirms(true, "true")).toBe(false);
      expect(reportedValueConfirms(1, "1")).toBe(false);
    });
  });

  describe("null and undefined", () => {
    it("confirms null with null and undefined with undefined", () => {
      expect(reportedValueConfirms(null, null)).toBe(true);
      expect(reportedValueConfirms(undefined, undefined)).toBe(true);
    });

    it("does not confirm null with undefined or with a falsy primitive", () => {
      expect(reportedValueConfirms(null, undefined)).toBe(false);
      expect(reportedValueConfirms(undefined, null)).toBe(false);
      expect(reportedValueConfirms(null, false)).toBe(false);
      expect(reportedValueConfirms(false, null)).toBe(false);
    });
  });

  describe("arrays", () => {
    it("confirms structurally equal arrays", () => {
      expect(reportedValueConfirms([1, 2, 3], [1, 2, 3])).toBe(true);
    });

    it("does not confirm arrays of a different length", () => {
      expect(reportedValueConfirms([1, 2, 3], [1, 2])).toBe(false);
    });

    it("does not confirm an array whose elements differ in order", () => {
      expect(reportedValueConfirms([1, 2, 3], [3, 2, 1])).toBe(false);
    });
  });

  describe("plain objects", () => {
    it("confirms structurally equal objects regardless of key order", () => {
      expect(
        reportedValueConfirms({ state: "ON", brightness: 50 }, { brightness: 50, state: "ON" }),
      ).toBe(true);
    });

    it("does not confirm objects with a differing value", () => {
      expect(reportedValueConfirms({ state: "ON" }, { state: "OFF" })).toBe(false);
    });

    it("does not confirm objects with differing key sets", () => {
      expect(reportedValueConfirms({ state: "ON", brightness: 50 }, { state: "ON" })).toBe(false);
    });

    it("confirms an empty object with an empty object", () => {
      expect(reportedValueConfirms({}, {})).toBe(true);
    });
  });

  describe("nested structures", () => {
    it("confirms deeply nested arrays and objects regardless of key order", () => {
      const requested = { color: { r: 255, g: 0, b: 0 }, transitions: [{ time: 1 }, { time: 2 }] };
      const reported = { transitions: [{ time: 1 }, { time: 2 }], color: { b: 0, g: 0, r: 255 } };
      expect(reportedValueConfirms(requested, reported)).toBe(true);
    });

    it("does not confirm a nested difference", () => {
      const requested = { color: { r: 255, g: 0, b: 0 }, transitions: [{ time: 1 }, { time: 2 }] };
      const reported = { color: { r: 255, g: 0, b: 0 }, transitions: [{ time: 1 }, { time: 3 }] };
      expect(reportedValueConfirms(requested, reported)).toBe(false);
    });
  });

  describe("type mismatches across containers", () => {
    it("does not confirm an object with an array", () => {
      expect(reportedValueConfirms({ 0: "a" }, ["a"])).toBe(false);
    });

    it("does not confirm an array with a primitive", () => {
      expect(reportedValueConfirms(["ON"], "ON")).toBe(false);
    });

    it("does not confirm an object with a primitive", () => {
      expect(reportedValueConfirms({ state: "ON" }, "ON")).toBe(false);
    });
  });
});
