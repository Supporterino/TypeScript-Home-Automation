import "@mantine/core/styles.css";
import { createTheme, MantineProvider } from "@mantine/core";
import { createRoot } from "react-dom/client";
import { App } from "./App";

const theme = createTheme({
  primaryColor: "violet",
  fontFamily: "JetBrains Mono, Fira Code, Cascadia Code, ui-monospace, monospace",
  fontFamilyMonospace: "JetBrains Mono, Fira Code, Cascadia Code, ui-monospace, monospace",
});

const root = document.getElementById("app");
if (!root) throw new Error("No #app element found in the document.");

createRoot(root).render(
  <MantineProvider theme={theme} defaultColorScheme="auto">
    <App />
  </MantineProvider>,
);
