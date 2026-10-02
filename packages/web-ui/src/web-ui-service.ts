/**
 * `WebUiService` — the web UI as a structural `ServicePlugin` (design.md D2, D7).
 *
 * The class deliberately declares its own minimal plugin shape rather than
 * importing `ServicePlugin` or `CoreContext` from the core engine package. The
 * engine's registry detects a plugin structurally (`serviceKey`) and its
 * `services` option is an open record, so no compiler coupling is needed —
 * and this package must have no core edge, not even type-only.
 *
 * Timing: the engine mounts routes, starts listening, and only then runs
 * `onStart()`. The logger is captured in `onStart()` and read lazily by the
 * handlers at request time through the `getLogger()` thunk, so it is optional:
 * auth events that arrive in the brief window while the server is listening but
 * `onStart()` has not yet run are simply not logged.
 */

import type { Hono } from "hono";
import type { Logger } from "pino";
import type { WebUiOptions } from "./options.js";
import { registerWebUiRoutes } from "./web-ui-routes.js";

/**
 * Minimal context shape the plugin needs. Mirrors only the `logger` field of
 * core's `CoreContext`, declared locally to avoid a core import (D7).
 */
export interface WebUiServiceContext {
  logger: Logger;
}

/** The structural plugin shape the engine's `ServiceRegistry` recognises. */
export interface WebUiPlugin {
  readonly serviceKey: "web-ui";
  onStart(context: WebUiServiceContext): Promise<void>;
  registerRoutes(app: Hono): void;
}

/**
 * The web UI service plugin.
 *
 * `registerRoutes` mounts the shell, compiled assets, PWA routes, and auth on
 * the shared Hono app; `onStart` supplies the logger used by auth logging.
 */
export class WebUiService implements WebUiPlugin {
  readonly serviceKey = "web-ui" as const;

  private logger: Logger | null = null;

  constructor(private readonly options: WebUiOptions) {}

  async onStart(context: WebUiServiceContext): Promise<void> {
    this.logger = context.logger;
  }

  registerRoutes(app: Hono): void {
    // Reads `this.logger` lazily inside the auth handlers via the thunk; the
    // server may already be listening before `onStart()` sets it, in which
    // case those auth events are simply not logged (specs/engine "A plugin's
    // logger is available after onStart").
    registerWebUiRoutes(app, this.options.path, this.options.token, () => this.logger);
  }
}

/** Construct the web UI plugin from parsed options. */
export function createWebUiService(options: WebUiOptions): WebUiService {
  return new WebUiService(options);
}
