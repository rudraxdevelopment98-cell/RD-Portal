import { usePortal } from "../context/PortalContext";
import EmptyState from "../components/EmptyState";
import { Store } from "../lib/store";
import { fmt, today } from "../lib/util";

export default function Dashboard() {
  const { state, me, proj, myRole, inProj, assigneeName, go, reload } = usePortal();
  if (!proj || !me) return <EmptyState icon="▦" message="No project selected." />;

  const T = inProj(state.tasks);
  const myTasks = T.filter((t) => t.assignee === me.username);
  const myDone = myTasks.filter((t) => t.status === "Done").length;
  const allDone = T.filter((t) => t.status === "Done").length;
  const prog = T.length ? Math.round((allDone / T.length) * 100) : 0;
  const members = state.members.filter((m) => m.projectId === proj.id).length;
  const td = today();
  const overdue = T.filter((t) => t.status !== "Done" && t.assignee === me.username && t.due && t.due < td).length;
  const activity = inProj(state.activity);

  const toggle = async (id: string, cur: string) => {
    const ns = cur === "Done" ? "To do" : "Done";
    await Store.updateTask(id, { status: ns as any });
    await Store.addActivity((ns === "Done" ? "Completed" : "Reopened") + " a task");
    await reload();
  };

  const upcomingTasks = myTasks.filter((t) => t.status !== "Done").slice(0, 6);

  return (
    <>
      <div className="page-h">
        <div>
          <h1>Welcome back, {me.name.split(" ")[0]}</h1>
          <p>{proj.name} · <span style={{ color: "var(--coral)" }}>{myRole}</span></p>
        </div>
      </div>

      <div className="grid c4" style={{ marginBottom: 16 }}>
        {[
          { v: `${myDone}/${myTasks.length}`, l: "My tasks done", c: "var(--coral)" },
          { v: myTasks.length - myDone, l: "My open tasks", c: "var(--gold)" },
          { v: overdue, l: "Overdue", c: overdue > 0 ? "var(--coral)" : "var(--muted)" },
          { v: members, l: "Team members", c: "var(--sage)" },
        ].map(({ v, l, c }) => (
          <div key={l} className="stat">
            <div className="v" style={{ color: c }}>{v}</div>
            <div className="l">{l}</div>
          </div>
        ))}
      </div>

      <div className="grid c3">
        {/* My tasks */}
        <div className="card" style={{ gridColumn: "span 2" }}>
          <div className="hd">
            <h3>My tasks</h3>
            <div className="actions">
              <button className="btn ghost sm" onClick={() => go("tasks")}>View all</button>
            </div>
          </div>
          <div className="bd">
            {upcomingTasks.length ? (
              upcomingTasks.map((t) => {
                const late = t.due && t.due < td;
                return (
                  <div key={t.id} className="task" data-s={t.status} style={{ cursor: "default" }}>
                    <div className="led" style={{ cursor: "pointer" }} onClick={() => toggle(t.id, t.status)} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="tt">{t.title}</div>
                      <div className="meta" style={late ? { color: "var(--coral)" } : {}}>
                        {t.due ? `Due ${t.due}` : "No due date"}
                        {late ? " · overdue" : ""}
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div style={{ textAlign: "center", padding: "20px 0", color: "var(--muted)", fontSize: 13 }}>
                ✓ All caught up
              </div>
            )}
          </div>
        </div>

        {/* Progress */}
        <div className="card">
          <div className="hd"><h3>Project progress</h3></div>
          <div className="bd">
            <div style={{ fontFamily: "var(--mono)", fontSize: 32, fontWeight: 700, color: prog >= 75 ? "var(--sage)" : prog >= 40 ? "var(--gold)" : "var(--txt)" }}>
              {prog}%
            </div>
            <div style={{ color: "var(--muted)", fontSize: 12.5, margin: "4px 0 14px" }}>
              {allDone} of {T.length} tasks complete
            </div>
            <div className="pbar"><i style={{ width: `${prog}%` }} /></div>
            <button className="btn ghost sm" style={{ marginTop: 14 }} onClick={() => go("roadmap")}>
              View roadmap →
            </button>
          </div>
        </div>
      </div>

      {/* Recent activity */}
      <div className="card" style={{ marginTop: 14 }}>
        <div className="hd">
          <h3>Recent activity</h3>
          <div className="actions">
            <button className="btn ghost sm" onClick={() => go("activity")}>All activity</button>
          </div>
        </div>
        <div className="bd" style={{ padding: "8px 17px" }}>
          {activity.slice(0, 6).map((a) => (
            <div key={a.id} style={{ display: "flex", gap: 12, padding: "9px 0", borderBottom: "1px solid var(--line-soft)" }}>
              <div className="avatar" style={{ background: a.user === "system" ? "var(--slate)" : `var(--coral)`, width: 28, height: 28, fontSize: 11, borderRadius: "50%", flex: "none" }}>
                {a.user === "system" ? "◆" : a.user.slice(0, 2).toUpperCase()}
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>
                  {a.user === "system" ? "System" : assigneeName(a.user)} — {a.action}
                </div>
                <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--faint)" }}>{fmt(a.time)}</div>
              </div>
            </div>
          ))}
          {!activity.length && <div style={{ color: "var(--muted)", fontSize: 13, padding: "8px 0" }}>No activity yet.</div>}
        </div>
      </div>
    </>
  );
}
