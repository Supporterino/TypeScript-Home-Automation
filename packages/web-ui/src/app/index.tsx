import "@mantine/core/styles.css";
// Token layer imported after Mantine so the Ambient Glass tokens win the
// cascade where the two define the same property.
import "./styles/tokens.css";
import { MantineProvider } from "@mantine/core";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { ambientTheme } from "./theme.js";

// Ambient Glass theme supplies the palette, radii, fonts, and component
// defaults. Color scheme is controlled by MantineProvider
// defaultColorScheme="auto" and persisted in localStorage by Mantine's
// built-in color scheme manager; light/dark token values switch on the
// data-mantine-color-scheme attribute.

const root = document.getElementById("app");
if (!root) throw new Error("No #app element found in the document.");

createRoot(root).render(
  <MantineProvider theme={ambientTheme} defaultColorScheme="auto">
    <App />
  </MantineProvider>,
);
