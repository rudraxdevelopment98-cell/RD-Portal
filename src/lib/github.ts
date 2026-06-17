/* ============================================================
   GitHub integration — repo analysis, auto-onboarding, sync.
   Phase 1 (heuristic): metadata, tech stack, file tree, issues
   → tasks, milestones → phases, contributors, commits.
   Reads public repos unauthenticated (~60/hr); a personal access
   token (stored locally) enables private repos + 5,000/hr.
   ============================================================ */
import type { Contributor, Phase, TreeNode } from "./types";
import { buildBlueprint, type Blueprint } from "./blueprint";
import { normalizeRepo } from "./util";

export { normalizeRepo };

const TOKEN_KEY = "rd_gh_token";
const CACHE_PREFIX = "rd_gh_";
const TTL = 10 * 60 * 1000;

/* ---------- token ---------- */
export function getToken(): string | null {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}
export function setToken(t: string | null) {
  try {
    if (t && t.trim()) localStorage.setItem(TOKEN_KEY, t.trim());
    else localStorage.removeItem(TOKEN_KEY);
  } catch { /* ignore */ }
}
export function hasToken(): boolean {
  return !!getToken();
}

function headers(): HeadersInit {
  const h: Record<string, string> = { Accept: "application/vnd.github+json" };
  const t = getToken();
  if (t) h.Authorization = `Bearer ${t}`;
  return h;
}

async function gh(path: string): Promise<any> {
  const res = await fetch(`https://api.github.com${path}`, { headers: headers() });
  if (!res.ok) {
    if (res.status === 404) throw new Error("Repo not found (or private without a token).");
    if (res.status === 403) throw new Error("GitHub rate limit reached — add a token in Settings, or wait.");
    if (res.status === 401) throw new Error("GitHub token is invalid.");
    throw new Error(`GitHub returned ${res.status}.`);
  }
  return res.json();
}

async function ghRaw(repo: string, path: string): Promise<string | null> {
  try {
    const data = await gh(`/repos/${repo}/contents/${path}`);
    if (data && data.content) return atob(data.content.replace(/\n/g, ""));
    return null;
  } catch {
    return null;
  }
}

/* ---------- lightweight snapshot (commits / issue count) ---------- */
export interface RepoSnapshot {
  repo: string;
  description: string | null;
  openIssues: number;
  stars: number;
  pushedAt: string | null;
  language: string | null;
  commits: { message: string; author: string; date: string; sha: string; url: string }[];
  error?: string;
}

function readCache<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);
    if (Date.now() - ts > TTL) return null;
    return data;
  } catch { return null; }
}
function writeCache(key: string, data: unknown) {
  try { sessionStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ ts: Date.now(), data })); } catch { /* ignore */ }
}

