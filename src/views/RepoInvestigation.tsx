import { useState, useEffect, useRef } from "react";
import { analyzeRepo, hasToken, type RepoAnalysis, type ImportedTask } from "../lib/github";
import { onboardFromGitHub } from "../lib/sync";
import { usePortal } from "../context/PortalContext";
import RepoTree from "../components/RepoTree";
import Avatar from "../components/Avatar";

/* ──────────────────────────────────────────────────────────
   Animated step-by-step repo investigation screen.
   Replaces the old AddFromGitHub modal.
────────────────────────────────────────────────────────── */

const STEPS = [
  { id: "meta",    label: "Reading repository metadata" },
  { id: "stack",   label: "Detecting tech stack" },
  { id: "structure", label: "Mapping file structure" },
  { id: "issues",  label: "Importing issues → tasks" },
  { id: "phases",  label: "Deriving phases from milestones" },
  { id: "team",    label: "Collecting contributors" },
];

type StepStatus = "wait" | "running" | "done" | "skip";

function priorityFor(labels: string[]): string {
  const l = labels.map((x) => x.toLowerCase());
  if (l.some((x) => /crit|urgent|p0/.test(x))) return "Critical";
  if (l.some((x) => /high|p1|bug/.test(x))) return "High";
  if (l.some((x) => /low|p3/.test(x))) return "Low";
  return "Medium";
}

const PRI_COLOR: Record<string, string> = {
  Critical: "var(--coral)", High: "var(--gold)", Medium: "var(--sage)", Low: "var(--muted)",
};

