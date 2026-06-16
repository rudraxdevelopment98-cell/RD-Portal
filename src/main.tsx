import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { PortalProvider } from "./context/PortalContext";
import ErrorBoundary from "./components/ErrorBoundary";
import "./styles/theme.css";
import "./styles/shell.css";
import "./styles/mobile.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <PortalProvider>
        <App />
      </PortalProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
