import { describe, expect, it } from "bun:test";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { Hono } from "hono";
import pino from "pino";
import { createWebUiService, WebUiService } from "../src/index.js";

// design.md D7; task 3.3: the plugin declares its own structural shape and
// mounts on a bare Hono app with no `@ts-ha/core` import.

const logger = pino({ level: "silent" });

async function makeApp(): Promise<Hono> {
  const app = new Hono();
  const service = createWebUiService({ path: "/status", token: "" });
  service.registerRoutes(app);
  // Routes are mounted before `onStart` runs (engine step 3 then step 7);
  // the logger only exists afterwards and is read lazily by handlers.
  await service.onStart({ logger });
  return app;
}

describe("WebUiService", () => {
  it("exposes the structural plugin shape", () => {
    const service = new WebUiService({ path: "/status", token: "" });
    expect(service.serviceKey).toBe("web-ui");
    expect(typeof service.registerRoutes).toBe("function");
    expect(typeof service.onStart).toBe("function");
  });

  it("mounts shell, assets, PWA, and auth routes on a bare Hono app", async () => {
    const app = await makeApp();

    const shell = await app.fetch(new Request("http://localhost/status"));
    expect(shell.status).toBe(200);
    expect(shell.headers.get("content-type")).toContain("text/html");

    const icon = await app.fetch(new Request("http://localhost/status/icon.svg"));
    expect(icon.status).toBe(200);
    expect(icon.headers.get("content-type")).toContain("image/svg+xml");

    const manifest = await app.fetch(new Request("http://localhost/status/manifest.json"));
    expect(manifest.status).toBe(200);
    expect(manifest.headers.get("content-type")).toContain("application/manifest+json");

    // With no token configured the login route redirects to the dashboard.
    const login = await app.fetch(new Request("http://localhost/status/login"));
    expect(login.status).toBe(302);
    expect(login.headers.get("location")).toBe("/status");
  });

  it("serves the login page when a token is configured", async () => {
    const app = new Hono();
    const service = createWebUiService({ path: "/status", token: "secret" });
    service.registerRoutes(app);
    await service.onStart({ logger });
    const login = await app.fetch(new Request("http://localhost/status/login"));
    expect(login.status).toBe(200);
    expect(login.headers.get("content-type")).toContain("text/html");
  });

  it("reads the logger lazily so a pre-onStart mount never dereferences it", async () => {
    // Registering routes without calling `onStart` must not throw; the
    // handlers only touch the logger at request time.
    const app = new Hono();
    const service = createWebUiService({ path: "/status", token: "secret" });
    expect(() => service.registerRoutes(app)).not.toThrow();

    // A failed login logs through the (still unset) logger without throwing.
    await service.onStart({ logger });
    const res = await app.fetch(
      new Request("http://localhost/status/login", {
        method: "POST",
        body: new URLSearchParams({ token: "wrong" }),
        headers: { "content-type": "application/x-www-form-urlencoded" },
      }),
    );
    expect(res.status).toBe(401);
  });

  it("has no @ts-ha/core import anywhere in the package source", async () => {
    const srcDir = join(import.meta.dirname, "..", "src");
    const offenders: string[] = [];

    async function walk(dir: string): Promise<void> {
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(full);
          continue;
        }
        if (!/\.(ts|tsx)$/.test(entry.name)) continue;
        const content = await readFile(full, "utf8");
        if (/from\s+["']@ts-ha\/core["']|import\s*\(\s*["']@ts-ha\/core["']/.test(content)) {
          offenders.push(full);
        }
      }
    }

    await walk(srcDir);
    expect(offenders).toEqual([]);
  });
});
