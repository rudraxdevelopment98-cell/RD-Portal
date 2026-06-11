import { useEffect, useState } from "react";
import { fetchRepoSnapshot, type RepoSnapshot } from "../lib/github";

interface Props { repo: string }

export default function GitHubPanel({ repo }: Props) {
  const [snap, setSnap] = useState<RepoSnapshot | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async (force = false) => {
    setLoading(true);
    const s = await fetchRepoSnapshot(repo, force);
    setSnap(s);
    setLoading(false);
  };

  useEffect(() => { load(); }, [repo]);

  if (loading) return (
    <div className="gh-panel">
      <div className="gh-row">
        <span style={{ color: "var(--faint)", fontFamily: "var(--mono)", fontSize: 10 }}>⟳ Loading GitHub data…</span>
      </div>
    </div>
  );

  if (!snap) return null;

  return (
    <div className="gh-panel">
      <div className="gh-row" style={{ marginBottom: 4 }}>
        <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--faint)", letterSpacing: "0.08em" }}>
          GITHUB · {repo}
        </span>
        <button
          className="btn ghost sm"
          style={{ marginLeft: "auto", padding: "3px 8px", fontSize: 11 }}
          onClick={() => load(true)}
        >⟳ Refresh</button>
      </div>

      {snap.error ? (
        <p style={{ color: "var(--muted)", fontSize: 12.5, margin: "6px 0 0" }}>{snap.error}</p>
      ) : (
        <>
          <div className="gh-row" style={{ gap: 14, flexWrap: "wrap", marginTop: 8 }}>
            {snap.language && (
              <span style={{ fontFamily: "var(--mono)", fontSize: 10.5, color: "var(--muted)" }}>
                {snap.language}
              </span>
            )}
            <span style={{ fontFamily: "var(--mono)", fontSize: 10.5, color: "var(--muted)" }}>
              ★ {snap.stars}
            </span>
            <span style={{ fontFamily: "var(--mono)", fontSize: 10.5, color: snap.openIssues > 0 ? "var(--coral)" : "var(--muted)" }}>
              {snap.openIssues} open issue{snap.openIssues !== 1 ? "s" : ""}
            </span>
            {snap.pushedAt && (
              <span style={{ fontFamily: "var(--mono)", fontSize: 10.5, color: "var(--faint)" }}>
                pushed {new Date(snap.pushedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
              </span>
            )}
          </div>

          {snap.commits.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontFamily: "var(--mono)", fontSize: 9.5, letterSpacing: "0.12em", color: "var(--faint)", textTransform: "uppercase", marginBottom: 6 }}>Recent commits</div>
              {snap.commits.map((c) => (
                <div key={c.sha} className="gh-commit">
                  <a href={c.url} target="_blank" rel="noopener noreferrer" className="gh-sha">{c.sha}</a>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.message}</div>
                    <div style={{ fontFamily: "var(--mono)", fontSize: 9.5, color: "var(--faint)", marginTop: 2 }}>
                      {c.author} · {c.date ? new Date(c.date).toLocaleDateString() : ""}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
