import { AsyncLocalStorage } from "node:async_hooks";

/**
 * The execution context established around every automation run
 * (design.md D11; task 8.1).
 * @internal
 */
export interface ExecutionContextStore {
  readonly automationName: string;
}

/**
 * Backing store for the automation execution context.
 *
 * `AsyncLocalStorage` (not a plain "currently executing" field) because it
 * survives `await` — automations are asynchronous and frequently write state
 * after awaiting a service call, and a plain field would mis-attribute work
 * performed after the first suspension point, or under concurrent runs of
 * different automations (design.md D11, R9).
 */
const storage = new AsyncLocalStorage<ExecutionContextStore>();

/**
 * Run `fn` with the execution context set to `automationName`. Nested calls
 * (a service invoked from within an automation's `execute()`) inherit the
 * same context automatically; there is no explicit propagation for callers
 * to get wrong (design.md D11).
 *
 * @internal
 */
export function runInAutomationContext<T>(automationName: string, fn: () => T): T {
  return storage.run({ automationName }, fn);
}

/**
 * The name of the automation currently executing on this async call chain,
 * or `null` when called from outside any automation run — for example, a
 * state write made by an HTTP API request (design.md D11; task 8.1).
 */
export function currentAutomationName(): string | null {
  return storage.getStore()?.automationName ?? null;
}
