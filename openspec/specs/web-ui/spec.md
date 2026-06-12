# Web UI

## Purpose

A React + Mantine web dashboard served by the engine's HTTP server. Provides a browser-based UI for monitoring automations, devices, state, logs, and HomeKit status. Compiles to static JS/CSS strings embedded in the package.

## Requirements

### Enabling

The web UI MUST be enabled via `WEB_UI_ENABLED=true`. When disabled, no UI routes are mounted and the web UI source is never imported.

### URL Path

The web UI MUST be served at the configured path (default: `/status`). The path MUST start with `/`.

### Authentication

The system MUST handle authentication for the web UI:

- **No token configured** (`HTTP_TOKEN=""`): Direct access to the dashboard without login
- **Token configured**: Redirect to login page; verify via session cookie (`session=<token>`) or `Authorization: Bearer <token>` header
- The auth check MUST be inline in the route handler (not via `app.use()`) to avoid matching health probes and other routes

### Routes

The system MUST serve these web UI routes:

| Route | Description |
|-------|-------------|
| `GET {path}` | Dashboard HTML shell (auth-protected when token is set) |
| `GET {path}/login` | Login page (redirects to dashboard if already authenticated) |
| `POST {path}/login` | Login form submission — validates token, sets session cookie |
| `GET {path}/logout` | Clears session cookie, redirects to login |
| `GET {path}/icon.svg` | PWA icon (SVG, served with `image/svg+xml`) |
| `GET {path}/apple-touch-icon.svg` | Apple touch icon |
| `GET {path}/manifest.json` | PWA manifest (`application/manifest+json`) |

### Dashboard Shell

The `htmlShell()` function MUST render a complete HTML page that:
- Loads the compiled React app JS bundle
- Loads the compiled CSS
- Configures the app with `basePath`, `hasAuth`, and `token` via inline script

### Login Shell

The `loginShell()` function MUST render a login page with:
- A password/token input field
- An error message display (when login fails with invalid token)
- Submits via POST to `{path}/login`

### PWA Support

The web UI MUST function as a Progressive Web App:
- `manifest.json` with app name, icons, theme colors, display mode
- SVG icon (512x512) served as both `icon.svg` and `apple-touch-icon.svg`
- Standalone display mode
- Dark theme (`background_color: #1a1b1e`, `theme_color: #228be6`)

### Build Process

The web UI source (`src/core/web-ui/app/`) is a separate React + Mantine project:
- Built via `bun run build:web-ui` (compiles with `Bun.build`)
- Produces JS and CSS as string constants in `src/core/web-ui/assets/`
- These generated files are git-ignored
- The build runs automatically as a `prebuild` hook

### Technology Stack

- **Framework**: React
- **UI Library**: Mantine
- **Router**: React Router (client-side)
- **Build**: Bun.build (ESM output as string constants)

### Data Sources

The dashboard fetches all data from the engine's JSON API endpoints (`/api/*`). It does not have its own data layer — it is a pure client of the existing API.
