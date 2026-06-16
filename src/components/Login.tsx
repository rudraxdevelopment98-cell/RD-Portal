import { useState } from "react";
import { Store } from "../lib/store";
import { usePortal } from "../context/PortalContext";

export default function Login() {
  const oauth = Store.mode === "cloud" && !!Store.loginWithOAuth;
  const [busy, setBusy] = useState<"google" | "github" | "">("");

  const signIn = async (provider: "google" | "github") => {
    setBusy(provider);
    await Store.loginWithOAuth!(provider);
    // browser redirects away; nothing else to do here
  };

  return (
    <div className="login-wrap">
      <div className="login-card">
        <span className={`login-mode ${Store.mode}`}>
          ● {Store.mode === "cloud" ? "CLOUD" : "LOCAL"}
        </span>
        <div className="login-logo">R</div>
        <h1>RD Portal</h1>
        <p>Sign in to your workspace</p>

        {oauth ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10 }}>
            <button
              className="btn"
              style={{ width: "100%", justifyContent: "center", background: "#fff", color: "#1f1f1f" }}
              onClick={() => signIn("google")}
              disabled={!!busy}
            >
              {busy === "google" ? "Redirecting…" : "Continue with Google"}
            </button>
            <button
              className="btn"
              style={{ width: "100%", justifyContent: "center", background: "#171515", color: "#fff" }}
              onClick={() => signIn("github")}
              disabled={!!busy}
            >
              {busy === "github" ? "Redirecting…" : "Continue with GitHub"}
            </button>
          </div>
        ) : (
          <LocalLoginForm />
        )}
      </div>
    </div>
  );
}

function LocalLoginForm() {
  const { reload } = usePortal();
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!user.trim() || !Store.login) return;
    setBusy(true);
    setErr("Signing in…");
    const r = await Store.login(user.trim(), pass);
    if (r.error) { setErr(r.error); setBusy(false); return; }
    await Store.addActivity("Signed in");
    await reload();
  };

  const onKey = (e: React.KeyboardEvent) => { if (e.key === "Enter") submit(); };

  return (
    <>
      <label className="field">
        <span>Username</span>
        <input
          value={user}
          onChange={(e) => setUser(e.target.value)}
          onKeyDown={onKey}
          placeholder="username"
          autoComplete="username"
          autoFocus
        />
      </label>
      <label className="field">
        <span>Password</span>
        <input
          type="password"
          value={pass}
          onChange={(e) => setPass(e.target.value)}
          onKeyDown={onKey}
          placeholder="••••••••"
          autoComplete="current-password"
        />
      </label>

      <div className="login-err">{err}</div>

      <button className="btn primary" style={{ width: "100%", justifyContent: "center" }} onClick={submit} disabled={busy}>
        Sign in
      </button>

      {Store.firstRun() && (
        <div className="login-hint">
          <b>First run.</b> Default owner account:<br />
          username <b>kuldeep</b> · password <b>Shiva@2026</b><br />
          Change it under <b>My Profile</b> after signing in.
        </div>
      )}
    </>
  );
}
