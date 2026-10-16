import { describe, expect, it } from "bun:test";
import { parseSseFrames } from "../src/sse.js";

// The frame parser is pure so it can be fed buffers directly.

describe("parseSseFrames", () => {
  it("parses multiple events from one buffer", () => {
    const { events, rest } = parseSseFrames(
      'data: {"category":"readiness","ready":true}\n\ndata: {"category":"fell_behind"}\n\n',
    );

    expect(events).toEqual(['{"category":"readiness","ready":true}', '{"category":"fell_behind"}']);
    expect(rest).toBe("");
  });

  it("ignores keep-alive comments and other fields", () => {
    const { events, rest } = parseSseFrames(
      'data: {"category":"state","key":"x","value":1}\n\n: keep-alive\n\n',
    );

    expect(events).toEqual(['{"category":"state","key":"x","value":1}']);
    expect(rest).toBe("");
  });

  it("produces no event for a keep-alive only", () => {
    expect(parseSseFrames(": keep-alive\n\n").events).toEqual([]);
  });

  it("retains an incomplete frame across a mid-frame split", () => {
    const first = parseSseFrames('data: {"cat');
    expect(first.events).toEqual([]);
    expect(first.rest).toBe('data: {"cat');

    const second = parseSseFrames(
      `${first.rest}egory":"device_reachability","qualifiedId":"zigbee:1","reachable":false}\n\n`,
    );
    expect(second.events).toEqual([
      '{"category":"device_reachability","qualifiedId":"zigbee:1","reachable":false}',
    ]);
    expect(second.rest).toBe("");
  });

  it("retains a frame when only the blank-line boundary is split", () => {
    const first = parseSseFrames('data: {"category":"fell_behind"}\n');
    expect(first.events).toEqual([]);

    const second = parseSseFrames(`${first.rest}\n`);
    expect(second.events).toEqual(['{"category":"fell_behind"}']);
  });

  it("joins multiple data lines with a newline", () => {
    const { events } = parseSseFrames("data: one\ndata: two\n\n");
    expect(events).toEqual(["one\ntwo"]);
  });
});