export default function RepoInvestigation({ onClose, onDone, onNeedToken }: {
  onClose: () => void;
  onDone: (id: string) => void;
  onNeedToken: () => void;
}) {
  const { reload } = usePortal();
  const [url, setUrl] = useState("");
  const [phase, setPhase] = useState<"input" | "scanning" | "review" | "importing">("input");
  const [stepStatuses, setStepStatuses] = useState<Record<string, StepStatus>>({});
  const [analysis, setAnalysis] = useState<RepoAnalysis | null>(null);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState<"brief" | "tasks" | "structure" | "team">("brief");
  const [nameOverride, setNameOverride] = useState("");
  const [keyOverride, setKeyOverride] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const setStep = (id: string, s: StepStatus) =>
    setStepStatuses((prev) => ({ ...prev, [id]: s }));

  const scan = async () => {
    if (!url.trim()) return;
    setErr("");
    setPhase("scanning");
    setStepStatuses(Object.fromEntries(STEPS.map((s) => [s.id, "wait"])));

    setStep("meta", "running");
    await delay(350);
    const a = await analyzeRepo(url);
    setStep("meta", "done");

    if (a.error) {
      setErr(a.error);
      setPhase("input");
      return;
    }

    setStep("stack", "running");
    await delay(400);
    setStep("stack", a.techStack.length > 0 ? "done" : "skip");

    setStep("structure", "running");
    await delay(500);
    setStep("structure", a.fileCount > 0 ? "done" : "skip");

    setStep("issues", "running");
    await delay(400);
    setStep("issues", a.tasks.length > 0 ? "done" : "skip");

    setStep("phases", "running");
    await delay(350);
    setStep("phases", a.phases.length > 0 ? "done" : "skip");

    setStep("team", "running");
    await delay(300);
    setStep("team", a.contributors.length > 0 ? "done" : "skip");

    await delay(200);
    setAnalysis(a);
    setNameOverride(a.name);
    setKeyOverride(a.name.replace(/[^a-zA-Z]/g, "").slice(0, 3).toUpperCase() || "PRJ");
    setPhase("review");
  };

  const importProject = async () => {
    if (!analysis) return;
    setPhase("importing");
    try {
      const proj = await onboardFromGitHub(analysis, {
        name: nameOverride.trim() || analysis.name,
        key: keyOverride.trim() || undefined,
      });
      await reload();
      onDone(proj.id);
    } catch (e: any) {
      setErr(e?.message || "Import failed.");
      setPhase("review");
    }
  };

  const openCount = analysis?.tasks.filter((t) => t.state === "open").length ?? 0;
  const closedCount = analysis?.tasks.filter((t) => t.state === "closed").length ?? 0;

  return (
    <div className="inv-overlay">
      <div className="inv-panel">

        {/* ── header ── */}
        <div className="inv-header">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 18, color: "var(--coral)" }}>⎇</span>
            <b style={{ fontSize: 15 }}>
              {phase === "input" && "Add project from GitHub"}
              {phase === "scanning" && "Investigating repository…"}
              {phase === "review" && (analysis?.name ?? "Project brief")}
              {phase === "importing" && "Importing project…"}
            </b>
          </div>
          <button className="btn ghost sm" onClick={onClose}>✕</button>
        </div>

        {/* ── input phase ── */}
        {phase === "input" && (
          <div className="inv-body">
            <p className="inv-lead">
              Paste a GitHub repo URL or <code>owner/name</code>. The portal will investigate it —
              reading structure, detecting tech stack, importing issues as tasks, and deriving phases
              from milestones — then show you a brief before anything is saved.
            </p>
            <div className="field" style={{ marginBottom: 10 }}>
              <span>Repository</span>
              <input
                ref={inputRef}
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="rudraxdevelopment98-cell/Breachly  or  https://github.com/…"
                onKeyDown={(e) => { if (e.key === "Enter") scan(); }}
              />
            </div>
            {!hasToken() && (
              <p style={{ fontSize: 12, color: "var(--faint)", margin: "0 0 16px" }}>
                Analysing public repos. For private repos or higher rate limits,{" "}
                <a onClick={onNeedToken} style={{ cursor: "pointer", color: "var(--coral)" }}>add a GitHub token</a>.
              </p>
            )}
            {err && <div className="inv-err">{err}</div>}
            <div className="inv-footer">
              <button className="btn ghost" onClick={onClose}>Cancel</button>
              <button className="btn primary" onClick={scan} disabled={!url.trim()}>
                Investigate →
              </button>
            </div>
          </div>
        )}

        {/* ── scanning phase ── */}
        {phase === "scanning" && (
          <div className="inv-body">
            <div className="inv-steps">
              {STEPS.map((s) => {
                const st = stepStatuses[s.id] ?? "wait";
                return (
                  <div key={s.id} className={`inv-step ${st}`}>
                    <span className="inv-step-ic">
                      {st === "done" && "✓"}
                      {st === "skip" && "—"}
                      {st === "running" && <span className="spin">◌</span>}
                      {st === "wait" && "·"}
                    </span>
                    <span className="inv-step-label">{s.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── review phase ── */}
        {phase === "review" && analysis && (
          <>
            {/* top meta bar */}
            <div className="inv-meta-bar">
              <div className="inv-meta-stat">
                <span style={{ fontSize: 22, fontWeight: 700, color: "var(--coral)" }}>{openCount}</span>
                <span>open issues → tasks</span>
              </div>
              <div className="inv-meta-stat">
                <span style={{ fontSize: 22, fontWeight: 700, color: "var(--gold)" }}>{analysis.phases.length || "—"}</span>
                <span>phases from milestones</span>
              </div>
              <div className="inv-meta-stat">
                <span style={{ fontSize: 22, fontWeight: 700, color: "var(--sage)" }}>{analysis.fileCount}</span>
                <span>files mapped</span>
              </div>
              <div className="inv-meta-stat">
                <span style={{ fontSize: 22, fontWeight: 700, color: "var(--txt)" }}>{analysis.contributors.length}</span>
                <span>contributors</span>
              </div>
            </div>

            {/* tabs */}
            <div className="inv-tabs">
              {(["brief", "tasks", "structure", "team"] as const).map((t) => (
                <button key={t} className={`inv-tab ${tab === t ? "active" : ""}`} onClick={() => setTab(t)}>
                  {t === "brief" && "◉ Brief"}
                  {t === "tasks" && `✓ Tasks (${analysis.tasks.length})`}
                  {t === "structure" && "❖ Structure"}
                  {t === "team" && `⚙ Team (${analysis.contributors.length})`}
                </button>
              ))}
            </div>

            <div className="inv-body inv-scroll">

              {/* ── BRIEF tab ── */}
              {tab === "brief" && (
                <div className="inv-brief">
                  {analysis.description && (
                    <p className="inv-desc">{analysis.description}</p>
                  )}

                  {analysis.topics.length > 0 && (
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
                      {analysis.topics.map((t) => <span key={t} className="chip">{t}</span>)}
                    </div>
                  )}

                  {analysis.techStack.length > 0 && (
                    <div style={{ marginBottom: 18 }}>
                      <div className="inv-section-label">Tech stack detected</div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {analysis.techStack.map((t) => <span key={t} className="chip gold">{t}</span>)}
                      </div>
                    </div>
                  )}

                  {analysis.phases.length > 0 && (
                    <div style={{ marginBottom: 18 }}>
                      <div className="inv-section-label">Roadmap from milestones</div>
                      <div className="inv-phases">
                        {analysis.phases.map((p) => (
                          <div key={p.num} className={`inv-phase ${p.status}`}>
                            <div className="inv-phase-num">{p.label}</div>
                            <div className="inv-phase-name">{p.name}</div>
                            {p.status === "active" && <span className="chip sage" style={{ fontSize: 10, marginTop: 4 }}>active</span>}
                            {p.status === "done" && <span className="chip" style={{ fontSize: 10, marginTop: 4, opacity: 0.5 }}>done</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div style={{ marginBottom: 6 }}>
                    <div className="inv-section-label">What will be created</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <SummaryRow icon="◉" label="Project name" value={
                        <input
                          value={nameOverride}
                          onChange={(e) => setNameOverride(e.target.value)}
                          style={{ background: "var(--ink-2)", border: "1px solid var(--line-soft)", borderRadius: 6, padding: "3px 8px", color: "var(--txt)", fontSize: 13, width: 180 }}
                        />
                      } />
                      <SummaryRow icon="⎇" label="Project key" value={
                        <input
                          value={keyOverride}
                          onChange={(e) => setKeyOverride(e.target.value.toUpperCase().slice(0, 5))}
                          style={{ background: "var(--ink-2)", border: "1px solid var(--line-soft)", borderRadius: 6, padding: "3px 8px", color: "var(--gold)", fontFamily: "var(--mono)", fontSize: 13, width: 80 }}
                        />
                      } />
                      <SummaryRow icon="✓" label="Tasks imported" value={`${openCount} open + ${closedCount} closed issues`} />
                      <SummaryRow icon="◎" label="Phases" value={analysis.phases.length > 0 ? `${analysis.phases.length} from milestones` : "3 default phases"} />
                      <SummaryRow icon="❖" label="File structure" value={`${analysis.fileCount} files, depth 2`} />
                    </div>
                  </div>
                </div>
              )}

              {/* ── TASKS tab ── */}
              {tab === "tasks" && (
                <div>
                  {analysis.tasks.length === 0 ? (
                    <div style={{ color: "var(--muted)", fontSize: 13, padding: "20px 0", textAlign: "center" }}>No issues found in this repository.</div>
                  ) : (
                    analysis.tasks.map((t: ImportedTask) => {
                      const pri = priorityFor(t.labels);
                      return (
                        <div key={t.ghNumber} className="inv-task-row">
                          <div className="inv-task-num">#{t.ghNumber}</div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div className="inv-task-title">{t.title}</div>
                            {t.body && <div className="inv-task-body">{t.body.slice(0, 120)}{t.body.length > 120 ? "…" : ""}</div>}
                            {t.labels.length > 0 && (
                              <div style={{ display: "flex", gap: 4, marginTop: 4, flexWrap: "wrap" }}>
                                {t.labels.map((l) => <span key={l} className="chip" style={{ fontSize: 10 }}>{l}</span>)}
                              </div>
                            )}
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                            <span style={{ fontSize: 11, fontFamily: "var(--mono)", color: PRI_COLOR[pri] }}>{pri}</span>
                            <span style={{ fontSize: 10, color: t.state === "open" ? "var(--sage)" : "var(--muted)" }}>
                              {t.state}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {/* ── STRUCTURE tab ── */}
              {tab === "structure" && (
                <div>
                  <div className="inv-section-label" style={{ marginBottom: 10 }}>File tree (depth 2, top 40 per folder)</div>
                  <div style={{ background: "var(--ink-2)", borderRadius: 10, padding: "10px 14px", border: "1px solid var(--line-soft)" }}>
                    <RepoTree tree={analysis.tree} />
                  </div>
                </div>
              )}

              {/* ── TEAM tab ── */}
              {tab === "team" && (
                <div>
                  {analysis.contributors.length === 0 ? (
                    <div style={{ color: "var(--muted)", fontSize: 13, padding: "20px 0", textAlign: "center" }}>No contributor data available.</div>
                  ) : (
                    analysis.contributors.map((c) => (
                      <div key={c.login} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "1px solid var(--line-soft)" }}>
                        <img src={c.avatar} alt={c.login} style={{ width: 34, height: 34, borderRadius: "50%", border: "1.5px solid var(--line-soft)" }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 600, fontSize: 13 }}>{c.login}</div>
                          <div style={{ fontSize: 11, color: "var(--muted)", fontFamily: "var(--mono)" }}>{c.contributions} commit{c.contributions !== 1 ? "s" : ""}</div>
                        </div>
                        <a href={c.url} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: "var(--faint)" }}>GitHub ↗</a>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            {err && <div className="inv-err" style={{ margin: "0 20px 8px" }}>{err}</div>}

            <div className="inv-footer">
              <button className="btn ghost" onClick={() => { setPhase("input"); setAnalysis(null); }}>← Back</button>
              <button className="btn primary" onClick={importProject}>
                Import project →
              </button>
            </div>
          </>
        )}

        {/* ── importing phase ── */}
        {phase === "importing" && (
          <div className="inv-body" style={{ textAlign: "center", padding: "48px 24px" }}>
            <div className="spin" style={{ fontSize: 32, display: "block", marginBottom: 16, color: "var(--coral)" }}>◌</div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>Creating project…</div>
            <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 6 }}>Saving structure, tasks and phases to your portal.</div>
          </div>
        )}

      </div>
    </div>
  );
}

function SummaryRow({ icon, label, value }: { icon: string; label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "7px 10px", background: "var(--ink-2)", borderRadius: 8, border: "1px solid var(--line-soft)" }}>
      <span style={{ color: "var(--faint)", fontSize: 14, width: 16, textAlign: "center" }}>{icon}</span>
      <span style={{ fontSize: 12, color: "var(--muted)", width: 110, flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 500 }}>
        {typeof value === "string" ? value : value}
      </span>
    </div>
  );
}

function delay(ms: number) { return new Promise((r) => setTimeout(r, ms)); }
