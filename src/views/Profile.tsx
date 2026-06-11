import { useState } from "react";
import { usePortal } from "../context/PortalContext";
import Avatar from "../components/Avatar";
import { Store } from "../lib/store";

export default function Profile() {
  const { state, me, switchProject, go, reload } = usePortal();
  const [name, setName] = useState(me?.name ?? "");
  const [cur, setCur] = useState("");
  const [nw, setNw] = useState("");
  const [msg, setMsg] = useState("");
  const [msgColor, setMsgColor] = useState("var(--sage)");

  if (!me) return null;

  const saveName = async () => {
    if (!name.trim()) return;
    await Store.updateSelf({ name: name.trim() });
    await Store.addActivity("Updated profile");
    await reload();
  };

  const savePassword = async () => {
    if (Store.mode === "local" && cur !== me.password) {
      setMsgColor("var(--coral)"); setMsg("Current password is incorrect."); return;
    }
    if (nw.length < 6) {
      setMsgColor("var(--coral)"); setMsg("New password must be at least 6 characters."); return;
    }
    try {
      await Store.updateSelf({ password: nw });
      await Store.addActivity("Changed password");
      setMsgColor("var(--sage)"); setMsg("Password updated ✓");
      setCur(""); setNw("");
    } catch (e: any) {
      setMsgColor("var(--coral)"); setMsg("Could not update: " + e.message);
    }
  };

  const myMemberships = state.members.filter((m) => m.username === me.username);

  return (
    <>
      <div className="page-h">
        <div><h1>My Profile</h1><p>Your account and project memberships.</p></div>
      </div>

      <div className="grid c2">
        <div className="card">
          <div className="hd"><h3>Account</h3></div>
          <div className="bd">
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20 }}>
              <Avatar name={me.name} size={52} radius="50%" />
              <div>
                <div style={{ fontWeight: 700, fontSize: 17 }}>{me.name}</div>
                <div style={{ color: "var(--muted)", fontFamily: "var(--mono)", fontSize: 11 }}>
                  @{me.username}{me.platformAdmin ? " · platform admin" : ""}
                </div>
              </div>
            </div>
            <label className="field">
              <span>Display name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <button className="btn primary" onClick={saveName}>Save changes</button>
          </div>
        </div>

        <div className="card">
          <div className="hd"><h3>Change password</h3></div>
          <div className="bd">
            <label className="field">
              <span>Current password</span>
              <input type="password" value={cur} onChange={(e) => setCur(e.target.value)} placeholder="••••••••" />
            </label>
            <label className="field">
              <span>New password</span>
              <input type="password" value={nw} onChange={(e) => setNw(e.target.value)} placeholder="At least 6 characters" />
            </label>
            {msg && <div style={{ fontSize: 12.5, color: msgColor, marginBottom: 10 }}>{msg}</div>}
            <button className="btn primary" onClick={savePassword}>Update password</button>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <div className="hd"><h3>My projects &amp; roles</h3></div>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Project</th><th>Role</th><th /></tr></thead>
            <tbody>
              {myMemberships.map((m) => {
                const p = state.projects.find((x) => x.id === m.projectId);
                if (!p) return null;
                return (
                  <tr key={m.id}>
                    <td>
                      <div className="userc">
                        <div className="avatar" style={{ background: p.color, width: 28, height: 28, fontSize: 11, borderRadius: 8 }}>{p.key}</div>
                        <span className="nm">{p.name}</span>
                      </div>
                    </td>
                    <td><span className="chip coral">{m.role}</span></td>
                    <td style={{ textAlign: "right" }}>
                      {m.projectId === Store.activeProject()
                        ? <span className="chip sage">active</span>
                        : <button className="btn sm" onClick={() => { switchProject(m.projectId); go("dashboard"); }}>Open</button>
                      }
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
