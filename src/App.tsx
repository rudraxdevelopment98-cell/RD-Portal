import { usePortal } from "./context/PortalContext";
import Login from "./components/Login";
import Shell from "./components/Shell";

export default function App() {
  const { state } = usePortal();

  if (state.loading) {
    return (
      <div style={{ position: "fixed", inset: 0, display: "grid", placeItems: "center", background: "var(--ink)" }}>
        <div style={{ fontFamily: "var(--mono)", fontSize: 11, letterSpacing: "0.2em", color: "var(--faint)", textTransform: "uppercase" }}>
          Loading…
        </div>
      </div>
    );
  }

  if (!state.sessionUser) return <Login />;
  return <Shell />;
}
