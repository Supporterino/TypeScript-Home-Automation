/**
 * History-API routing glue over the pure matcher in `router.ts` (design.md
 * D7; task 10.1; wall-zones-and-fit D11). Deliberately thin — the only logic
 * here is wiring `popstate`/`pushState` to React state; route matching itself
 * lives in `router.ts` where it is reachable by `bun test` without a DOM
 * (design.md D23). This file is verified by hand.
 *
 * Each in-app navigation records the path it was pushed from in the history
 * entry's state, so a surface can ask how it was reached — the wall's back
 * affordance is the one consumer (a wall opened from another wall offers a way
 * back; a deep link does not). The record rides the browser's own history, so it
 * survives a reload of that entry, and going back restores the earlier entry's
 * own origin.
 */
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { type RouteMatch, resolveRoute } from "./router.js";

interface RouterContextValue {
  basePath: string;
  pathname: string;
  route: RouteMatch;
  navigate: (path: string) => void;
  /**
   * The pathname this entry was navigated from within the app, or `null` when the
   * entry was loaded directly (a deep link, a reload of a deep entry, or an
   * external navigation). Read from the entry's own history state.
   */
  origin: string | null;
}

const RouterContext = createContext<RouterContextValue | null>(null);

function currentPathname(): string {
  return window.location.pathname;
}

/** The pathname the current history entry was pushed from within the app, or `null`. */
function originPathname(): string | null {
  const state: unknown = window.history.state;
  if (typeof state !== "object" || state === null) return null;
  const from: unknown = (state as { from?: unknown }).from;
  return typeof from === "string" ? from : null;
}

export function RouterProvider({ basePath, children }: { basePath: string; children: ReactNode }) {
  const [pathname, setPathname] = useState(currentPathname);

  useEffect(() => {
    function onPopState() {
      setPathname(currentPathname());
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const navigate = useMemo(
    () => (path: string) => {
      if (path === window.location.pathname) return;
      window.history.pushState({ from: window.location.pathname }, "", path);
      setPathname(path);
    },
    [],
  );

  const route = useMemo(() => resolveRoute(pathname, basePath), [pathname, basePath]);
  // Re-read the entry's origin whenever the entry changes: a push and a pop both
  // land here.
  const origin = useMemo(() => originPathname(), [pathname]);

  const value = useMemo(
    () => ({ basePath, pathname, route, navigate, origin }),
    [basePath, pathname, route, navigate, origin],
  );

  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
}

export function useRouter(): RouterContextValue {
  const ctx = useContext(RouterContext);
  if (!ctx) throw new Error("useRouter() called outside a <RouterProvider>");
  return ctx;
}

/** Renders an `<a>` that navigates via the History API on a plain left click, letting every other click behave natively (open in new tab, etc). */
export function Link({
  to,
  children,
  ...rest
}: { to: string; children: ReactNode } & Omit<
  React.AnchorHTMLAttributes<HTMLAnchorElement>,
  "href"
>) {
  const { navigate } = useRouter();
  return (
    <a
      href={to}
      {...rest}
      onClick={(e) => {
        if (e.defaultPrevented || e.button !== 0) return;
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        navigate(to);
      }}
    >
      {children}
    </a>
  );
}
