import { useState } from "react";
import { usePortal } from "../context/PortalContext";
import EmptyState from "../components/EmptyState";
import RepoTree from "../components/RepoTree";
import { analyzeRepo } from "../lib/github";
import { resyncProject } from "../lib/sync";
import { deriveBlueprint, deriveStages, type Blueprint } from "../lib/blueprint";
import { Store } from "../lib/store";
import { fmt } from "../lib/util";
import type { PhaseStatus } from "../lib/types";

export default function Structure() {
  const { state, proj, isManager, reload } = usePortal();
  const [syncing, setSyncing] = useState(false);
  const [msg, setMsg] = useState("");

  if (!proj) return <EmptyState icon="❖" message="No project selected." />;

  if (!proj.repo) {
    return (
      <>
        <div className="page-h"><div><h1>Blueprint</h1><p>Auto-generated understanding from the linked GitHub repo.</p></div></div>
        <EmptyState icon="❖" message="No GitHub repo linked. Add one in All Projects to auto-generate the idea, stages, architecture and data-flow." />
      </>
    );
  }

  const bp: Blueprint = proj.blueprint && proj.blueprint.layers?.length ? proj.blueprint : deriveBlueprint(proj);
  const { stages, progress } = deriveStages(proj.phases || []);
  const allDone = stages.length > 0 && stages.every((s) => s.state === "done");

  // click a stage to cycle its status: upcoming → active → done → upcoming
  const cycleStage = async (num: string) => {
    if (!isManager) return;
    const next: Record<string, PhaseStatus> = { "": "active", active: "done", done: "" };
    const phases = (proj.phases || []).map((p) => (p.num === num ? { ...p, status: next[p.status || ""] } : p));
    await Store.updateProject(proj.id, { phases });
    await Store.addActivity(`Set ${num} stage status`);
    await reload();
  };

  const markAllDone = async () => {
    const phases = (proj.phases || []).map((p) => ({ ...p, status: "done" as PhaseStatus }));
    await Store.updateProject(proj.id, { phases });
    await Store.addActivity("Marked project complete");
    await reload();
  };

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
          <p>{proj.repo}{proj.lastSynced ? ` · last synced ${fmt(proj.lastSynced)}` : " · not synced yet"}</p>
        </div>
        {isManager && (
          <div className="actions">
            <button className="btn primary" onClick={sync} disabled={syncing}>
              {syncing ? "⟳ Syncing…" : "⟳ Re-investigate"}
            </button>
          </div>
        )}
      </div>

      {msg && <div style={{ padding: "10px 14px", background: "var(--panel-2)", border: "1px solid var(--line-soft)", borderRadius: 9, color: "var(--muted)", fontSize: 12.5, marginBottom: 16 }}>{msg}</div>}

      {/* ── Idea ── */}
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

      {/* ── Build journey ── */}
      {stages.length > 0 && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="hd">
            <h3>Build journey</h3>
            <span style={{ marginLeft: "auto", fontFamily: "var(--mono)", fontSize: 11, color: allDone ? "var(--sage)" : "var(--faint)" }}>
              {allDone ? "✓ shipped · 100%" : `${progress}% complete`}
            </span>
          </div>
          <div className="bd">
            <div className="journey">
              {stages.map((s, i) => (
                <div
                  key={s.num}
                  className={`jstage ${s.state}${s.current ? " current" : ""}${isManager ? " clickable" : ""}`}
                  onClick={() => cycleStage(s.num)}
                  title={isManager ? "Click to change status (upcoming → active → done)" : undefined}
                >
                  {i > 0 && <div className="jconnect" />}
                  <div className="jdot">{s.state === "done" ? "✓" : i + 1}</div>
                  <div className="jlabel">{s.label}</div>
                  <div className="jname">{s.name}</div>
                  {s.current && !allDone && <div className="jhere">◉ you are here</div>}
                  {s.state === "done" && <div className="jhere" style={{ color: "var(--sage)" }}>done</div>}
                </div>
              ))}
            </div>
            {isManager && (
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--line-soft)" }}>
                <span style={{ fontSize: 11.5, color: "var(--faint)" }}>
                  Just imported and the project is further along? Click any stage to set its status, or
                </span>
                {allDone ? (
                  <button className="btn ghost sm" onClick={() => cycleStage(stages[stages.length - 1].num)}>Reopen last stage</button>
                ) : (
                  <button className="btn ghost sm" onClick={markAllDone}>Mark all complete</button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Data flow diagram ── */}
      {bp.pipeline.length > 0 && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="hd">
            <h3>Data flow</h3>
            <span style={{ marginLeft: "auto", fontFamily: "var(--mono)", fontSize: 10, color: "var(--faint)" }}>inferred from repo</span>
          </div>
          <div className="bd">
            <DataFlowDiagram bp={bp} />
          </div>
        </div>
      )}

      {/* ── Building structure ── */}
      {bp.layers.length > 0 && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="hd"><h3>Building structure</h3></div>
          <div className="bd">
            <BuildingStructure bp={bp} />
          </div>
        </div>
      )}

      {/* ── Tech stack + contributors ── */}
      <div className="grid c2" style={{ marginBottom: 14 }}>
        <div className="card">
          <div className="hd"><h3>Tech stack</h3></div>
          <div className="bd">
            {proj.techStack?.length ? (
              <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                {proj.techStack.map((t) => <span key={t} className="chip gold">{t}</span>)}
              </div>
            ) : <div style={{ color: "var(--muted)", fontSize: 13 }}>Sync to detect the tech stack.</div>}
            {proj.fileCount != null && (
              <div style={{ marginTop: 14, fontFamily: "var(--mono)", fontSize: 11, color: "var(--faint)" }}>
                {proj.fileCount} files · branch: {proj.defaultBranch ?? "main"}
              </div>
            )}
          </div>
        </div>
        <div className="card">
          <div className="hd"><h3>Contributors</h3></div>
          <div className="bd">
            {proj.contributors?.length ? proj.contributors.map((c) => (
              <div key={c.login} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0" }}>
                <img src={c.avatar} alt={c.login} width={26} height={26} style={{ borderRadius: "50%" }} />
                <a href={c.url} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 600, color: "var(--txt)", flex: 1 }}>{c.login}</a>
                <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--faint)" }}>{c.contributions} commits</span>
              </div>
            )) : <div style={{ color: "var(--muted)", fontSize: 13 }}>Sync to load contributors.</div>}
          </div>
        </div>
      </div>

      {/* ── File tree ── */}
      <div className="card">
        <div className="hd">
          <h3>Repo structure</h3>
          <span style={{ marginLeft: "auto", fontFamily: "var(--mono)", fontSize: 10, color: "var(--faint)" }}>top levels</span>
        </div>
        <div className="bd"><RepoTree tree={proj.repoTree} /></div>
      </div>

      <div style={{ marginTop: 14, padding: "12px 16px", border: "1px dashed var(--line)", borderRadius: 10, fontSize: 12.5, color: "var(--faint)", lineHeight: 1.6 }}>
        <b style={{ color: "var(--muted)" }}>Heuristic blueprint.</b> Inferred from README, milestones, dependencies and folders. AI enrichment (source-level understanding) can be layered on next.
      </div>
    </>
  );
}

