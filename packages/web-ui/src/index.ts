/** `@ts-ha/web-ui` — the web dashboard, exported as a service plugin. */

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
