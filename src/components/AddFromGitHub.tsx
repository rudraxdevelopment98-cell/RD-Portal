import { useState } from "react";
import Modal from "./Modal";
import RepoTree from "./RepoTree";
import { analyzeRepo, hasToken, type RepoAnalysis } from "../lib/github";
import { onboardFromGitHub } from "../lib/sync";
import { usePortal } from "../context/PortalContext";

interface Props {
  onClose: () => void;
  onDone: (projectId: string) => void;
  onNeedToken: () => void;
}

export default function AddFromGitHub({ onClose, onDone, onNeedToken }: Props) {
  const { reload } = usePortal();
  const [url, setUrl] = useState("");
  const [analysis, setAnalysis] = useState<RepoAnalysis | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [creating, setCreating] = useState(false);

  const analyze = async () => {
    if (!url.trim()) return;
    setBusy(true); setErr(""); setAnalysis(null);
    const a = await analyzeRepo(url);
    setBusy(false);
    if (a.error) { setErr(a.error); return; }
    setAnalysis(a);
  };

  const create = async () => {
    if (!analysis) return;
    setCreating(true);
    const project = await onboardFromGitHub(analysis);
    await reload();
    setCreating(false);
    onDone(project.id);
  };

  const openIssues = analysis?.tasks.filter((t) => t.state === "open").length ?? 0;

  return (
    <Modal
      title="Add project from GitHub"
      onClose={onClose}
      onOk={analysis ? create : analyze}
      okLabel={analysis ? (creating ? "Creating…" : "Create project") : (busy ? "Analyzing…" : "Analyze repo")}
      okDisabled={busy || creating || (!analysis && !url.trim())}
    >
      <label className="field">
        <span>Repository URL or owner/name</span>
        <input
          value={url}
          onChange={(e) => { setUrl(e.target.value); setAnalysis(null); }}
          placeholder="rudraxdevelopment98-cell/Breachly"
          autoFocus
          onKeyDown={(e) => { if (e.key === "Enter" && !analysis) analyze(); }}
        />
      </label>

      {!hasToken() && (
        <p style={{ margin: "0 0 12px", fontSize: 12, color: "var(--faint)" }}>
          Reading public repos. For private repos,{" "}
          <a onClick={onNeedToken} style={{ cursor: "pointer" }}>add a token</a>.
        </p>
      )}

      {err && (
        <div style={{ padding: "10px 12px", background: "var(--coral-soft)", border: "1px solid rgba(255,122,102,.4)", borderRadius: 9, color: "var(--coral)", fontSize: 12.5, marginBottom: 12 }}>
          {err}
        </div>
      )}

      {analysis && (
        <div style={{ borderTop: "1px solid var(--line-soft)", paddingTop: 16 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
            <b style={{ fontSize: 16 }}>{analysis.name}</b>
            {analysis.language && <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--muted)" }}>{analysis.language}</span>}
          </div>
          {analysis.description && (
            <p style={{ margin: "0 0 12px", fontSize: 13, color: "var(--muted)" }}>{analysis.description}</p>
          )}

          {analysis.techStack.length > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
              {analysis.techStack.map((t) => <span key={t} className="chip gold">{t}</span>)}
            </div>
          )}

          <div style={{ display: "flex", gap: 18, marginBottom: 14, fontFamily: "var(--mono)", fontSize: 11.5 }}>
            <span><b style={{ color: "var(--coral)", fontSize: 15 }}>{openIssues}</b> <span style={{ color: "var(--faint)" }}>open → tasks</span></span>
            <span><b style={{ color: "var(--gold)", fontSize: 15 }}>{analysis.phases.length}</b> <span style={{ color: "var(--faint)" }}>milestones → phases</span></span>
            <span><b style={{ color: "var(--sage)", fontSize: 15 }}>{analysis.fileCount}</b> <span style={{ color: "var(--faint)" }}>files</span></span>
          </div>

          <div style={{ fontFamily: "var(--mono)", fontSize: 9.5, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--faint)", marginBottom: 6 }}>
            Structure
          </div>
          <div style={{ maxHeight: 200, overflow: "auto", background: "var(--ink-2)", borderRadius: 10, padding: "8px 10px", border: "1px solid var(--line-soft)" }}>
            <RepoTree tree={analysis.tree} />
          </div>
        </div>
      )}
    </Modal>
  );
}
