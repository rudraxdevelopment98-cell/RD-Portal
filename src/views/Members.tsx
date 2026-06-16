import { useState } from "react";
import { usePortal } from "../context/PortalContext";
import EmptyState from "../components/EmptyState";
import Modal from "../components/Modal";
import Avatar from "../components/Avatar";
import { ROLES, ALLSEC, SECTIONS, accessForRole } from "../lib/roles";
import { Store } from "../lib/store";
import type { Role } from "../lib/types";

function genUsername(name: string, users: any[]): string {
  const base = (name.trim().split(/\s+/)[0] || "user").toLowerCase().replace(/[^a-z]/g, "") || "user";
  let u = base, n = 1;
  while (users.some((x) => x.username === u)) { u = base + n; n++; }
  return u;
}

function genPassword(): string {
  const U = "ABCDEFGHJKLMNPQRSTUVWXYZ", l = "abcdefghijkmnpqrstuvwxyz", d = "23456789", s = "!@#$%&*";
  const pk = (z: string) => z[Math.floor(Math.random() * z.length)];
  const p = [pk(U), pk(U), pk(l), pk(l), pk(l), pk(d), pk(d), pk(d), pk(s), pk(s)];
  for (let i = p.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  return p.join("");
}

export default function Members() {
  const { state, proj, isPlatformAdmin, isManager, reload } = usePortal();
  const isCloud = Store.mode === "cloud";
  const [adding, setAdding] = useState(false);
  const [creds, setCreds] = useState<{ name: string; username: string; password: string } | null>(null);
  const [invited, setInvited] = useState<string | null>(null);
  const [form, setForm] = useState({ userId: "__new", newName: "", email: "", role: "Member" as Role, access: ALLSEC.slice() });

  if (!proj) return <EmptyState icon="⚙" message="No project selected." />;
  if (!isManager && !isPlatformAdmin) return <EmptyState icon="🔒" message="Only Owner / Admin can manage members." />;

  const members = state.members.filter((m) => m.projectId === proj.id);
  const invites = state.invites.filter((i) => i.projectId === proj.id);
  const existing = state.users.filter((u) => !members.some((m) => m.username === u.username));

  const setRole = (role: Role) => setForm((p) => ({ ...p, role, access: accessForRole(role) }));
  const toggleAccess = (sec: string) =>
    setForm((p) => ({
      ...p,
      access: p.access.includes(sec) ? p.access.filter((s) => s !== sec) : [...p.access, sec],
    }));

  const save = async () => {
    const role = form.role;
    const access = form.access;

    if (isCloud) {
      if (!form.email.trim()) return alert("Email required");
      const r = await Store.addMember({ email: form.email.trim(), projectId: proj.id, role, access });
      setAdding(false);
      await reload();
      if (r.status === "invited") {
        setInvited(form.email.trim());
      } else {
        await Store.addActivity("Added " + form.email + " to project");
      }
      return;
    }

    // local mode — original username/password flow
    if (form.userId === "__new") {
      if (!form.newName.trim()) return alert("Name required");
      const username = genUsername(form.newName, state.users);
      const password = genPassword();
      try {
        await Store.createAccount!({ name: form.newName, username, password });
      } catch (e: any) {
        return alert("Could not create: " + e.message);
      }
      await Store.addMember({ username, projectId: proj.id, role, access });
      await Store.addActivity("Added " + form.newName + " to project");
      setAdding(false);
      await reload();
      setCreds({ name: form.newName, username, password });
    } else {
      await Store.addMember({ username: form.userId, projectId: proj.id, role, access });
      await Store.addActivity("Added @" + form.userId + " to project");
      setAdding(false);
      await reload();
    }
  };

  const changeRole = async (id: string, role: Role) => {
    await Store.updateMember(id, { role, access: accessForRole(role) });
    await Store.addActivity(`Changed role to ${role}`);
    await reload();
  };

  const remove = async (id: string, username: string) => {
    if (!confirm(`Remove @${username} from this project?`)) return;
    await Store.removeMember(id);
    await Store.addActivity("Removed @" + username + " from project");
    await reload();
  };

  const cancelInvite = async (id: string, email: string) => {
    if (!confirm(`Cancel invite to ${email}?`)) return;
    await Store.cancelInvite!(id);
    await reload();
  };

  return (
    <>
      <div className="page-h">
        <div><h1>Members &amp; Roles</h1><p>Who's on {proj.name} and what they can do.</p></div>
        <div className="actions">
          <button className="btn primary" onClick={() => { setForm({ userId: "__new", newName: "", email: "", role: "Member", access: accessForRole("Member") }); setAdding(true); }}>
            + Add member
          </button>
        </div>
      </div>

      <div className="card">
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Member</th><th>Role</th><th>Access</th><th /></tr></thead>
            <tbody>
              {members.map((m) => {
                const u = state.users.find((x) => x.username === m.username) || { name: m.username, username: m.username };
                const isMe = m.username === Store.sessionUser();
                return (
                  <tr key={m.id}>
                    <td>
                      <div className="userc">
                        <Avatar name={u.name} size={30} radius="50%" />
                        <div>
                          <div className="nm">{u.name}</div>
                          <div className="un">@{m.username}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <select
                        value={m.role}
                        onChange={(e) => changeRole(m.id, e.target.value as Role)}
                        disabled={isMe}
                        style={{ width: "auto", padding: "5px 8px", fontSize: 12 }}
                      >
                        {Object.keys(ROLES).map((r) => <option key={r}>{r}</option>)}
                      </select>
                    </td>
                    <td style={{ fontFamily: "var(--mono)", fontSize: 10.5, color: "var(--muted)" }}>
                      {m.access.length} sections
                    </td>
                    <td style={{ textAlign: "right" }}>
                      {isMe
                        ? <span style={{ color: "var(--faint)", fontSize: 12, fontFamily: "var(--mono)" }}>you</span>
                        : <button className="btn danger sm" onClick={() => remove(m.id, m.username)}>Remove</button>
                      }
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="foot">{Store.mode === "cloud" ? "Cloud mode — real members via Supabase, sign-in via Google/GitHub." : "Local mode — data is in this browser."}</div>
      </div>

      {isCloud && invites.length > 0 && (
        <div className="card" style={{ marginTop: 14 }}>
          <div className="hd"><h3>Pending invites</h3></div>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Email</th><th>Role</th><th /></tr></thead>
              <tbody>
                {invites.map((i) => (
                  <tr key={i.id}>
                    <td style={{ fontFamily: "var(--mono)", fontSize: 12.5 }}>{i.email}</td>
                    <td><span className="chip slate">{i.role}</span></td>
                    <td style={{ textAlign: "right" }}>
                      <button className="btn danger sm" onClick={() => cancelInvite(i.id, i.email)}>Cancel</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="foot">They'll join automatically the moment they sign in with this email.</div>
        </div>
      )}

      {adding && (
        <Modal title="Add member" onClose={() => setAdding(false)} onOk={save} okLabel={isCloud ? "Send invite" : "Add to project"}>
          {isCloud ? (
            <label className="field"><span>Email</span>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                placeholder="e.g. asha@gmail.com"
                autoFocus
              />
            </label>
          ) : (
            <>
              <label className="field"><span>Person</span>
                <select value={form.userId} onChange={(e) => setForm((p) => ({ ...p, userId: e.target.value }))}>
                  <option value="__new">➕ Create new account…</option>
                  {existing.map((u) => <option key={u.username} value={u.username}>{u.name} (@{u.username})</option>)}
                </select>
              </label>
              {form.userId === "__new" && (
                <label className="field"><span>Full name</span>
                  <input value={form.newName} onChange={(e) => setForm((p) => ({ ...p, newName: e.target.value }))} placeholder="e.g. Asha Patel" />
                </label>
              )}
            </>
          )}
          <label className="field"><span>Role</span>
            <select value={form.role} onChange={(e) => setRole(e.target.value as Role)}>
              {Object.keys(ROLES).filter((r) => r !== "Owner").map((r) => <option key={r}>{r}</option>)}
            </select>
          </label>
          <div className="field">
            <span style={{ display: "block", fontFamily: "var(--mono)", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--faint)", marginBottom: 8 }}>Section access</span>
            <div className="checks">
              {SECTIONS.filter((s) => !s.global).map((s) => (
                <label key={s.id}>
                  <input type="checkbox" checked={form.access.includes(s.id)} onChange={() => toggleAccess(s.id)} style={{ width: "auto" }} />
                  {s.label}
                </label>
              ))}
            </div>
          </div>
        </Modal>
      )}

      {invited && (
        <Modal title="Invite sent ✓" onClose={() => setInvited(null)} okLabel="Done" onOk={() => setInvited(null)} hideCancel>
          <p style={{ margin: 0, color: "var(--muted)", fontSize: 13 }}>
            <b style={{ color: "var(--txt)" }}>{invited}</b> doesn't have an account yet. They'll be added to this
            project automatically the moment they sign in with Google or GitHub using that same email.
          </p>
        </Modal>
      )}

      {creds && (
        <Modal title="Account ready ✓" onClose={() => setCreds(null)} okLabel="Done" onOk={() => setCreds(null)} hideCancel>
          <p style={{ margin: "0 0 8px", color: "var(--muted)", fontSize: 13 }}>
            Share with <b style={{ color: "var(--txt)" }}>{creds.name}</b>. Shown once — copy now.
          </p>
          <div className="cred">
            <div><span>Username</span><b>{creds.username}</b></div>
            <div><span>Password</span><b>{creds.password}</b></div>
          </div>
          <button
            className="btn ghost sm"
            style={{ marginTop: 12 }}
            onClick={() => navigator.clipboard?.writeText(`RD Portal\nUser: ${creds.username}\nPass: ${creds.password}`)}
          >Copy credentials</button>
        </Modal>
      )}
    </>
  );
}
