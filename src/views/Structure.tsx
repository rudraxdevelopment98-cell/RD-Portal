import { useState, useRef, useEffect, useCallback } from "react";
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

  // use the stored blueprint only if it has the current shape (includes edges);
  // older stored blueprints predate the data-flow upgrade, so re-derive those.
  const stored = proj.blueprint;
  const isCurrentShape = !!stored && Array.isArray(stored.layers) && Array.isArray((stored as any).edges) && Array.isArray((stored as any).pipeline);
  const bp: Blueprint = isCurrentShape ? (stored as Blueprint) : deriveBlueprint(proj);
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
/* ── Interactive data-flow canvas ──
   Pipeline nodes + external services as draggable boxes wired together
   with curved connection lines. Click a node or a line to see detail. */
type FlowNode = import("../lib/blueprint").FlowNode;
type FlowEdge = import("../lib/blueprint").FlowEdge;
type ExtService = import("../lib/blueprint").ExtService;

const FN_W = 158;
const FN_H = 60;

interface FlowConn {
  from: string; to: string;
  kind: "pipe" | "ext";
  label: string;        // primary label shown / sentence
  back?: string;        // reverse-direction label (externals)
  fromLabel: string; toLabel: string;
}

function FlowCanvas({ pipeline, edges, externals }: { pipeline: FlowNode[]; edges: FlowEdge[]; externals: ExtService[] }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<Record<string, { x: number; y: number }>>({});
  const [activeConn, setActiveConn] = useState<number | null>(null);
  const [activeNode, setActiveNode] = useState<string | null>(null);
  const [hoverNode, setHoverNode] = useState<string | null>(null);
  const drag = useRef<{ id: string; dx: number; dy: number; moved: boolean } | null>(null);

  const labelOf = (id: string) =>
    pipeline.find((n) => n.id === id)?.label || externals.find((e) => e.id === id)?.label || id;

  // build the connection list once
  const conns: FlowConn[] = [];
  edges.forEach((e) => conns.push({ from: e.from, to: e.to, kind: "pipe", label: e.label, fromLabel: labelOf(e.from), toLabel: labelOf(e.to) }));
  externals.forEach((x) => conns.push({ from: x.connectsTo, to: x.id, kind: "ext", label: x.flowIn, back: x.flowOut, fromLabel: labelOf(x.connectsTo), toLabel: labelOf(x.id) }));

  // initial layout: pipeline in a row, externals in a lane below their node
  useEffect(() => {
    setPos((prev) => {
      if (Object.keys(prev).length) return prev;
      const gap = FN_W + 70;
      const next: Record<string, { x: number; y: number }> = {};
      pipeline.forEach((n, i) => { next[n.id] = { x: 30 + i * gap, y: 36 }; });
      const perNode: Record<string, number> = {};
      externals.forEach((x) => {
        const idx = Math.max(0, pipeline.findIndex((n) => n.id === x.connectsTo));
        const stack = perNode[x.connectsTo] = (perNode[x.connectsTo] ?? -1) + 1;
        next[x.id] = { x: 30 + idx * gap + stack * 26, y: 36 + 150 + stack * 92 };
      });
      return next;
    });
  }, [pipeline, externals]);

  const onMouseDown = (e: React.MouseEvent, id: string) => {
    const p = pos[id]; if (!p) return;
    drag.current = { id, dx: e.clientX - p.x, dy: e.clientY - p.y, moved: false };
  };
  useEffect(() => {
    const move = (e: MouseEvent) => {
      if (!drag.current) return;
      drag.current.moved = true;
      const { id, dx, dy } = drag.current;
      setPos((p) => ({ ...p, [id]: { x: Math.max(0, e.clientX - dx), y: Math.max(0, e.clientY - dy) } }));
    };
    const up = () => { drag.current = null; };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
  }, []);

  const center = (id: string) => { const p = pos[id]; return p ? { x: p.x + FN_W / 2, y: p.y + FN_H / 2 } : null; };

  const allIds = [...pipeline.map((n) => n.id), ...externals.map((e) => e.id)];
  const canvasHeight = Math.max(300, ...allIds.map((id) => (pos[id]?.y || 0) + FN_H + 30));

  const isExt = (id: string) => externals.some((e) => e.id === id);

  return (
    <div className="dbc">
      <div className="inv-section-label" style={{ margin: "4px 0 10px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span>Data flow — {pipeline.length} stage{pipeline.length !== 1 ? "s" : ""}{externals.length ? `, ${externals.length} external service${externals.length !== 1 ? "s" : ""}` : ""}</span>
        <span className="dbc-hint">drag to rearrange · click a box or a line for detail</span>
      </div>

      <div className="dbc-canvas" ref={wrapRef} style={{ height: canvasHeight }}>
        <svg className="dbc-svg" style={{ height: canvasHeight }}>
          <defs>
            <marker id="fc-arrow" markerWidth="9" markerHeight="9" refX="7" refY="3" orient="auto">
              <path d="M0,0 L7,3 L0,6 Z" fill="var(--slate)" />
            </marker>
          </defs>
          {conns.map((c, i) => {
            const a = center(c.from); const b = center(c.to);
            if (!a || !b) return null;
            const active = activeConn === i;
            const dim = hoverNode && c.from !== hoverNode && c.to !== hoverNode;
            const midX = (a.x + b.x) / 2, midY = (a.y + b.y) / 2;
            const d = `M ${a.x} ${a.y} C ${midX} ${a.y}, ${midX} ${b.y}, ${b.x} ${b.y}`;
            return (
              <g key={i} className={`dbc-edge fc-${c.kind} ${active ? "on" : ""} ${dim ? "dim" : ""}`} onClick={() => { setActiveConn(active ? null : i); setActiveNode(null); }}>
                <path d={d} className="dbc-edge-hit" />
                <path d={d} className={`fc-line ${c.kind}`} markerEnd="url(#fc-arrow)" />
                <foreignObject x={midX - 56} y={midY - 11} width="112" height="22" style={{ overflow: "visible", pointerEvents: "none" }}>
                  <div className={`fc-elabel ${active ? "on" : ""}`}>{c.label}</div>
                </foreignObject>
              </g>
            );
          })}
        </svg>

        {allIds.map((id) => {
          const p = pos[id]; if (!p) return null;
          const ext = externals.find((e) => e.id === id);
          const node = ext || pipeline.find((n) => n.id === id)!;
          return (
            <div
              key={id}
              className={`fc-node ${isExt(id) ? "ext" : "pipe"} ${hoverNode === id ? "hl" : ""} ${activeNode === id ? "on" : ""}`}
              style={{ left: p.x, top: p.y, width: FN_W, height: FN_H }}
              onMouseDown={(e) => onMouseDown(e, id)}
              onMouseEnter={() => setHoverNode(id)}
              onMouseLeave={() => setHoverNode((h) => (h === id ? null : h))}
              onClick={() => { if (!drag.current?.moved) { setActiveNode(activeNode === id ? null : id); setActiveConn(null); } }}
            >
              <span className="fc-node-ic">{node.icon}</span>
              <div className="fc-node-txt">
                <div className="fc-node-label">{node.label}</div>
                <div className="fc-node-detail">{node.detail}</div>
              </div>
            </div>
          );
        })}
      </div>

      {activeNode != null && (() => {
        const ext = externals.find((e) => e.id === activeNode);
        const node = ext || pipeline.find((n) => n.id === activeNode);
        if (!node) return null;
        return (
          <div className="dbc-detail">
            <button className="dbc-detail-x" onClick={() => setActiveNode(null)}>✕</button>
            <div className="dbc-detail-title">{node.icon} {node.label}{ext ? " · external service" : ""}</div>
            <p className="dbc-detail-body">{node.detail}</p>
            {ext && (
              <>
                <div className="dbc-detail-grid">
                  {ext.platform && <div><div className="inv-section-label">Platform / provider</div><div className="dbc-detail-meta">{ext.platform}</div></div>}
                  <div><div className="inv-section-label">Sends</div><div className="dbc-detail-meta">{ext.flowIn}</div></div>
                  <div><div className="inv-section-label">Returns</div><div className="dbc-detail-meta">{ext.flowOut}</div></div>
                </div>
                {ext.limits && (
                  <div style={{ marginTop: 10 }}>
                    <div className="inv-section-label">Limits / expiry</div>
                    <div className="dbc-detail-meta">{ext.limits}</div>
                  </div>
                )}
              </>
            )}
          </div>
        );
      })()}

      {activeConn != null && conns[activeConn] && (() => {
        const c = conns[activeConn];
        return (
          <div className="dbc-detail">
            <button className="dbc-detail-x" onClick={() => setActiveConn(null)}>✕</button>
            <div className="dbc-detail-title">
              <span className="db-rel-from">{c.fromLabel}</span>
              <span className="db-rel-arrow"> → </span>
              <span className="db-rel-to">{c.toLabel}</span>
            </div>
            <p className="dbc-detail-body">
              {c.kind === "ext"
                ? `“${c.fromLabel}” calls the external service “${c.toLabel}”, sending ${c.label.toLowerCase()} and getting back ${(c.back || "a response").toLowerCase()}.`
                : `“${c.fromLabel}” passes ${c.label.toLowerCase()} to “${c.toLabel}”.`}
            </p>
            <div className="dbc-detail-grid">
              <div><div className="inv-section-label">{c.kind === "ext" ? "Sends" : "Carries"}</div><div className="dbc-detail-meta">{c.label}</div></div>
              {c.back && <div><div className="inv-section-label">Returns</div><div className="dbc-detail-meta">{c.back}</div></div>}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

function DataFlowDiagram({ bp }: { bp: Blueprint }) {
  const pipeline = bp.pipeline ?? [];
  const edges = bp.edges ?? [];
  const externals = bp.externals ?? [];
  const ops = bp.ops ?? [];

  return (
    <div className="dflow">
      {/* Interactive flow canvas — pipeline + external services wired together */}
      {pipeline.length > 0 && <FlowCanvas pipeline={pipeline} edges={edges} externals={externals} />}

      {/* External services & APIs — name · platform · limits at a glance */}
      {externals.length > 0 && (
        <div className="dflow-ops">
          <div className="inv-section-label" style={{ marginBottom: 8 }}>External services &amp; APIs</div>
          <div style={{ display: "grid", gap: 8 }}>
            {externals.map((x) => (
              <div key={x.id} className="ext-card">
                <div className="ext-card-head">
                  <span style={{ color: "var(--coral)" }}>{x.icon}</span>
                  <b>{x.label}</b>
                  {x.platform && <span className="ext-platform">{x.platform}</span>}
                </div>
                <div className="ext-card-detail">{x.detail}</div>
                {x.limits && (
                  <div className="ext-card-limits">
                    <span className="ext-limits-tag">Limits / expiry</span>
                    {x.limits}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Database tables + relations — interactive canvas */}
      {(bp.tables?.length ?? 0) > 0 && <DatabaseCanvas tables={bp.tables} relations={bp.relations ?? []} />}

      {/* Ops strip */}
      {ops.length > 0 && (
        <div className="dflow-ops">
          <div className="inv-section-label" style={{ marginBottom: 8 }}>Build &amp; delivery</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {ops.map((o) => (
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

/* Database schema — interactive canvas: drag tables, expand on click,
   connection lines between FK→PK, click a line to see what it means. */
type TableInfo = import("../lib/blueprint").TableInfo;
type Relation = import("../lib/blueprint").Relation;

const NODE_W = 180;
const HEAD_H = 38;
const ROW_H = 22;

function DatabaseCanvas({ tables, relations }: { tables: TableInfo[]; relations: Relation[] }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<Record<string, { x: number; y: number }>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [activeRel, setActiveRel] = useState<number | null>(null);
  const [hoverTable, setHoverTable] = useState<string | null>(null);
  const drag = useRef<{ name: string; dx: number; dy: number } | null>(null);

  // initial grid layout
  useEffect(() => {
    setPos((prev) => {
      if (Object.keys(prev).length) return prev;
      const cols = Math.max(1, Math.floor((wrapRef.current?.clientWidth || 760) / (NODE_W + 60)));
      const next: Record<string, { x: number; y: number }> = {};
      tables.forEach((t, i) => {
        next[t.name] = { x: (i % cols) * (NODE_W + 60) + 24, y: Math.floor(i / cols) * 150 + 24 };
      });
      return next;
    });
  }, [tables]);

  const nodeHeight = useCallback(
    (t: TableInfo) => (expanded[t.name] ? HEAD_H + t.columns.length * ROW_H + 8 : HEAD_H),
    [expanded]
  );

  const onMouseDown = (e: React.MouseEvent, name: string) => {
    const p = pos[name];
    if (!p) return;
    drag.current = { name, dx: e.clientX - p.x, dy: e.clientY - p.y };
  };
  useEffect(() => {
    const move = (e: MouseEvent) => {
      if (!drag.current) return;
      const { name, dx, dy } = drag.current;
      setPos((p) => ({ ...p, [name]: { x: Math.max(0, e.clientX - dx), y: Math.max(0, e.clientY - dy) } }));
    };
    const up = () => { drag.current = null; };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
  }, []);

  // anchor point for a relation endpoint (right or left edge mid-height)
  const anchor = (table: string, toward: number) => {
    const p = pos[table];
    const t = tables.find((x) => x.name === table);
    if (!p || !t) return null;
    const h = nodeHeight(t);
    const right = p.x + NODE_W;
    const useRight = toward >= p.x + NODE_W / 2;
    return { x: useRight ? right : p.x, y: p.y + Math.min(h, HEAD_H + ROW_H) / 2 + (h > HEAD_H ? 0 : 0) };
  };

  const canvasHeight = Math.max(
    320,
    ...tables.map((t) => (pos[t.name]?.y || 0) + nodeHeight(t) + 30)
  );

  return (
    <div className="dbc">
      <div className="inv-section-label" style={{ margin: "20px 0 10px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span>
          Database — {tables.length} table{tables.length !== 1 ? "s" : ""}
          {relations.length ? `, ${relations.length} connection${relations.length !== 1 ? "s" : ""}` : ""}
        </span>
        <span className="dbc-hint">drag to move · click a table to expand · click a line for detail</span>
      </div>

      <div className="dbc-canvas" ref={wrapRef} style={{ height: canvasHeight }}>
        {/* connection lines */}
        <svg className="dbc-svg" style={{ height: canvasHeight }}>
          {relations.map((r, i) => {
            const tp = pos[r.to]; const fp = pos[r.from];
            if (!tp || !fp) return null;
            const a = anchor(r.from, tp.x);
            const b = anchor(r.to, fp.x);
            if (!a || !b) return null;
            const midX = (a.x + b.x) / 2;
            const d = `M ${a.x} ${a.y} C ${midX} ${a.y}, ${midX} ${b.y}, ${b.x} ${b.y}`;
            const active = activeRel === i;
            const dim = hoverTable && r.from !== hoverTable && r.to !== hoverTable;
            return (
              <g key={i} className={`dbc-edge ${active ? "on" : ""} ${dim ? "dim" : ""}`} onClick={() => setActiveRel(active ? null : i)}>
                <path d={d} className="dbc-edge-hit" />
                <path d={d} className="dbc-edge-line" />
                <circle cx={b.x} cy={b.y} r={3.5} className="dbc-edge-dot" />
              </g>
            );
          })}
        </svg>

        {/* table nodes */}
        {tables.map((t) => {
          const p = pos[t.name];
          if (!p) return null;
          const open = !!expanded[t.name];
          const linked = relations.some((r) => r.from === t.name || r.to === t.name);
          return (
            <div
              key={t.name}
              className={`dbc-node ${open ? "open" : ""} ${hoverTable === t.name ? "hl" : ""}`}
              style={{ left: p.x, top: p.y, width: NODE_W }}
              onMouseEnter={() => setHoverTable(t.name)}
              onMouseLeave={() => setHoverTable((h) => (h === t.name ? null : h))}
            >
              <div
                className="dbc-node-head"
                onMouseDown={(e) => onMouseDown(e, t.name)}
                onClick={() => setExpanded((x) => ({ ...x, [t.name]: !x[t.name] }))}
              >
                <span className="dbc-node-tw">▤</span>
                <span className="dbc-node-name">{t.name}</span>
                <span className="dbc-node-meta">{open ? "▾" : `${t.columns.length} col${t.columns.length !== 1 ? "s" : ""}`}</span>
              </div>
              {open && (
                <div className="dbc-node-cols">
                  {t.columns.map((c) => (
                    <div key={c.name} className="dbc-col">
                      <span className="dbc-col-name">
                        {c.pk && <span className="db-key pk" title="primary key">PK</span>}
                        {c.fk && <span className="db-key fk" title={`→ ${c.fk.table}.${c.fk.column}`}>FK</span>}
                        {c.name}
                      </span>
                      <span className="dbc-col-type">{c.type}</span>
                    </div>
                  ))}
                </div>
              )}
              {!open && linked && <span className="dbc-node-link" title="has connections">⇄</span>}
            </div>
          );
        })}
      </div>

      {/* relation detail panel */}
      {activeRel != null && relations[activeRel] && (
        <RelationDetail r={relations[activeRel]} tables={tables} onClose={() => setActiveRel(null)} />
      )}
    </div>
  );
}

/* Explains, in plain words, what a connection between two tables means. */
function RelationDetail({ r, tables, onClose }: { r: Relation; tables: TableInfo[]; onClose: () => void }) {
  const fromCol = tables.find((t) => t.name === r.from)?.columns.find((c) => c.name === r.fromCol);
  const toCol = tables.find((t) => t.name === r.to)?.columns.find((c) => c.name === r.toCol);
  const sentence = `Each row in “${r.from}” points to one row in “${r.to}” through ${r.fromCol} → ${r.toCol}. One ${singular(r.to)} can be referenced by many ${plural(r.from)}.`;
  return (
    <div className="dbc-detail">
      <button className="dbc-detail-x" onClick={onClose}>✕</button>
      <div className="dbc-detail-title">
        <span className="db-rel-from">{r.from}.{r.fromCol}</span>
        <span className="db-rel-arrow"> → </span>
        <span className="db-rel-to">{r.to}.{r.toCol}</span>
      </div>
      <p className="dbc-detail-body">{sentence}</p>
      <div className="dbc-detail-grid">
        <div>
          <div className="inv-section-label">Foreign key</div>
          <div className="dbc-detail-meta">{r.from}.{r.fromCol}{fromCol ? ` · ${fromCol.type}` : ""}</div>
        </div>
        <div>
          <div className="inv-section-label">References</div>
          <div className="dbc-detail-meta">{r.to}.{r.toCol}{toCol ? ` · ${toCol.type}` : ""}{toCol?.pk ? " · PK" : ""}</div>
        </div>
      </div>
      <div className="dbc-detail-rel">Relationship: many “{r.from}” → one “{r.to}” (many-to-one)</div>
    </div>
  );
}
function singular(s: string) { return s.replace(/ies$/, "y").replace(/s$/, ""); }
function plural(s: string) { return /s$/.test(s) ? s : s + "s"; }

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
