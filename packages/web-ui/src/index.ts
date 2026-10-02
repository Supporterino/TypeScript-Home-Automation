/**
 * `@ts-ha/web-ui` — the web dashboard as a service plugin.
 *
 * Exports the plugin, a factory, and the option parser. Depends on
 * `@ts-ha/shared` only; it never imports the core engine package (design.md
 * D2, D7).
 */

export {
  DEFAULT_WEB_UI_PATH,
  parseWebUiOptions,
  type WebUiOptions,
} from "./options.js";
export {
  createWebUiService,
  type WebUiPlugin,
  WebUiService,
  type WebUiServiceContext,
} from "./web-ui-service.js";