export async function fetchRepoSnapshot(repo: string, force = false): Promise<RepoSnapshot> {
  if (!force) { const c = readCache<RepoSnapshot>("snap_" + repo); if (c) return c; }
  try {
    const [meta, commits] = await Promise.all([
      gh(`/repos/${repo}`),
      gh(`/repos/${repo}/commits?per_page=5`).catch(() => []),
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
    };
    writeCache("snap_" + repo, snap);
    return snap;
  } catch (e: any) {
    return { repo, description: null, openIssues: 0, stars: 0, pushedAt: null, language: null, commits: [], error: e?.message || "Could not reach GitHub." };
  }
}

/* ---------- full analysis (for onboarding + sync) ---------- */
export interface ImportedTask { ghNumber: number; title: string; body: string; state: "open" | "closed"; labels: string[]; url: string }

export interface RepoAnalysis {
  repo: string;
  name: string;
  description: string;
  defaultBranch: string;
  language: string | null;
  topics: string[];
  stars: number;
  pushedAt: string | null;
  techStack: string[];
  tree: TreeNode;
  fileCount: number;
  tasks: ImportedTask[];
  phases: Phase[];
  contributors: Contributor[];
  readme: string | null;
  blueprint: Blueprint;
  error?: string;
}

/* detect tech stack from file paths + package.json deps */
function detectStack(paths: string[], pkg: any, signals = ""): string[] {
  const set = new Set<string>();
  const has = (re: RegExp) => paths.some((p) => re.test(p));
  const ext = (e: string) => paths.filter((p) => p.endsWith(e)).length;
  const sig = signals.toLowerCase();
  const inSig = (re: RegExp) => re.test(sig);

  if (pkg) {
    const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
    const d = (n: string) => Object.prototype.hasOwnProperty.call(deps, n);
    if (d("expo") || d("expo-router")) set.add("Expo");
    if (d("react-native")) set.add("React Native");
    if (d("next")) set.add("Next.js");
    if (d("react") && !d("react-native")) set.add("React");
    if (d("vue")) set.add("Vue");
    if (d("svelte")) set.add("Svelte");
    if (d("@angular/core")) set.add("Angular");
    if (d("express") || d("fastify") || d("koa")) set.add("Node API");
    if (d("@supabase/supabase-js")) set.add("Supabase");
    if (d("react-native-purchases")) set.add("RevenueCat");
    if (d("typescript") || ext(".ts") + ext(".tsx") > 0) set.add("TypeScript");
    if (!set.has("TypeScript")) set.add("JavaScript");
  }
  if (has(/(^|\/)requirements\.txt$/) || has(/(^|\/)pyproject\.toml$/) || ext(".py") > 0) set.add("Python");
  if (has(/(^|\/)go\.mod$/)) set.add("Go");
  if (has(/(^|\/)Cargo\.toml$/)) set.add("Rust");
  if (has(/(^|\/)pubspec\.yaml$/)) set.add("Flutter");
  if (has(/(^|\/)Gemfile$/)) set.add("Ruby");
  if (has(/(^|\/)composer\.json$/)) set.add("PHP");
  if (has(/(^|\/)(pom\.xml|build\.gradle)$/)) set.add("Java/Kotlin");
  if (has(/(^|\/)Dockerfile$/i)) set.add("Docker");
  if (has(/^supabase\//)) set.add("Supabase");
  if (has(/^\.github\/workflows\//)) set.add("GitHub Actions");

  // signals-based libraries (work for Python / Flutter / etc.)
  if (inSig(/\bflask\b/)) set.add("Flask");
  if (inSig(/\bdjango\b/)) set.add("Django");
  if (inSig(/\bfastapi\b/)) set.add("FastAPI");
  if (inSig(/streamlit/)) set.add("Streamlit");
  if (inSig(/\bsupabase\b/)) set.add("Supabase");
  if (inSig(/firebase/)) set.add("Firebase");
  if (inSig(/tensorflow|pytorch|\btorch\b|scikit-learn|sklearn/)) set.add("ML / AI");
  return [...set];
}

/* build a nested tree (capped) from flat git-tree paths */
function buildTree(paths: { path: string; type: string }[], maxDepth = 2, maxChildren = 40): { tree: TreeNode; count: number } {
  const root: TreeNode = { name: "/", path: "", type: "dir", children: [] };
  let count = 0;
  for (const item of paths) {
    count++;
    const parts = item.path.split("/");
    if (parts.length > maxDepth + 1) continue; // cap depth for diagram clarity
    let node = root;
    for (let i = 0; i < parts.length; i++) {
      const isLast = i === parts.length - 1;
      const name = parts[i];
      node.children = node.children || [];
      let child = node.children.find((c) => c.name === name);
      if (!child) {
        child = { name, path: parts.slice(0, i + 1).join("/"), type: isLast && item.type === "blob" ? "file" : "dir", children: [] };
        node.children.push(child);
      }
      node = child;
    }
  }
  // sort: dirs first, then files; cap children per node
  const sortNode = (n: TreeNode) => {
    if (!n.children) return;
    n.children.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === "dir" ? -1 : 1));
    if (n.children.length > maxChildren) n.children = n.children.slice(0, maxChildren);
    n.children.forEach(sortNode);
  };
  sortNode(root);
  return { tree: root, count };
}

/* milestones → phases; falls back to a default if none */
function milestonesToPhases(milestones: any[]): Phase[] {
  if (!milestones.length) return [];
  const sorted = milestones
    .slice()
    .sort((a, b) => {
      const ad = a.due_on ? Date.parse(a.due_on) : Infinity;
      const bd = b.due_on ? Date.parse(b.due_on) : Infinity;
      return ad - bd || a.number - b.number;
    });
  let activeMarked = false;
  return sorted.map((m, i) => {
    const done = m.state === "closed";
    let status: Phase["status"] = "";
    if (done) status = "done";
    else if (!activeMarked) { status = "active"; activeMarked = true; }
    return { num: String(i + 1), label: `Phase ${i + 1}`, name: m.title, status };
  });
}

/* Choose schema files — returns multiple migration files sorted chronologically. */
function pickSchemaPaths(paths: string[]): string[] {
  // Canonical single-file schemas take priority
  const singles = [
    /^supabase\/schema\.sql$/i,
    /^prisma\/schema\.prisma$/i,
    /(^|\/)schema\.prisma$/i,
    /(^|\/)schema\.sql$/i,
  ];
  for (const re of singles) {
    const hits = paths.filter((p) => re.test(p));
    if (hits.length) return [hits.sort()[0]];
  }
  // Migration folders — return ALL files sorted so we can merge them
  const migrationRe = [
    /^supabase\/migrations\/.*\.sql$/i,
    /(^|\/)migrations\/.*\.sql$/i,
    /(^|\/)db\/.*\.sql$/i,
  ];
  for (const re of migrationRe) {
    const hits = paths.filter((p) => re.test(p)).sort(); // lexicographic = chronological
    if (hits.length) return hits;
  }
  return [];
}

export async function analyzeRepo(repoInput: string): Promise<RepoAnalysis> {
  const repo = normalizeRepo(repoInput)!;
  try {
    const meta = await gh(`/repos/${repo}`);
    const branch = meta.default_branch || "main";

    const [treeData, issues, milestones, contributors] = await Promise.all([
      gh(`/repos/${repo}/git/trees/${branch}?recursive=1`).catch(() => ({ tree: [] })),
      gh(`/repos/${repo}/issues?state=all&per_page=30`).catch(() => []),
      gh(`/repos/${repo}/milestones?state=all&per_page=20`).catch(() => []),
      gh(`/repos/${repo}/contributors?per_page=10`).catch(() => []),
    ]);

    const rawPaths: { path: string; type: string }[] = (treeData.tree || []).map((t: any) => ({ path: t.path, type: t.type }));
    const allPaths = rawPaths.map((p) => p.path);

    // read package.json + README if present (root)
    let pkg: any = null;
    if (allPaths.includes("package.json")) {
      const txt = await ghRaw(repo, "package.json");
      if (txt) { try { pkg = JSON.parse(txt); } catch { /* ignore */ } }
    }
    const readmePath = allPaths.find((p) => /^readme(\.md|\.markdown|\.txt)?$/i.test(p)) || "README.md";
    const readme = await ghRaw(repo, readmePath);

    // locate DB schema files — may be multiple migrations merged in order
    const schemaPaths = pickSchemaPaths(allPaths);
    let schema: { content: string; path: string } | null = null;
    if (schemaPaths.length === 1) {
      const content = await ghRaw(repo, schemaPaths[0]);
      if (content) schema = { content, path: schemaPaths[0] };
    } else if (schemaPaths.length > 1) {
      const parts = await Promise.all(schemaPaths.map((p) => ghRaw(repo, p)));
      const merged = parts.filter(Boolean).join("\n\n");
      if (merged) schema = { content: merged, path: schemaPaths[schemaPaths.length - 1] };
    }

    // Gather extra "signals" from manifests + env templates + lockfiles so we
    // can detect APIs / libraries in non-JS projects (Python, Flutter, Go…)
    // and in projects that call services via REST or env vars rather than an
    // npm dependency. Best-effort: missing files just return null.
    const SIGNAL_FILES = [
      "requirements.txt", "pyproject.toml", "Pipfile", "poetry.lock", "setup.py", "environment.yml",
      "pubspec.yaml", "pubspec.lock",
      "go.mod", "Cargo.toml", "composer.json", "Gemfile", "build.gradle", "build.gradle.kts", "pom.xml",
      ".env.example", ".env.sample", ".env.template", ".env.local.example", "env.example", ".env.dist",
      "app.json", "app.config.js", "app.config.ts", "config.js", "config.ts",
      "yarn.lock", "package-lock.json", "pnpm-lock.yaml",
    ];
    const signalTargets = SIGNAL_FILES.filter((f) => allPaths.includes(f));
    const signalParts = await Promise.all(signalTargets.map((f) => ghRaw(repo, f)));
    const signals = [
      meta.description || "",
      (meta.topics || []).join(" "),
      ...signalParts.filter(Boolean) as string[],
    ].join("\n");

    const techStack = detectStack(allPaths, pkg, signals);
    const { tree, count } = buildTree(rawPaths);
    const topDirs = (tree.children || []).filter((c) => c.type === "dir").map((c) => c.name);
    const blueprint = buildBlueprint({
      description: meta.description || "",
      readme,
      topDirs,
      allPaths,
      pkg,
      techStack,
      language: meta.language ?? null,
      schema,
      signals,
    });

    const tasks: ImportedTask[] = (Array.isArray(issues) ? issues : [])
      .filter((i: any) => !i.pull_request)
      .map((i: any) => ({
        ghNumber: i.number,
        title: i.title,
        body: (i.body || "").slice(0, 400),
        state: i.state,
        labels: (i.labels || []).map((l: any) => (typeof l === "string" ? l : l.name)),
        url: i.html_url,
      }));

    const phases = milestonesToPhases(Array.isArray(milestones) ? milestones : []);

    const contribs: Contributor[] = (Array.isArray(contributors) ? contributors : [])
      .filter((c: any) => c.type === "User")
      .map((c: any) => ({ login: c.login, avatar: c.avatar_url, contributions: c.contributions, url: c.html_url }));

    return {
      repo,
      name: meta.name,
      description: meta.description || "",
      defaultBranch: branch,
      language: meta.language ?? null,
      topics: meta.topics || [],
      stars: meta.stargazers_count ?? 0,
      pushedAt: meta.pushed_at ?? null,
      techStack,
      tree,
      fileCount: count,
      tasks,
      phases,
      contributors: contribs,
      readme,
      blueprint,
    };
  } catch (e: any) {
    return {
      repo, name: repo.split("/")[1] || repo, description: "", defaultBranch: "main",
      language: null, topics: [], stars: 0, pushedAt: null, techStack: [],
      tree: { name: "/", path: "", type: "dir", children: [] }, fileCount: 0,
      tasks: [], phases: [], contributors: [], readme: null,
      blueprint: { kind: "", idea: "", purpose: [], layers: [], pipeline: [], edges: [], externals: [], ops: [], tables: [], relations: [] },
      error: e?.message || "Could not analyze repo.",
    };
  }
}
