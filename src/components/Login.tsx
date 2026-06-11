import { useState } from "react";
import { Store } from "../lib/store";
import { usePortal } from "../context/PortalContext";

export default function Login() {
  const { reload } = usePortal();
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!user.trim()) return;
    setBusy(true);
    setErr("Signing in…");
    const r = await Store.login(user.trim(), pass);
    if (r.error) { setErr(r.error); setBusy(false); return; }
    await Store.addActivity("Signed in");
    await reload();
  };

  const onKey = (e: React.KeyboardEvent) => { if (e.key === "Enter") submit(); };

  return (
    <div className="login-wrap">
      <div className="login-card">
        <span className={`login-mode ${Store.mode}`}>
          ● {Store.mode === "cloud" ? "CLOUD" : "LOCAL"}
        </span>
        <div className="login-logo">R</div>
        <h1>RD Portal</h1>
        <p>Sign in to your workspace</p>

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
      </div>
    </div>
  );
}
