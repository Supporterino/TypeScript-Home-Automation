/**
 * History-API routing glue over the pure matcher in `router.ts` (design.md
 * D7; task 10.1). Deliberately thin — the only logic here is wiring
 * `popstate`/`pushState` to React state; route matching itself lives in
 * `router.ts` where it is reachable by `bun test` without a DOM (design.md
 * D23). This file is verified by hand.
 */
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { type RouteMatch, resolveRoute } from "./router.js";

interface RouterContextValue {
  basePath: string;
  pathname: string;
  route: RouteMatch;
  navigate: (path: string) => void;
}

const RouterContext = createContext<RouterContextValue | null>(null);

function currentPathname(): string {
  return window.location.pathname;
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
      window.history.pushState({}, "", path);
      setPathname(path);
    },
    [],
  );

  const route = useMemo(() => resolveRoute(pathname, basePath), [pathname, basePath]);

  const value = useMemo(
    () => ({ basePath, pathname, route, navigate }),
    [basePath, pathname, route, navigate],
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
