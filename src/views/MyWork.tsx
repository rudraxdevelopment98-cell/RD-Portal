import { usePortal } from "../context/PortalContext";
import { Store } from "../lib/store";
import EmptyState from "../components/EmptyState";
import { priorityChip, statusChip } from "../components/Chip";
import { today } from "../lib/util";

export default function MyWork() {
  const { state, me, myProjects, go, switchProject, reload } = usePortal();
  if (!me) return null;

  const ids = new Set(myProjects.map((p) => p.id));
  const mine = state.tasks.filter((t) => t.assignee === me.username && ids.has(t.projectId));
  const open = mine.filter((t) => t.status !== "Done");
  const done = mine.filter((t) => t.status === "Done").length;
  const td = today();
  const overdue = open.filter((t) => t.due && t.due < td).length;
  const dueToday = open.filter((t) => t.due === td).length;

  const setStatus = async (taskId: string, status: string, projectId: string) => {
    await Store.updateTask(taskId, { status: status as any });
    await Store.addActivity(`Set task → ${status}`, projectId);
    await reload();
  };

  const toggle = async (taskId: string, cur: string, projectId: string) => {
    const ns = cur === "Done" ? "To do" : "Done";
    await setStatus(taskId, ns, projectId);
  };

  // group by project
  const byProject = myProjects
    .map((p) => ({
      p,
      tasks: mine
        .filter((t) => t.projectId === p.id)
        .sort((a, b) => (a.status === "Done" ? 1 : 0) - (b.status === "Done" ? 1 : 0) || (a.due || "").localeCompare(b.due || "")),
    }))
    .filter((g) => g.tasks.length > 0);

  return (
    <>
      <div className="page-h">
        <div>
          <h1>My Work</h1>
          <p>Everything assigned to you across {myProjects.length} project{myProjects.length !== 1 ? "s" : ""}.</p>
        </div>
      </div>

      <div className="grid c4" style={{ marginBottom: 20 }}>
        {[
          { v: open.length, l: "Open tasks", tone: "var(--coral)" },
          { v: dueToday, l: "Due today", tone: "var(--gold)" },
          { v: overdue, l: "Overdue", tone: overdue > 0 ? "var(--coral)" : "var(--muted)" },
          { v: done, l: "Completed", tone: "var(--sage)" },
        ].map(({ v, l, tone }) => (
          <div key={l} className="stat">
            <div className="v" style={{ color: tone }}>{v}</div>
            <div className="l">{l}</div>
          </div>
        ))}
      </div>

      {byProject.length === 0 ? (
        <EmptyState icon="◈" message="Nothing assigned to you yet — enjoy the calm." />
      ) : (
        byProject.map(({ p, tasks }) => {
          const doneCount = tasks.filter((t) => t.status === "Done").length;
          return (
            <div key={p.id} className="card" style={{ marginBottom: 14, borderLeft: `3px solid ${p.color}` }}>
              <div className="hd">
                <div className="avatar" style={{ background: p.color, width: 26, height: 26, fontSize: 10, borderRadius: 7 }}>
                  {p.key}
                </div>
                <h3>{p.name}</h3>
                <span style={{ fontFamily: "var(--mono)", fontSize: 10.5, color: "var(--muted)" }}>
                  {doneCount}/{tasks.length}
                </span>
                <div className="actions">
                  <button className="btn ghost sm" onClick={() => { switchProject(p.id); go("tasks"); }}>
                    Open project
                  </button>
                </div>
              </div>
              <div className="bd" style={{ padding: 0 }}>
                {tasks.map((t) => {
                  const late = t.status !== "Done" && t.due && t.due < td;
                  return (
                    <div
                      key={t.id}
                      className="task"
                      data-s={t.status}
                      style={{ margin: "6px 14px", cursor: "default" }}
                    >
                      <div
                        className="led"
                        style={{ cursor: "pointer" }}
                        onClick={() => toggle(t.id, t.status, t.projectId)}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="tt">{t.title}</div>
                        <div className="meta">
                          {t.due && <span style={late ? { color: "var(--coral)" } : {}}>{t.due}</span>}
                          {t.due && " · "}
                          {priorityChip(t.priority)}
                        </div>
                      </div>
                      <select
                        value={t.status}
                        onChange={(e) => setStatus(t.id, e.target.value, t.projectId)}
                        style={{ width: "auto", padding: "5px 8px", fontSize: 12 }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {["To do", "In progress", "Done"].map((s) => (
                          <option key={s}>{s}</option>
                        ))}
                      </select>
                    </div>
                  );
                })}
                <div style={{ height: 8 }} />
              </div>
            </div>
          );
        })
      )}
    </>
  );
}
