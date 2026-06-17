import { useState } from "react";
import { usePortal } from "../context/PortalContext";
import EmptyState from "../components/EmptyState";
import Modal from "../components/Modal";
import { priorityChip, statusChip } from "../components/Chip";
import Avatar from "../components/Avatar";
import { Store } from "../lib/store";
import { today } from "../lib/util";
import { generatePlan, dueFor, type PlanTask } from "../lib/taskplan";
import type { Priority } from "../lib/types";

type TaskForm = { title: string; desc: string; assignee: string; due: string; priority: Priority; phase: string };
const BLANK: TaskForm = { title: "", desc: "", assignee: "", due: "", priority: "High", phase: "P0" };

export default function Tasks() {
  const { state, proj, isManager, inProj, assigneeName, reload } = usePortal();
  const [newTask, setNewTask] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<TaskForm>(BLANK);
  const [plan, setPlan] = useState<PlanTask[] | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [creating, setCreating] = useState(false);

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

  const openEdit = (t: (typeof tasks)[0]) => {
    setForm({ title: t.title, desc: t.desc || "", assignee: t.assignee || "", due: t.due || "", priority: t.priority, phase: t.phase || "P0" });
    setEditId(t.id);
  };

  const createTask = async () => {
    if (!form.title.trim()) return alert("Title required");
    await Store.createTask({ ...form });
    await Store.addActivity("Created task: " + form.title);
    setNewTask(false);
    setForm(BLANK);
    await reload();
  };

  const saveEdit = async () => {
    if (!editId) return;
    if (!form.title.trim()) return alert("Title required");
    await Store.updateTask(editId, { ...form });
    await Store.addActivity("Updated task: " + form.title);
    setEditId(null);
    setForm(BLANK);
    await reload();
  };

  const f = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((prev) => ({ ...prev, [k]: e.target.value }));

  const openPlan = () => {
    const p = generatePlan(proj);
    setPlan(p);
    setPicked(new Set(p.map((_, i) => i)));
  };

  const togglePick = (i: number) =>
    setPicked((prev) => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });

  const createPlan = async () => {
    if (!plan) return;
    setCreating(true);
    try {
      // create in plan order so daily-staggered due dates line up
      for (let i = 0; i < plan.length; i++) {
        if (!picked.has(i)) continue;
        const t = plan[i];
        await Store.createTask({ title: t.title, desc: t.desc, assignee: "", due: dueFor(i), priority: t.priority, status: "To do", phase: t.phase, source: "manual" });
      }
      await Store.addActivity(`Auto-generated ${picked.size} task${picked.size !== 1 ? "s" : ""}`);
      setPlan(null);
      await reload();
    } finally {
      setCreating(false);
    }
  };

  // group plan rows by their phase label for the preview
  const planGroups: { group: string; items: { t: PlanTask; i: number }[] }[] = [];
  (plan || []).forEach((t, i) => {
    let g = planGroups.find((x) => x.group === t.group);
    if (!g) { g = { group: t.group, items: [] }; planGroups.push(g); }
    g.items.push({ t, i });
  });

  return (
    <>
      <div className="page-h">
        <div>
          <h1>Tasks</h1>
          <p>{proj.name} — {tasks.length} task{tasks.length !== 1 ? "s" : ""}</p>
        </div>
        {isManager && (
          <div className="actions">
            <button className="btn" onClick={openPlan}>⚡ Auto-generate</button>
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
                      <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                        <button className="btn sm" style={{ marginRight: 6 }} onClick={() => openEdit(t)}>Edit</button>
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

      {editId && (
        <Modal title="Edit task" onClose={() => { setEditId(null); setForm(BLANK); }} onOk={saveEdit} okLabel="Save changes">
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

      {plan && (
        <Modal
          title="Auto-generate tasks"
          onClose={() => setPlan(null)}
          onOk={createPlan}
          okLabel={creating ? "Creating…" : `Create ${picked.size} task${picked.size !== 1 ? "s" : ""}`}
          okDisabled={creating || picked.size === 0}
        >
          <p style={{ color: "var(--muted)", fontSize: 13, lineHeight: 1.6, marginTop: 0 }}>
            A starter plan for <b style={{ color: "var(--txt)" }}>{proj.name}</b>, built phase by phase from its
            roadmap and tech stack. Due dates are staggered one per day. Untick anything you don't want, then create —
            tasks land as <b style={{ color: "var(--txt)" }}>To do</b> &amp; unassigned, ready for you to allocate.
          </p>
          {planGroups.map((g) => (
            <div key={g.group} style={{ marginBottom: 14 }}>
              <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--coral)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 6 }}>
                {g.group}
              </div>
              {g.items.map(({ t, i }) => (
                <label
                  key={i}
                  style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "8px 10px", borderRadius: 9, border: "1px solid var(--line)", marginBottom: 6, cursor: "pointer", opacity: picked.has(i) ? 1 : 0.5 }}
                >
                  <input type="checkbox" checked={picked.has(i)} onChange={() => togglePick(i)} style={{ marginTop: 3 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontWeight: 600 }}>{t.title}</span>
                      {priorityChip(t.priority)}
                      <span style={{ marginLeft: "auto", fontFamily: "var(--mono)", fontSize: 11, color: "var(--muted)" }}>{dueFor(i)}</span>
                    </div>
                    {t.desc && <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 2 }}>{t.desc}</div>}
                  </div>
                </label>
              ))}
            </div>
          ))}
        </Modal>
      )}
    </>
  );
}
