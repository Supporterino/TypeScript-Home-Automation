import { AsyncLocalStorage } from "node:async_hooks";

/**
 * The execution context established around every automation run.
 * @internal
 */
export interface ExecutionContextStore {
  readonly automationName: string;
}

/**
 * Backing store for the automation execution context. `AsyncLocalStorage` because it
 * survives `await`, so work after a suspension point is not mis-attributed.
 */
const storage = new AsyncLocalStorage<ExecutionContextStore>();

/**
 * Run `fn` with the execution context set to `automationName`; nested calls inherit
 * the same context automatically.
 *
 * @internal
 */
export function runInAutomationContext<T>(automationName: string, fn: () => T): T {
  return storage.run({ automationName }, fn);
}

/**
 * The name of the automation currently executing on this async call chain, or `null`
 * when called from outside any automation run.
 */
export function currentAutomationName(): string | null {
  return storage.getStore()?.automationName ?? null;
}
