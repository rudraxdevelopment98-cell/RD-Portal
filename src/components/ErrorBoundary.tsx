import React from "react";

interface Props { children: React.ReactNode; label?: string; onReset?: () => void; }
interface State { error: Error | null; }

/* Catches render errors so one broken view can't blank the whole app. */
export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("View crashed:", error, info);
  }

  reset = () => {
    this.setState({ error: null });
    this.props.onReset?.();
  };

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: "40px 24px", maxWidth: 560, margin: "0 auto", textAlign: "center" }}>
          <div style={{ fontSize: 34, marginBottom: 12 }}>⚠</div>
          <h2 style={{ margin: "0 0 8px" }}>Something went wrong{this.props.label ? ` on ${this.props.label}` : ""}</h2>
          <p style={{ color: "var(--muted)", fontSize: 13.5, lineHeight: 1.6, margin: "0 0 18px" }}>
            This view hit an unexpected error. The rest of the portal is fine — you can go back or reload.
          </p>
          <pre style={{ textAlign: "left", background: "var(--ink-2)", border: "1px solid var(--line-soft)", borderRadius: 9, padding: "10px 12px", fontSize: 11, color: "var(--coral)", overflow: "auto", marginBottom: 18 }}>
            {this.state.error.message}
          </pre>
          <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
            <button className="btn ghost" onClick={this.reset}>Dismiss</button>
            <button className="btn primary" onClick={() => location.reload()}>Reload portal</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
