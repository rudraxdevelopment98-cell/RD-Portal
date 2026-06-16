import { useState } from "react";
import { usePortal } from "../context/PortalContext";
import EmptyState from "../components/EmptyState";
import RepoTree from "../components/RepoTree";
import { analyzeRepo } from "../lib/github";
import { resyncProject } from "../lib/sync";
import { deriveBlueprint, deriveStages } from "../lib/blueprint";
import { fmt } from "../lib/util";

export default function Structure() {
  const { state, proj, isManager, inProj, reload } = usePortal();
  const [syncing, setSyncing] = useState(false);
  const [msg, setMsg] = useState("");

  if (!proj) return <EmptyState icon="❖" message="No project selected." />;

  if (!proj.repo) {
    return (
      <>
        <div className="page-h"><div><h1>Blueprint</h1><p>Auto-generated understanding from the linked GitHub repo.</p></div></div>
        <EmptyState icon="❖" message="No GitHub repo linked. Add one in <b>All Projects</b> to auto-generate the idea, stages, architecture and data-flow." />
      </>
    );
  }

  // use the stored blueprint, or derive a lighter one live from stored repo data
  const bp = proj.blueprint && proj.blueprint.layers ? proj.blueprint : deriveBlueprint(proj);
  const { stages, currentNum } = deriveStages(proj.phases || [], inProj(state.tasks));

  const tasks = inProj(state.tasks);
  const done = tasks.filter((t) => t.status === "Done").length;
  const prog = tasks.length ? Math.round((done / tasks.length) * 100) : 0;

  const sync = async () => {
    setSyncing(true); setMsg("");
    const analysis = await analyzeRepo(proj.repo!);
    if (analysis.error) { setMsg(analysis.error); setSyncing(false); return; }
    const { added, updated } = await resyncProject(proj, analysis, state.tasks);
    await reload();
    setSyncing(false);
    setMsg(`Synced — ${added} new task(s), ${updated} updated.`);
  };

  return (
    <>
      <div className="page-h">
        <div>
          <h1>Blueprint</h1>
          <p>
            {proj.repo}
            {proj.lastSynced ? ` · last synced ${fmt(proj.lastSynced)}` : " · not synced yet"}
          </p>
        </div>
        {isManager && (
          <div className="actions">
            <button className="btn primary" onClick={sync} disabled={syncing}>
              {syncing ? "⟳ Syncing…" : "⟳ Re-investigate"}
            </button>
          </div>
        )}
      </div>

      {msg && (
        <div style={{ padding: "10px 14px", background: "var(--panel-2)", border: "1px solid var(--line-soft)", borderRadius: 9, color: "var(--muted)", fontSize: 12.5, marginBottom: 16 }}>
          {msg}
        </div>
      )}

      {/* ── Idea & Purpose ── */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="hd">
          <h3>The idea</h3>
          {bp.kind && <span style={{ marginLeft: "auto" }} className="chip coral">{bp.kind}</span>}
        </div>
        <div className="bd">
          <p style={{ fontSize: 14.5, lineHeight: 1.7, color: "var(--txt)", margin: 0 }}>{bp.idea}</p>
          {bp.purpose.length > 0 && (
            <ul style={{ margin: "14px 0 0", paddingLeft: 18, color: "var(--muted)", fontSize: 13, lineHeight: 1.8 }}>
              {bp.purpose.map((p, i) => <li key={i}>{p}</li>)}
            </ul>
          )}
        </div>
      </div>

      {/* ── Stages / Journey — "you are here" ── */}
      {stages.length > 0 && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="hd">
            <h3>Build journey</h3>
            <span style={{ marginLeft: "auto", fontFamily: "var(--mono)", fontSize: 11, color: "var(--faint)" }}>
              {prog}% of tasks done
            </span>
          </div>
          <div className="bd">
            <div className="journey">
              {stages.map((s, i) => (
                <div key={s.num} className={`jstage ${s.state}${s.current ? " current" : ""}`}>
                  {i > 0 && <div className="jconnect" />}
                  <div className="jdot">{s.state === "done" ? "✓" : i + 1}</div>
                  <div className="jlabel">{s.label}</div>
                  <div className="jname">{s.name}</div>
                  {s.current && <div className="jhere">◉ you are here</div>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Data flow ── */}
      {(bp.pipeline.length > 0 || bp.externals.length > 0) && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="hd"><h3>Data flow</h3><span style={{ marginLeft: "auto", fontFamily: "var(--mono)", fontSize: 10, color: "var(--faint)" }}>inferred</span></div>
          <div className="bd">
            {bp.pipeline.length > 0 ? (
              <div className="flow">
                {bp.pipeline.map((n, i) => (
                  <div key={n.id} className="flow-node-wrap">
                    {i > 0 && <div className="flow-arrow">→</div>}
                    <div className="flow-node">
                      <div className="flow-ic">{n.icon}</div>
                      <div className="flow-label">{n.label}</div>
                      <div className="flow-detail">{n.detail}</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ color: "var(--muted)", fontSize: 13 }}>Re-investigate to map the data flow.</div>
            )}

            {bp.externals.length > 0 && (
              <div className="flow-ext">
                <div className="inv-section-label" style={{ marginBottom: 8 }}>External services</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {bp.externals.map((e) => (
                    <div key={e.id} className="flow-chip">
                      <span style={{ color: "var(--gold)" }}>{e.icon}</span>
                      <b>{e.label}</b>
                      <span style={{ color: "var(--faint)" }}>· {e.detail}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {bp.ops.length > 0 && (
              <div className="flow-ext">
                <div className="inv-section-label" style={{ marginBottom: 8 }}>Build &amp; delivery</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {bp.ops.map((o) => (
                    <div key={o.id} className="flow-chip">
                      <span style={{ color: "var(--sage)" }}>{o.icon}</span>
                      <b>{o.label}</b>
                      <span style={{ color: "var(--faint)" }}>· {o.detail}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Building structure (layers) ── */}
      {bp.layers.length > 0 && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="hd"><h3>Building structure</h3></div>
          <div className="bd">
            <div className="layers">
              {bp.layers.map((l) => (
                <div key={l.id} className="layer">
                  <div className="layer-ic">{l.icon}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="layer-name">{l.name}</div>
                    <div className="layer-role">{l.role}</div>
                    <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 6 }}>
                      {l.dirs.map((d) => <span key={d} className="chip" style={{ fontSize: 10, fontFamily: "var(--mono)" }}>{d}/</span>)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Tech stack + contributors ── */}
      <div className="grid c2">
        <div className="card">
          <div className="hd"><h3>Tech stack</h3></div>
          <div className="bd">
            {proj.techStack?.length ? (
              <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                {proj.techStack.map((t) => <span key={t} className="chip gold">{t}</span>)}
              </div>
            ) : (
              <div style={{ color: "var(--muted)", fontSize: 13 }}>Sync to detect the tech stack.</div>
            )}
            {proj.fileCount != null && (
              <div style={{ marginTop: 14, fontFamily: "var(--mono)", fontSize: 11, color: "var(--faint)" }}>
                {proj.fileCount} files · default branch {proj.defaultBranch ?? "main"}
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="hd"><h3>Contributors</h3></div>
          <div className="bd">
            {proj.contributors?.length ? (
              proj.contributors.map((c) => (
                <div key={c.login} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0" }}>
                  <img src={c.avatar} alt={c.login} width={26} height={26} style={{ borderRadius: "50%" }} />
                  <a href={c.url} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 600, color: "var(--txt)", flex: 1 }}>{c.login}</a>
                  <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--faint)" }}>{c.contributions} commits</span>
                </div>
              ))
            ) : (
              <div style={{ color: "var(--muted)", fontSize: 13 }}>Sync to load contributors.</div>
            )}
          </div>
        </div>
      </div>

      {/* ── File tree ── */}
      <div className="card" style={{ marginTop: 14 }}>
        <div className="hd">
          <h3>Repo structure</h3>
          <span style={{ marginLeft: "auto", fontFamily: "var(--mono)", fontSize: 10, color: "var(--faint)" }}>top levels</span>
        </div>
        <div className="bd">
          <RepoTree tree={proj.repoTree} />
        </div>
      </div>

      <div style={{ marginTop: 14, padding: "12px 16px", border: "1px dashed var(--line)", borderRadius: 10, fontSize: 12.5, color: "var(--faint)", lineHeight: 1.6 }}>
        <b style={{ color: "var(--muted)" }}>Heuristic blueprint.</b> Idea, stages, architecture and data-flow are inferred from your README, milestones, dependencies and folders. AI enrichment (deeper source reading) can be layered on next.
      </div>
    </>
  );
}
