/**
 * Pure client-side route matching (design.md D7; task 10.1).
 *
 * The route table here MUST stay in sync with the server's
 * `UI_VIEW_SEGMENTS` allowlist (`packages/web-ui/src/web-ui-routes.ts`) — every
 * top-level segment matched here has a corresponding server registration
 * that serves the shell for it, so a reload of any matched path is served
 * the same view. No wildcard/catch-all route exists; an unmatched path
 * resolves to the `"not-found"` view rather than guessing.
 *
 * Kept dependency-free (no React, no DOM) so matching is reachable by
 * `bun test` (design.md D23) — `router-context.tsx` layers the History API
 * and a `<Link>` component on top of this, and is the part verified by hand.
 */

export type ViewName =
  | "overview"
  | "rooms"
  | "room"
  | "devices"
  | "unassigned-devices"
  | "device-detail"
  | "automations"
  | "automation-detail"
  | "state"
  | "logs"
  | "homekit"
  | "energy"
  | "weather"
  | "not-found";

export interface RouteMatch {
  view: ViewName;
  params: Record<string, string>;
}

interface RoutePattern {
  segments: string[];
  view: ViewName;
}

// Order matters only between routes that could both match the same
// segment count with one static and one parametrised segment — static
// segments are tried first regardless of table order (see `matchRoute`),
// but the table is still written most-specific-first for readability.
const ROUTE_TABLE: { pattern: string; view: ViewName }[] = [
  { pattern: "/", view: "overview" },
  // Alias for the landing view so `UI_VIEW_SEGMENTS` can list "overview" and
  // the server registration stays in sync with a client route (see the module
  // comment). `/` remains the canonical landing path.
  { pattern: "/overview", view: "overview" },
  { pattern: "/rooms", view: "rooms" },
  { pattern: "/rooms/:id", view: "room" },
  { pattern: "/devices", view: "devices" },
  { pattern: "/devices/unassigned", view: "unassigned-devices" },
  { pattern: "/devices/:qualifiedId", view: "device-detail" },
  { pattern: "/automations", view: "automations" },
  { pattern: "/automations/:name", view: "automation-detail" },
  { pattern: "/state", view: "state" },
  { pattern: "/logs", view: "logs" },
  { pattern: "/homekit", view: "homekit" },
  { pattern: "/energy", view: "energy" },
  { pattern: "/weather", view: "weather" },
];

function splitSegments(path: string): string[] {
  return path.split("/").filter((s) => s.length > 0);
}

const COMPILED_ROUTES: RoutePattern[] = ROUTE_TABLE.map((r) => ({
  segments: splitSegments(r.pattern),
  view: r.view,
}));

/**
 * Strips `basePath` from the start of `pathname`, returning the remainder
 * (always starting with `/`, or empty for an exact match). Returns `null`
 * when `pathname` is not beneath `basePath` at all.
 */
export function stripBasePath(pathname: string, basePath: string): string | null {
  if (basePath === "/") return pathname;
  if (pathname === basePath) return "/";
  if (pathname.startsWith(`${basePath}/`)) return pathname.slice(basePath.length);
  return null;
}

/**
 * Matches `pathname` (already stripped of `basePath`) against the route
 * table. A parametrised segment (`:id`) captures and URI-decodes that path
 * segment; a static segment must match literally, and static segments are
 * always preferred over a parametrised one at the same position (so
 * `/devices/unassigned` never falls through to `/devices/:qualifiedId`,
 * mirroring the server's `/api/rooms/unassigned` vs `/api/rooms/:id`
 * ordering convention).
 */
export function matchRoute(strippedPathname: string): RouteMatch {
  const requestSegments = splitSegments(strippedPathname);

  const candidates = COMPILED_ROUTES.filter((r) => r.segments.length === requestSegments.length);

  // Static (non-":"-prefixed) segments win over parametrised ones at the
  // same position — sort candidates by how many static segments they have,
  // most static first, so an exact literal match is always tried before a
  // param capture of the same length.
  const ranked = [...candidates].sort((a, b) => {
    const staticCount = (segs: string[]) => segs.filter((s) => !s.startsWith(":")).length;
    return staticCount(b.segments) - staticCount(a.segments);
  });

  for (const route of ranked) {
    const params: Record<string, string> = {};
    let matched = true;
    for (let i = 0; i < route.segments.length; i++) {
      const pattern = route.segments[i] ?? "";
      const actual = requestSegments[i] ?? "";
      if (pattern.startsWith(":")) {
        params[pattern.slice(1)] = decodeURIComponent(actual);
      } else if (pattern !== actual) {
        matched = false;
        break;
      }
    }
    if (matched) return { view: route.view, params };
  }

  return { view: "not-found", params: {} };
}

