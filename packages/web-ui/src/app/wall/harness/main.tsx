/**
 * The harness control document's entrypoint (design.md D8; tasks 3.1, 3.2).
 *
 * Imports both stylesheets the wall needs and mounts the panel: Lumen
 * (`styles/app.css`, the Tailwind entry) for the panel's own chrome and Hearth
 * (`wall/hearth.css`) for the stage's mat, so a document that loads this file
 * proves both reached the browser. This is a development entrypoint only — no
 * shipped entry imports it (design.md D1, D9).
 */
import { createRoot } from "react-dom/client";
import "../hearth.css";
import "../../styles/app.css";
import { HarnessPanel } from "./HarnessPanel.js";

const root = document.getElementById("harness-root");
if (!root) throw new Error("No #harness-root element found in the document.");

createRoot(root).render(<HarnessPanel />);
