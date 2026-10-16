/**
 * Pure client-side route matching. The route table must stay in sync with the
 * server's `UI_VIEW_SEGMENTS` allowlist; an unmatched path resolves to `"not-found"`.
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
  | "wall"
  | "walls"
  | "not-found";

export interface RouteMatch {
  view: ViewName;
  params: Record<string, string>;
}

interface RoutePattern {
  segments: string[];
  view: ViewName;
}

// Written most-specific-first for readability; static segments are tried
// first regardless of table order (see `matchRoute`).
const ROUTE_TABLE: { pattern: string; view: ViewName }[] = [
  { pattern: "/", view: "overview" },
  // Alias for the landing view so the server registration stays in sync; `/` is
  // the canonical landing path.
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
  { pattern: "/walls", view: "walls" },
  { pattern: "/wall/:name", view: "wall" },
];

function splitSegments(path: string): string[] {
  return path.split("/").filter((s) => s.length > 0);
}

const COMPILED_ROUTES: RoutePattern[] = ROUTE_TABLE.map((r) => ({
  segments: splitSegments(r.pattern),
  view: r.view,
}));

/**
 * Strips `basePath` from the start of `pathname`, returning the remainder or
 * `null` when `pathname` is not beneath `basePath`.
 */
export function stripBasePath(pathname: string, basePath: string): string | null {
  if (basePath === "/") return pathname;
  if (pathname === basePath) return "/";
  if (pathname.startsWith(`${basePath}/`)) return pathname.slice(basePath.length);
  return null;
}

/**
 * Matches a base-path-stripped `pathname` against the route table. A `:id`
 * segment captures and URI-decodes; static segments win at the same position.
 */
export function matchRoute(strippedPathname: string): RouteMatch {
  const requestSegments = splitSegments(strippedPathname);

  const candidates = COMPILED_ROUTES.filter((r) => r.segments.length === requestSegments.length);

  // Rank candidates by static-segment count so a literal match is tried before
  // a param capture of the same length.
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
 * beneath it, so a detail route keeps its collection entry active.
 */
export function isUnder(pathname: string, collectionPath: string): boolean {
  return pathname === collectionPath || pathname.startsWith(`${collectionPath}/`);
}

/**
 * Whether `pathname` resolves to the overview view, covering both the base path
 * and the `/overview` alias.
 */
export function isOverviewView(pathname: string, basePath: string): boolean {
  return resolveRoute(pathname, basePath).view === "overview";
}

/**
 * Whether `view` renders full-bleed, without the application chrome; the wall
 * is the only such view.
 */
export function isFullBleedView(view: ViewName): boolean {
  return view === "wall";
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

export function wallsPath(basePath: string): string {
  return joinBasePath(basePath, "/walls");
}

export function wallPath(basePath: string, name: string): string {
  return joinBasePath(basePath, `/wall/${encodeURIComponent(name)}`);
}

/**
 * The wall a wall was opened from, as the path to return to, or `null` when the
 * previous route was not a wall.
 */
export function backToWallPath(originPathname: string | null, basePath: string): string | null {
  if (originPathname === null) return null;
  const match = resolveRoute(originPathname, basePath);
  if (match.view !== "wall") return null;
  const name = match.params.name;
  return name === undefined ? null : wallPath(basePath, name);
}

// ── Mobile bottom bar — control-only ─────────────────────────────────────

/** The control-surface views the narrow-viewport bottom bar may offer. */
export type ControlView = "overview" | "rooms" | "devices";

export interface MobileNavItem {
  label: string;
  view: ControlView;
  buildPath: (basePath: string) => string;
}

/**
 * The narrow-viewport bottom bar's item descriptors. The bar is a control
 * surface only, so it never promotes an operator view.
 */
export const MOBILE_NAV_ITEMS: readonly MobileNavItem[] = [
  { label: "Home", view: "overview", buildPath: overviewPath },
  { label: "Rooms", view: "rooms", buildPath: roomsPath },
  { label: "Devices", view: "devices", buildPath: devicesPath },
];
