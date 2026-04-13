import "@mantine/core/styles.css";
import { MantineProvider } from "@mantine/core";
import { createRoot } from "react-dom/client";
import { App } from "./App";

// No theme overrides — use Mantine defaults throughout.
// Color scheme is controlled by MantineProvider defaultColorScheme="auto"
// and persisted in localStorage by Mantine's built-in color scheme manager.

const root = document.getElementById("app");
if (!root) throw new Error("No #app element found in the document.");

createRoot(root).render(
  <MantineProvider defaultColorScheme="auto">
    <App />
  </MantineProvider>,
);
