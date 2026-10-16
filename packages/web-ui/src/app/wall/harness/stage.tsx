/**
 * The harness stage document: a real viewport of the panel's own size, mounting the
 * production providers and the surface the panel asked for.
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
 * The base path the wall's own links resolve against. The harness serves one document
 * per surface, so the path is fixed.
 */
const BASE_PATH = "/status";

function StageDocument() {
  // A refused draft leaves the last accepted composition alone.
  const [state, setState] = useState<StageState>(EMPTY_STAGE_STATE);
  const { update, config } = state;

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      // Same-origin by construction; anything else is not the panel.
      if (event.origin !== window.location.origin) return;
      const next = parseHarnessUpdate(event.data);
      if (next === null) return;
      setState((current) => applyHarnessUpdate(current, next));
    }

    window.addEventListener("message", onMessage);
    // Tell the panel we are mounted and listening, so it can send the draft.
    sendHarnessReady();
    return () => window.removeEventListener("message", onMessage);
  }, []);

  // Hearth's light palette is scoped on this document's root, not the panel's.
  useEffect(() => {
    if (update === null) return;
    document.documentElement.dataset.theme = update.theme;
  }, [update]);

  // The wrapper carries WALL_HARNESS_MARKER and gives the document a definite height.
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
      {/* The fixture set is a mount-time input, so a change remounts the provider. */}
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
          // No composition has been accepted yet.
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
