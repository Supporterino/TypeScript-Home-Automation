// Lumen — the design system (the Tailwind entry). The single stylesheet: its
// tokens and utilities are the app's source of colour, spacing, and radius.
import "./styles/app.css";
import { createRoot } from "react-dom/client";
import { App } from "./App";

const root = document.getElementById("app");
if (!root) throw new Error("No #app element found in the document.");

createRoot(root).render(<App />);
