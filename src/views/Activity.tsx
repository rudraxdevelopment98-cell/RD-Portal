import { usePortal } from "../context/PortalContext";
import EmptyState from "../components/EmptyState";
import { fmt } from "../lib/util";

export default function Activity() {
  const { state, proj, inProj, assigneeName } = usePortal();
  if (!proj) return <EmptyState icon="≣" message="No project selected." />;
  const items = inProj(state.activity);

  return (
    <>
      <div className="page-h">
        <div><h1>Activity</h1><p>Audit trail for {proj.name}.</p></div>
      </div>
      <div className="card">
        <div className="bd" style={{ padding: "6px 17px" }}>
          {items.length === 0 && <EmptyState icon="≣" message="No activity yet." />}
          {items.map((a) => (
            <div key={a.id} style={{ display: "flex", gap: 12, padding: "10px 0", borderBottom: "1px solid var(--line-soft)" }}>
              <div className="avatar" style={{ background: a.user === "system" ? "var(--slate)" : "var(--coral)", width: 28, height: 28, fontSize: 11, borderRadius: "50%", flex: "none" }}>
                {a.user === "system" ? "◆" : a.user.slice(0, 2).toUpperCase()}
              </div>
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 500 }}>
                  <b style={{ color: "var(--txt)" }}>{a.user === "system" ? "System" : assigneeName(a.user)}</b>
                  {" — "}{a.action}
                </div>
                <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--faint)", marginTop: 2 }}>{fmt(a.time)}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
