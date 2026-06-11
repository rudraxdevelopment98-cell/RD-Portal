import { useState } from "react";
import { usePortal } from "../context/PortalContext";
import EmptyState from "../components/EmptyState";
import Modal from "../components/Modal";
import { priorityChip, statusChip } from "../components/Chip";
import Avatar from "../components/Avatar";
import { Store } from "../lib/store";
import { today } from "../lib/util";

export default function Tasks() {
  const { state, proj, isManager, inProj, assigneeName, reload } = usePortal();
  const [newTask, setNewTask] = useState(false);
  const [form, setForm] = useState({ title: "", desc: "", assignee: "", due: "", priority: "High", phase: "P0" });

  if (!proj) return <EmptyState icon="✓" message="No project selected." />;

  const tasks = inProj(state.tasks).slice().sort((a, b) => (a.due || "").localeCompare(b.due || ""));
  const cols = [
    { status: "To do", count: tasks.filter((t) => t.status === "To do").length },
    { status: "In progress", count: tasks.filter((t) => t.status === "In progress").length },
    { status: "Done", count: tasks.filter((t) => t.status === "Done").length },
  ];
  const members = state.members.filter((m) => m.projectId === proj.id);
  const td = today();

  const setStatus = async (id: string, status: string) => {
    await Store.updateTask(id, { status: status as any });
    await Store.addActivity(`Set task → ${status}`);
    await reload();
  };

  const deleteTask = async (id: string, title: string) => {
    if (!confirm(`Delete "${title}"?`)) return;
    await Store.deleteTask(id);
    await Store.addActivity("Deleted a task");
    await reload();
  };

  const createTask = async () => {
    if (!form.title.trim()) return alert("Title required");
    await Store.createTask({ ...form });
    await Store.addActivity("Created task: " + form.title);
    setNewTask(false);
    setForm({ title: "", desc: "", assignee: "", due: "", priority: "High", phase: "P0" });
    await reload();
  };

  const f = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((prev) => ({ ...prev, [k]: e.target.value }));

  return (
    <>
      <div className="page-h">
        <div>
          <h1>Tasks</h1>
          <p>{proj.name} — {tasks.length} task{tasks.length !== 1 ? "s" : ""}</p>
        </div>
        {isManager && (
          <div className="actions">
            <button className="btn primary" onClick={() => setNewTask(true)}>+ New task</button>
          </div>
        )}
      </div>

      {/* Status summary */}
      <div className="grid c3" style={{ marginBottom: 16 }}>
        {cols.map(({ status, count }) => (
          <div key={status} className="stat">
            <div className="v">{count}</div>
            <div className="l">{status}</div>
            <div className="pbar" style={{ marginTop: 10 }}>
              <i style={{ width: tasks.length ? `${(count / tasks.length) * 100}%` : "0%" }} />
            </div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Task</th>
                <th>Assignee</th>
                <th>Due</th>
                <th>Priority</th>
                <th>Status</th>
                {isManager && <th />}
              </tr>
            </thead>
            <tbody>
              {tasks.map((t) => {
                const late = t.status !== "Done" && t.due && t.due < td;
                const name = assigneeName(t.assignee);
                return (
                  <tr key={t.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{t.title}</div>
                      {t.desc && <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 2 }}>{t.desc}</div>}
                    </td>
                    <td>
                      <div className="userc">
                        <Avatar name={name} size={26} radius="50%" />
                        <span className="nm">{name}</span>
                      </div>
                    </td>
                    <td style={late ? { color: "var(--coral)", fontFamily: "var(--mono)", fontSize: 12 } : { fontFamily: "var(--mono)", fontSize: 12 }}>
                      {t.due || "—"}
                    </td>
                    <td>{priorityChip(t.priority)}</td>
                    <td>
                      <select
                        value={t.status}
                        onChange={(e) => setStatus(t.id, e.target.value)}
                        style={{ width: "auto", padding: "5px 8px", fontSize: 12 }}
                      >
                        {["To do", "In progress", "Done"].map((s) => <option key={s}>{s}</option>)}
                      </select>
                    </td>
                    {isManager && (
                      <td style={{ textAlign: "right" }}>
                        <button className="btn danger sm" onClick={() => deleteTask(t.id, t.title)}>Delete</button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!tasks.length && <EmptyState icon="✓" message="No tasks yet." />}
        </div>
      </div>

      {newTask && (
        <Modal title="New task" onClose={() => setNewTask(false)} onOk={createTask} okLabel="Create task">
          <label className="field"><span>Title</span>
            <input value={form.title} onChange={f("title")} placeholder="Task title" autoFocus />
          </label>
          <label className="field"><span>Description</span>
            <input value={form.desc} onChange={f("desc")} placeholder="Short detail (optional)" />
          </label>
          <div className="row">
            <label className="field"><span>Assign to</span>
              <select value={form.assignee} onChange={f("assignee")}>
                <option value="">Unassigned</option>
                {members.map((m) => {
                  const u = state.users.find((x) => x.username === m.username);
                  return <option key={m.username} value={m.username}>{u?.name ?? m.username}</option>;
                })}
              </select>
            </label>
            <label className="field"><span>Due date</span>
              <input type="date" value={form.due} onChange={f("due")} />
            </label>
          </div>
          <div className="row">
            <label className="field"><span>Priority</span>
              <select value={form.priority} onChange={f("priority")}>
                {["Critical", "High", "Medium", "Low"].map((p) => <option key={p}>{p}</option>)}
              </select>
            </label>
            <label className="field"><span>Phase</span>
              <select value={form.phase} onChange={f("phase")}>
                {(proj.phases?.length ? proj.phases : [{ num: "P0", label: "Phase 1", name: "", status: "" }]).map((ph) => (
                  <option key={ph.num} value={ph.num}>{ph.label}{ph.name ? ` · ${ph.name}` : ""}</option>
                ))}
              </select>
            </label>
          </div>
        </Modal>
      )}
    </>
  );
}
