import { usePortal } from "../context/PortalContext";
import GitHubPanel from "../components/GitHubPanel";
import EmptyState from "../components/EmptyState";
import Avatar from "../components/Avatar";
import { today } from "../lib/util";

export default function Portfolio() {
  const { state, myProjects, go, switchProject } = usePortal();

  if (!myProjects.length) return (
    <EmptyState icon="◳" message="No projects yet. Create one from <b>All Projects</b>." />
  );

  const td = today();

  return (
    <>
      <div className="page-h">
        <div>
          <h1>Portfolio</h1>
          <p>All your projects at a glance.</p>
        </div>
      </div>

      <div className="grid proj-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 16 }}>
        {myProjects.map((p) => {
          const tasks = state.tasks.filter((t) => t.projectId === p.id);
          const done = tasks.filter((t) => t.status === "Done").length;
          const open = tasks.filter((t) => t.status !== "Done").length;
          const overdue = tasks.filter((t) => t.status !== "Done" && t.due && t.due < td).length;
          const members = state.members.filter((m) => m.projectId === p.id).length;
          const prog = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
          const activePhase = (p.phases ?? []).find((ph) => ph.status === "active");

          return (
            <div
              key={p.id}
              className="proj-card"
              onClick={() => { switchProject(p.id); go("dashboard"); }}
            >
              <div className="pc-bar" style={{ background: p.color }} />

              <div className="pc-head" style={{ paddingLeft: 8 }}>
                <div className="avatar" style={{ background: p.color, width: 36, height: 36, fontSize: 13, borderRadius: 10 }}>
                  {p.key}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3 style={{ margin: 0 }}>{p.name}</h3>
                  {activePhase && (
                    <span style={{ fontFamily: "var(--mono)", fontSize: 9.5, color: "var(--coral)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                      {activePhase.label} · {activePhase.name}
                    </span>
                  )}
                </div>
                {overdue > 0 && (
                  <span className="chip coral" style={{ fontSize: 9 }}>{overdue} overdue</span>
                )}
              </div>

              <p className="pc-desc" style={{ paddingLeft: 8 }}>{p.desc}</p>

              <div style={{ paddingLeft: 8, paddingRight: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--faint)", marginBottom: 6, fontFamily: "var(--mono)" }}>
                  <span>{done}/{tasks.length} tasks done</span>
                  <span style={{ color: prog >= 75 ? "var(--sage)" : prog >= 40 ? "var(--gold)" : "var(--muted)" }}>{prog}%</span>
                </div>
                <div className="pbar"><i style={{ width: `${prog}%` }} /></div>
              </div>

              <div className="pc-stats" style={{ paddingLeft: 8 }}>
                <div><b style={{ color: open > 0 ? "var(--coral)" : "var(--sage)" }}>{open}</b>open</div>
                <div><b>{done}</b>done</div>
                <div><b>{members}</b>member{members !== 1 ? "s" : ""}</div>
              </div>

              {p.repo && (
                <div style={{ marginTop: 14, paddingLeft: 8 }}>
                  <GitHubPanel repo={p.repo} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
