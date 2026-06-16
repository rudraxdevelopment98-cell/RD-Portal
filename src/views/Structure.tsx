import { useState } from "react";
import { usePortal } from "../context/PortalContext";
import EmptyState from "../components/EmptyState";
import RepoTree from "../components/RepoTree";
import { analyzeRepo } from "../lib/github";
import { resyncProject } from "../lib/sync";
import { fmt } from "../lib/util";

export default function Structure() {
  const { state, proj, isManager, reload } = usePortal();
  const [syncing, setSyncing] = useState(false);
  const [msg, setMsg] = useState("");

  if (!proj) return <EmptyState icon="❖" message="No project selected." />;

  if (!proj.repo) {
    return (
      <>
        <div className="page-h"><div><h1>Structure</h1><p>Auto-generated from the linked GitHub repo.</p></div></div>
        <EmptyState icon="❖" message="No GitHub repo linked. Add one in <b>All Projects</b> to auto-generate structure, tech stack and tasks." />
      </>
    );
  }

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
          <h1>Structure</h1>
          <p>
            {proj.repo}
            {proj.lastSynced ? ` · last synced ${fmt(proj.lastSynced)}` : " · not synced yet"}
          </p>
        </div>
        {isManager && (
          <div className="actions">
            <button className="btn primary" onClick={sync} disabled={syncing}>
              {syncing ? "⟳ Syncing…" : "⟳ Sync from GitHub"}
            </button>
          </div>
        )}
      </div>

      {msg && (
        <div style={{ padding: "10px 14px", background: "var(--panel-2)", border: "1px solid var(--line-soft)", borderRadius: 9, color: "var(--muted)", fontSize: 12.5, marginBottom: 16 }}>
          {msg}
        </div>
      )}

      <div className="grid c2">
        {/* Tech stack */}
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

        {/* Contributors */}
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

      {/* Structure diagram */}
      <div className="card" style={{ marginTop: 14 }}>
        <div className="hd">
          <h3>Repo structure</h3>
          <span style={{ marginLeft: "auto", fontFamily: "var(--mono)", fontSize: 10, color: "var(--faint)" }}>
            top levels
          </span>
        </div>
        <div className="bd">
          <RepoTree tree={proj.repoTree} />
        </div>
      </div>

      <div style={{ marginTop: 14, padding: "12px 16px", border: "1px dashed var(--line)", borderRadius: 10, fontSize: 12.5, color: "var(--faint)", lineHeight: 1.6 }}>
        <b style={{ color: "var(--muted)" }}>Coming in Phase 2:</b> AI-generated architecture &amp; data-flow diagrams from reading the actual source (needs the Supabase backend + a Claude API key).
      </div>
    </>
  );
}
