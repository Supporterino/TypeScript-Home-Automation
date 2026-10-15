/**
 * The harness stage document (design.md D2, D3, D4; tasks 4.1, 4.2).
 *
 * This document is the panel: the control document sizes its `<iframe>` to
 * 1920 x 1080 (or 1080 x 1920) and scales the *visual* result, so this is a real
 * viewport of the panel's own size and every viewport-derived wall value
 * resolves truthfully inside it — `vmin` in the type ramp, `window.innerHeight`
 * in `WallGrid`'s measurement, `100dvh`, and `matchMedia("(orientation:
 * portrait)")` in `useOrientation()` (D3).
 *
 * It mounts the production providers the wall needs — `RouterProvider` and
 * `DataStoreProvider`, seeded from the harness roster — and then the surface the
 * panel asked for: the production `WallGrid` with the draft it sent, or the
 * {@link Bench} rendering one widget's renderer directly (D7). `WallGrid`'s row
 * unit, gutter, centering rule, fit verdict, and zone bands are the wall's own by
 * construction; the bench is the one deliberate bypass, and it is a separate
 * module so that bypass stays explicit (D2).
 *
 * It also owns the wall's scheme: the panel's choice is written to *this*
 * document's `data-theme`, which is where Hearth scopes its light palette (5.2).
 */
import type { WallProfileConfig } from "@ts-ha/shared";
import { type ReactNode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { DataStoreProvider } from "../../lib/data-store.js";
import { RouterProvider } from "../../lib/router-context.js";
import { WallGrid } from "../WallGrid.js";
import { Bench } from "./Bench.js";
import { fixtureSetFor } from "./fixtures.js";
import { WALL_HARNESS_MARKER } from "./marker.js";
import {
  applyHarnessUpdate,
  EMPTY_STAGE_STATE,
  fixtureControlsKey,
  parseHarnessUpdate,
  type StageState,
  sendHarnessReady,
} from "./messages.js";
import "../../styles/app.css";
import "../hearth.css";

/**
 * The base path the wall's own links resolve against. The harness serves one
 * document per surface, so the path is fixed; nothing about it is configurable
 * at runtime (the fixture seam is a call-site decision only).
 */
const BASE_PATH = "/status";

function StageDocument() {
  // The last update, and the last composition the shared profile schema
  // accepted: a refused draft leaves the composition alone, so the stage goes on
  // showing one the engine would accept while every other panel control keeps
  // working (design.md D10).
  const [state, setState] = useState<StageState>(EMPTY_STAGE_STATE);
  const { update, config } = state;

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      // Same-origin by construction (the harness server serves both documents),
      // so anything else is not the panel.
      if (event.origin !== window.location.origin) return;
      const next = parseHarnessUpdate(event.data);
      if (next === null) return;
      setState((current) => applyHarnessUpdate(current, next));
    }

    window.addEventListener("message", onMessage);
    // Tell the panel we are mounted and listening, so it can send the draft it
    // already holds — that announcement is the only handshake either document
    // needs, and it repeats on every panel change, because a panel change is the
    // one thing that reloads this document (D3).
    sendHarnessReady();
    return () => window.removeEventListener("message", onMessage);
  }, []);

  // Hearth's light palette is scoped `[data-theme="light"] [data-wall-chunk]`, so
  // the attribute belongs on this document's root — the panel's document is a
  // different one, and its own chrome is Lumen's (task 5.2).
  useEffect(() => {
    if (update === null) return;
    document.documentElement.dataset.theme = update.theme;
  }, [update]);

  // The root wrapper carries WALL_HARNESS_MARKER — the string the asset test
  // asserts appears in no shipped asset (design.md D9) — and gives the document
  // a definite height, which the bench's own `h-full` layout needs and the wall
  // ignores (it sizes itself to the viewport).
  const frame = (content: ReactNode) => (
    <div data-harness={WALL_HARNESS_MARKER} style={{ height: "100%" }}>
      {content}
    </div>
  );

  if (update === null) {
    return frame(
      <p className="p-6 text-sm text-muted">
        Waiting for the harness panel. Open <code>/</code> to drive this stage.
      </p>,
    );
  }

  return frame(
    <RouterProvider basePath={BASE_PATH}>
      {/*
        The fixture set is a mount-time input to the store, which resolves its
        seed once — so a change to the panel's controls remounts the provider
        rather than re-seeding a live one. That remount is React's, inside this
        document: the document itself is not reloaded for a config or fixture
        change, only for a mode or panel change (D3, D5).
      */}
      <DataStoreProvider
        key={fixtureControlsKey(update.fixtures)}
        fixtures={fixtureSetFor(update.fixtures)}
      >
        {update.mode === "bench" ? (
          update.bench.widget === null ? (
            <p className="p-6 text-sm text-muted">
              No widget to bench. Select one in the harness panel.
            </p>
          ) : (
            <Bench widget={update.bench.widget} controls={update.bench} />
          )
        ) : config === null ? (
          // No composition has been accepted yet — the panel's very first draft
          // was already refused. Nothing invalid is rendered; the panel reports
          // why in its own validation list.
          <p className="p-6 text-sm text-muted">
            The panel’s draft is not a valid profile yet. Fix it in the harness panel.
          </p>
        ) : (
          <WallGrid config={config} />
        )}
      </DataStoreProvider>
    </RouterProvider>,
  );
}

const root = document.getElementById("stage-root");
if (!root) throw new Error("No #stage-root element found in the document.");

createRoot(root).render(<StageDocument />);
