/**
 * The harness control document's entrypoint: imports both stylesheets and mounts the
 * panel. Development entrypoint only.
 */
import { createRoot } from "react-dom/client";
import "../hearth.css";
import "../../styles/app.css";
import { HarnessPanel } from "./HarnessPanel.js";

const root = document.getElementById("harness-root");
if (!root) throw new Error("No #harness-root element found in the document.");

createRoot(root).render(<HarnessPanel />);
