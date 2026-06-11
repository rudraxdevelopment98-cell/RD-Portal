/* ============================================================
   GitHub sync — unauthenticated reads of public repos.
   Used to reflect real project progress in the portal.
   (60 req/hr unauth limit; results cached in sessionStorage.)
   ============================================================ */

export interface RepoSnapshot {
  repo: string;
  description: string | null;
  openIssues: number;
  stars: number;
  pushedAt: string | null;
  language: string | null;
  commits: { message: string; author: string; date: string; sha: string; url: string }[];
  issues: { number: number; title: string; url: string; state: string; createdAt: string }[];
  error?: string;
}

const CACHE_PREFIX = "rd_gh_";
const TTL = 10 * 60 * 1000; // 10 minutes

function readCache(repo: string): RepoSnapshot | null {
  try {
    const raw = sessionStorage.getItem(CACHE_PREFIX + repo);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);
    if (Date.now() - ts > TTL) return null;
    return data;
  } catch {
    return null;
  }
}

function writeCache(repo: string, data: RepoSnapshot) {
  try {
    sessionStorage.setItem(CACHE_PREFIX + repo, JSON.stringify({ ts: Date.now(), data }));
  } catch {
    /* quota — ignore */
  }
}

async function gh(path: string): Promise<any> {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: { Accept: "application/vnd.github+json" },
  });
  if (!res.ok) {
    const msg = res.status === 403 ? "GitHub rate limit reached — try again shortly." : `GitHub returned ${res.status}.`;
    throw new Error(msg);
  }
  return res.json();
}

export async function fetchRepoSnapshot(repo: string, force = false): Promise<RepoSnapshot> {
  if (!force) {
    const cached = readCache(repo);
    if (cached) return cached;
  }
  try {
    const [meta, commits, issues] = await Promise.all([
      gh(`/repos/${repo}`),
      gh(`/repos/${repo}/commits?per_page=5`).catch(() => []),
      gh(`/repos/${repo}/issues?state=open&per_page=5`).catch(() => []),
    ]);
    const snap: RepoSnapshot = {
      repo,
      description: meta.description ?? null,
      openIssues: meta.open_issues_count ?? 0,
      stars: meta.stargazers_count ?? 0,
      pushedAt: meta.pushed_at ?? null,
      language: meta.language ?? null,
      commits: (Array.isArray(commits) ? commits : []).map((c: any) => ({
        message: (c.commit?.message || "").split("\n")[0],
        author: c.commit?.author?.name || c.author?.login || "unknown",
        date: c.commit?.author?.date || "",
        sha: (c.sha || "").slice(0, 7),
        url: c.html_url || "",
      })),
      issues: (Array.isArray(issues) ? issues : [])
        .filter((i: any) => !i.pull_request)
        .map((i: any) => ({
          number: i.number,
          title: i.title,
          url: i.html_url,
          state: i.state,
          createdAt: i.created_at,
        })),
    };
    writeCache(repo, snap);
    return snap;
  } catch (e: any) {
    return {
      repo,
      description: null,
      openIssues: 0,
      stars: 0,
      pushedAt: null,
      language: null,
      commits: [],
      issues: [],
      error: e?.message || "Could not reach GitHub.",
    };
  }
}
