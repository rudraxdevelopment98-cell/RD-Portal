import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { PortalProvider } from "./context/PortalContext";
import "./styles/theme.css";
import "./styles/shell.css";
import "./styles/mobile.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <PortalProvider>
      <App />
    </PortalProvider>
  </React.StrictMode>
);
