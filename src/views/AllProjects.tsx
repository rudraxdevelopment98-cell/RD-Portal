import { useState } from "react";
import { usePortal } from "../context/PortalContext";
import EmptyState from "../components/EmptyState";
import Modal from "../components/Modal";
import { PCOLORS } from "../lib/roles";
import { Store } from "../lib/store";
import type { NewProjectInput } from "../lib/types";

export default function AllProjects() {
  const { state, isPlatformAdmin, switchProject, go, reload } = usePortal();
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<NewProjectInput>({ name: "", key: "", color: PCOLORS[0], desc: "", repo: "" });

  if (!isPlatformAdmin) return <EmptyState icon="🔒" message="Platform admin only." />;

  const f = (k: keyof NewProjectInput) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.value }));

  const create = async () => {
    if (!form.name.trim()) return alert("Name required");
    const key = (form.key || form.name.slice(0, 3)).toUpperCase();
    const p = await Store.createProject({ ...form, key });
    await Store.setActive(p.id);
    await Store.addActivity("Created project: " + form.name, p.id);
    setCreating(false);
    setForm({ name: "", key: "", color: PCOLORS[0], desc: "", repo: "" });
    await reload();
    go("dashboard");
  };

  const del = async (id: string, name: string) => {
    if (!confirm(`Delete project "${name}" and ALL its data? This cannot be undone.`)) return;
    await Store.deleteProject(id);
    await reload();
  };

  return (
    <>
      <div className="page-h">
        <div><h1>All Projects</h1><p>Create and manage every project + accounts.</p></div>
        <div className="actions">
          <button className="btn primary" onClick={() => setCreating(true)}>+ New project</button>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14, marginBottom: 24 }}>
        {state.projects.map((p) => {
          const mc = state.members.filter((m) => m.projectId === p.id).length;
          const tc = state.tasks.filter((t) => t.projectId === p.id).length;
          return (
            <div key={p.id} className="stat" style={{ borderLeft: `3px solid ${p.color}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <div className="avatar" style={{ background: p.color, width: 36, height: 36, fontSize: 13, borderRadius: 10 }}>
                  {p.key}
                </div>
                <div>
                  <div style={{ fontWeight: 700 }}>{p.name}</div>
                  <div style={{ fontSize: 12, color: "var(--muted)" }}>{mc} members · {tc} tasks</div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button className="btn sm" onClick={() => { switchProject(p.id); go("dashboard"); }}>Open</button>
                <button className="btn danger sm" onClick={() => del(p.id, p.name)}>Delete</button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="card">
        <div className="hd">
          <h3>People (accounts)</h3>
        </div>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Name</th><th>Username</th><th>Projects</th><th>Role</th></tr></thead>
            <tbody>
              {state.users.map((u) => {
                const pc = state.members.filter((m) => m.username === u.username).length;
                return (
                  <tr key={u.id}>
                    <td style={{ fontWeight: 600 }}>{u.name}</td>
                    <td style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--muted)" }}>@{u.username}</td>
                    <td style={{ fontFamily: "var(--mono)", fontSize: 12 }}>{pc}</td>
                    <td>{u.platformAdmin ? <span className="chip coral">Admin</span> : <span style={{ color: "var(--faint)" }}>—</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {creating && (
        <Modal title="New project" onClose={() => setCreating(false)} onOk={create} okLabel="Create project">
          <label className="field"><span>Project name</span>
            <input value={form.name} onChange={f("name")} placeholder="e.g. My App" autoFocus />
          </label>
          <div className="row">
            <label className="field"><span>Short key (2–4 letters)</span>
              <input value={form.key} onChange={f("key")} placeholder="APP" maxLength={4} />
            </label>
            <label className="field"><span>GitHub repo (optional)</span>
              <input value={form.repo} onChange={f("repo")} placeholder="owner/repo" />
            </label>
          </div>
          <label className="field"><span>Description</span>
            <input value={form.desc} onChange={f("desc")} placeholder="One-liner" />
          </label>
          <div className="field">
            <span style={{ display: "block", fontFamily: "var(--mono)", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--faint)", marginBottom: 8 }}>Colour</span>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {PCOLORS.map((c) => (
                <label key={c} style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                  <input type="radio" name="pcolor" value={c} checked={form.color === c} onChange={() => setForm((p) => ({ ...p, color: c }))} style={{ display: "none" }} />
                  <span style={{ width: 22, height: 22, borderRadius: 6, background: c, display: "block", border: form.color === c ? "2px solid var(--txt)" : "2px solid transparent", transition: "0.15s" }} />
                </label>
              ))}
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
