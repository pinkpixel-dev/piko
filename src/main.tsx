import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "@fontsource-variable/space-grotesk";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource-variable/jetbrains-mono";

import "./styles/tokens.css";
import "./styles/base.css";
import App from "./App";

const container = document.getElementById("root");
if (!container) throw new Error("Root element is missing from index.html");

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