/** Resolves a full `pathname` (as seen by the browser) against `basePath`. */
export function resolveRoute(pathname: string, basePath: string): RouteMatch {
  const stripped = stripBasePath(pathname, basePath);
  if (stripped === null) return { view: "not-found", params: {} };
  return matchRoute(stripped);
}

/**
 * Whether `pathname` is `collectionPath` itself or a detail route nested
 * beneath it (design.md D10; specs/web-ui "Active view is indicated within a
 * collection"). Used so an item's detail route keeps its collection entry
 * active, while a sibling static route (e.g. `/devices/unassigned` under
 * `/devices`) is excluded by the caller.
 */
export function isUnder(pathname: string, collectionPath: string): boolean {
  return pathname === collectionPath || pathname.startsWith(`${collectionPath}/`);
}

/**
 * Whether `pathname` resolves to the overview view. Covers both the canonical
 * base path and the `/overview` alias, so either one highlights the
 * Overview/Home navigation entry (design.md D10; specs/web-ui "Active view is
 * indicated within a collection").
 */
export function isOverviewView(pathname: string, basePath: string): boolean {
  return resolveRoute(pathname, basePath).view === "overview";
}

// ── Path builders — the inverse of matching, used by links and navigation ──

function joinBasePath(basePath: string, suffix: string): string {
  return basePath === "/" ? suffix : `${basePath}${suffix}`;
}

export function overviewPath(basePath: string): string {
  return joinBasePath(basePath, "/");
}

export function roomsPath(basePath: string): string {
  return joinBasePath(basePath, "/rooms");
}

export function roomPath(basePath: string, roomId: string): string {
  return joinBasePath(basePath, `/rooms/${encodeURIComponent(roomId)}`);
}

export function devicesPath(basePath: string): string {
  return joinBasePath(basePath, "/devices");
}

export function unassignedDevicesPath(basePath: string): string {
  return joinBasePath(basePath, "/devices/unassigned");
}

export function deviceDetailPath(basePath: string, qualifiedId: string): string {
  return joinBasePath(basePath, `/devices/${encodeURIComponent(qualifiedId)}`);
}

export function automationsPath(basePath: string): string {
  return joinBasePath(basePath, "/automations");
}

export function automationDetailPath(basePath: string, name: string): string {
  return joinBasePath(basePath, `/automations/${encodeURIComponent(name)}`);
}

export function statePath(basePath: string): string {
  return joinBasePath(basePath, "/state");
}

export function logsPath(basePath: string): string {
  return joinBasePath(basePath, "/logs");
}

export function homekitPath(basePath: string): string {
  return joinBasePath(basePath, "/homekit");
}

export function energyPath(basePath: string): string {
  return joinBasePath(basePath, "/energy");
}

export function weatherPath(basePath: string): string {
  return joinBasePath(basePath, "/weather");
}

// ── Mobile bottom bar — control-only (design.md D10, D13) ──────────────────

/** The control-surface views the narrow-viewport bottom bar may offer. */
export type ControlView = "overview" | "rooms" | "devices";

export interface MobileNavItem {
  label: string;
  view: ControlView;
  buildPath: (basePath: string) => string;
}

/**
 * The narrow-viewport bottom bar's item descriptors, as pure data so a test
 * can assert the bar never promotes an operator view (automations, state,
 * logs, HomeKit, energy, weather) — those stay URL-reachable. The bar is a
 * control surface, not a debugger (design.md D10, D13). Icons are supplied
 * by the renderer; this module stays dependency-free.
 */
export const MOBILE_NAV_ITEMS: readonly MobileNavItem[] = [
  { label: "Home", view: "overview", buildPath: overviewPath },
  { label: "Rooms", view: "rooms", buildPath: roomsPath },
  { label: "Devices", view: "devices", buildPath: devicesPath },
];
