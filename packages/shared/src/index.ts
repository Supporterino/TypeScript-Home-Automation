/**
 * `@ts-ha/shared` — domain and wire contracts for the TypeScript Home
 * Automation workspace.
 *
 * Types, contract constants two or more packages must agree on, and pure
 * helpers that encode such a rule. No engine, HTTP, or framework runtime;
 * safe to import from a browser bundle (design.md D5).
 */

export * from "./automation.js";
export * from "./capabilities.js";
export * from "./constants.js";
export * from "./device.js";
export * from "./events.js";
export * from "./execution.js";
export * from "./log-entry.js";
export * from "./relationships.js";
export * from "./room.js";
export type * from "./types/index.js";
export * from "./wire.js";