/* ─────────────────────────────────────────────────────────
   Data flow diagram
   Shows pipeline horizontally with labeled bidirectional
   edges and external services attached to their pipeline node.
───────────────────────────────────────────────────────── */
function DataFlowDiagram({ bp }: { bp: Blueprint }) {
  // group edges by pair
  const edgesBetween = (a: string, b: string) =>
    bp.edges.filter((e) => (e.from === a && e.to === b) || (e.from === b && e.to === a));

  // group externals by their connectsTo node
  const extsFor = (nodeId: string) => bp.externals.filter((e) => e.connectsTo === nodeId);

  return (
    <div className="dflow">
      {/* Main pipeline row */}
      <div className="dflow-row">
        {bp.pipeline.map((node, i) => {
          const next = bp.pipeline[i + 1];
          const pairEdges = next ? edgesBetween(node.id, next.id) : [];
          const fwd = pairEdges.find((e) => e.from === node.id);
          const bck = pairEdges.find((e) => e.to === node.id);
          return (
            <div key={node.id} className="dflow-col">
              <DFlowNode node={node} />
              {next && (
                <div className="dflow-edge-col">
                  {fwd && <div className="dflow-edge fwd">{fwd.label}</div>}
                  {bck && <div className="dflow-edge bck">{bck.label}</div>}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* External services below pipeline — connected via dotted line to their node */}
      {bp.externals.length > 0 && (
        <div className="dflow-exts">
          <div className="inv-section-label" style={{ marginBottom: 12 }}>External services</div>
          <div className="dflow-ext-grid">
            {bp.externals.map((ext) => {
              const nodeIdx = bp.pipeline.findIndex((n) => n.id === ext.connectsTo);
              return (
                <div key={ext.id} className="dflow-ext-card">
                  <div className="dflow-ext-top">
                    <div className="dflow-ext-badge">
                      {nodeIdx >= 0 && (
                        <span style={{ fontSize: 10, fontFamily: "var(--mono)", color: "var(--faint)" }}>
                          via {bp.pipeline[nodeIdx]?.label}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="dflow-ext-body">
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{ext.label}</div>
                    <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 2 }}>{ext.detail}</div>
                    <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 3 }}>
                      <div className="dflow-ext-flow">
                        <span className="dflow-ext-arrow out">→</span>
                        <span>{ext.flowIn}</span>
                      </div>
                      <div className="dflow-ext-flow">
                        <span className="dflow-ext-arrow in">←</span>
                        <span>{ext.flowOut}</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Ops strip */}
      {bp.ops.length > 0 && (
        <div className="dflow-ops">
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
  );
}

function DFlowNode({ node }: { node: { id: string; label: string; detail: string; icon: string } }) {
  return (
    <div className="dflow-node">
      <div className="dflow-node-ic">{node.icon}</div>
      <div className="dflow-node-label">{node.label}</div>
      <div className="dflow-node-detail">{node.detail}</div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   Building structure — vertical stack diagram
   Layers rendered top (UI) → bottom (Data) with connecting
   lines showing the architectural dependency direction.
───────────────────────────────────────────────────────── */
const STACK_ORDER = ["app", "server", "data", "assets", "test", "ops", "docs"];

function BuildingStructure({ bp }: { bp: Blueprint }) {
  const ordered = [...bp.layers].sort((a, b) => STACK_ORDER.indexOf(a.id) - STACK_ORDER.indexOf(b.id));
  const coreIds = new Set(["app", "server", "data"]);
  const core = ordered.filter((l) => coreIds.has(l.id));
  const support = ordered.filter((l) => !coreIds.has(l.id));

  return (
    <div className="bstruct">
      {/* Core stack — vertical with connectors */}
      <div className="bstruct-core">
        <div className="inv-section-label" style={{ marginBottom: 10 }}>Architecture stack</div>
        {core.map((l, i) => (
          <div key={l.id}>
            <div className="bstruct-layer" style={{ borderLeftColor: l.color }}>
              <div className="bstruct-ic" style={{ color: l.color }}>{l.icon}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span className="bstruct-name">{l.name}</span>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {l.dirs.map((d) => (
                      <span key={d} className="chip" style={{ fontSize: 10, fontFamily: "var(--mono)" }}>{d}/</span>
                    ))}
                  </div>
                </div>
                <div className="bstruct-role">{l.role}</div>
              </div>
            </div>
            {i < core.length - 1 && (
              <div className="bstruct-connector">
                <div className="bstruct-conn-line" />
                <div className="bstruct-conn-label">calls / queries</div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Support layers */}
      {support.length > 0 && (
        <div className="bstruct-support">
          <div className="inv-section-label" style={{ marginBottom: 10 }}>Support</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px,1fr))", gap: 8 }}>
            {support.map((l) => (
              <div key={l.id} className="bstruct-layer" style={{ borderLeftColor: l.color }}>
                <div className="bstruct-ic" style={{ color: l.color }}>{l.icon}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="bstruct-name">{l.name}</div>
                  <div className="bstruct-role">{l.role}</div>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 5 }}>
                    {l.dirs.map((d) => (
                      <span key={d} className="chip" style={{ fontSize: 10, fontFamily: "var(--mono)" }}>{d}/</span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
