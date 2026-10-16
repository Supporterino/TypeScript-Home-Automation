/**
 * `WebUiService` — the web UI as a structural `ServicePlugin`. Declares its
 * own minimal plugin shape rather than importing core's `ServicePlugin`.
 */

import type { Hono } from "hono";
import type { Logger } from "pino";
import type { WebUiOptions } from "./options.js";
import { registerWebUiRoutes } from "./web-ui-routes.js";

/** Minimal plugin context: just the `logger`, declared locally to avoid a core import. */
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
 * The web UI service plugin: `registerRoutes` mounts the shell, assets, PWA
 * routes, and auth; `onStart` supplies the logger used by auth logging.
 */
export class WebUiService implements WebUiPlugin {
  readonly serviceKey = "web-ui" as const;

  private logger: Logger | null = null;

  constructor(private readonly options: WebUiOptions) {}

  async onStart(context: WebUiServiceContext): Promise<void> {
    this.logger = context.logger;
  }

  registerRoutes(app: Hono): void {
    // The logger is read lazily: the server may listen before `onStart()` sets it.
    registerWebUiRoutes(app, this.options.path, this.options.token, () => this.logger);
  }
}

/** Construct the web UI plugin from parsed options. */
export function createWebUiService(options: WebUiOptions): WebUiService {
  return new WebUiService(options);
}
