/* ============================================================
   Blueprint — heuristic "understanding" of a project.
   Turns raw repo signals (README, dirs, deps, stack) into:
     · idea + purpose        (what it is / why)
     · kind                  (mobile / web / api / library)
     · layers                (building structure)
     · pipeline + externals  (data-flow diagram)
   Pure functions — no network. AI enrichment layers on later.
   ============================================================ */
import type { Phase, Task, TreeNode } from "./types";

export interface FlowNode { id: string; label: string; detail: string; icon: string; }
export interface Layer { id: string; name: string; role: string; icon: string; dirs: string[]; }
export interface Blueprint {
  kind: string;
  idea: string;
  purpose: string[];
  layers: Layer[];
  pipeline: FlowNode[];  // ordered client → server → data
  externals: FlowNode[]; // third-party services
  ops: FlowNode[];       // build / CI / deploy
}

export interface Stage extends Phase {
  state: "done" | "active" | "upcoming";
  current: boolean;
}

/* ---------- README → idea + purpose ---------- */
function cleanLine(l: string): string {
  return l
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")     // images
    .replace(/\[!\[[^\]]*\]\([^)]*\)\]\([^)]*\)/g, "") // badge links
    .replace(/<[^>]+>/g, "")                   // html tags
    .replace(/[*_`#>]/g, "")                   // md emphasis/heading marks
    .trim();
}

function extractIdea(readme: string | null, description: string): string {
  if (readme) {
    const lines = readme.split("\n");
    let para: string[] = [];
    for (const raw of lines) {
      const l = cleanLine(raw);
      if (!l) { if (para.length) break; else continue; }
      if (/^=+$|^-+$/.test(l)) continue;       // setext underline
      if (raw.trim().startsWith("#") && para.length === 0) continue; // skip leading title
      if (/^(badge|build|coverage|license|npm|version)\b/i.test(l) && para.length === 0) continue;
      para.push(l);
      if (para.join(" ").length > 320) break;
    }
    const text = para.join(" ").trim();
    if (text.length > 30) return text.slice(0, 360);
  }
  return description || "No description available — add a README to your repo for a richer summary.";
}

function extractPurpose(readme: string | null): string[] {
  if (!readme) return [];
  const lines = readme.split("\n");
  const bullets: string[] = [];
  let inFeatures = false;
  for (const raw of lines) {
    const l = raw.trim();
    if (/^#{1,4}\s*(features|what|highlights|capabilities|why)\b/i.test(l)) { inFeatures = true; continue; }
    if (inFeatures && /^#{1,4}\s/.test(l)) break; // next heading ends the section
    if (/^[-*+]\s+/.test(l)) {
      const t = cleanLine(l.replace(/^[-*+]\s+/, ""));
      if (t.length > 3 && t.length < 120) bullets.push(t);
    }
    if (bullets.length >= 6) break;
  }
  return bullets.slice(0, 6);
}

/* ---------- kind ---------- */
function detectKind(stack: string[], lang: string | null): string {
  const s = new Set(stack);
  if (s.has("Expo") || s.has("React Native")) return "Mobile app";
  if (s.has("Flutter")) return "Mobile app (Flutter)";
  if (s.has("Next.js")) return "Web app";
  if (s.has("React") || s.has("Vue") || s.has("Svelte") || s.has("Angular")) return "Web app";
  if (s.has("Node API")) return "Backend service";
  if (s.has("Python") || s.has("Go") || s.has("Rust")) return "Service / tooling";
  return lang ? `${lang} project` : "Software project";
}

/* ---------- layers (building structure) ---------- */
const LAYER_DEFS: { id: string; name: string; role: string; icon: string; match: string[] }[] = [
  { id: "app", name: "Application", role: "Screens, components and client logic", icon: "◐", match: ["src", "app", "lib", "components", "screens", "pages", "hooks", "views", "ui", "features"] },
  { id: "server", name: "Backend / API", role: "Server endpoints, edge functions and business logic", icon: "⇄", match: ["api", "server", "backend", "functions", "routes", "controllers", "services"] },
  { id: "data", name: "Data layer", role: "Database schema, migrations and storage", icon: "▤", match: ["supabase", "db", "database", "migrations", "prisma", "models", "schema"] },
  { id: "assets", name: "Assets", role: "Static files, images and fonts", icon: "▦", match: ["public", "assets", "static", "images", "img", "fonts"] },
  { id: "test", name: "Tests", role: "Automated tests", icon: "✓", match: ["test", "tests", "__tests__", "e2e", "spec", "cypress"] },
  { id: "ops", name: "Build & CI/CD", role: "Pipelines, scripts and deployment", icon: "⚙", match: [".github", "ci", ".circleci", "scripts", "deploy", "infra"] },
  { id: "docs", name: "Docs", role: "Documentation", icon: "⌕", match: ["docs", "doc", "documentation"] },
];

function buildLayers(topDirs: string[]): Layer[] {
  const dirs = topDirs.map((d) => d.toLowerCase());
  const layers: Layer[] = [];
  for (const def of LAYER_DEFS) {
    const matched = topDirs.filter((_, i) => def.match.includes(dirs[i]));
    if (matched.length) layers.push({ id: def.id, name: def.name, role: def.role, icon: def.icon, dirs: matched });
  }
  return layers;
}

/* ---------- data flow ---------- */
function depHas(pkg: any, name: string): boolean {
  if (!pkg) return false;
  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  return Object.prototype.hasOwnProperty.call(deps, name);
}

function buildFlow(input: {
  kind: string; stack: string[]; pkg: any; allPaths: string[]; topDirs: string[]; readme: string | null; description: string;
}): { pipeline: FlowNode[]; externals: FlowNode[]; ops: FlowNode[] } {
  const { kind, stack, pkg, allPaths, topDirs, readme, description } = input;
  const s = new Set(stack);
  const lowDirs = topDirs.map((d) => d.toLowerCase());
  const text = `${readme || ""} ${description}`.toLowerCase();

  const hasSupabaseFns = allPaths.some((p) => /^supabase\/functions\//.test(p));
  const hasServerDir = lowDirs.some((d) => ["api", "server", "backend", "functions", "routes"].includes(d)) || hasSupabaseFns;
  const hasSupabase = s.has("Supabase");
  const hasDb = hasSupabase || lowDirs.some((d) => ["db", "database", "migrations", "prisma"].includes(d)) || depHas(pkg, "prisma") || depHas(pkg, "drizzle-orm");

  const pipeline: FlowNode[] = [];

  // client
  if (s.has("Expo") || s.has("React Native")) pipeline.push({ id: "client", label: "Mobile app", detail: [...s].filter((x) => ["Expo", "React Native", "TypeScript"].includes(x)).join(" · ") || "React Native", icon: "▢" });
  else if (s.has("Next.js") || s.has("React") || s.has("Vue") || s.has("Svelte") || s.has("Angular")) pipeline.push({ id: "client", label: "Web client", detail: [...s].filter((x) => ["Next.js", "React", "Vue", "Svelte", "Angular", "TypeScript"].includes(x)).join(" · "), icon: "▢" });
  else if (kind === "Backend service") pipeline.push({ id: "client", label: "API consumers", detail: "HTTP clients", icon: "▢" });

  // server / edge
  if (hasServerDir || s.has("Node API")) {
    pipeline.push({ id: "server", label: hasSupabaseFns ? "Edge Functions" : "Backend / API", detail: hasSupabaseFns ? "Supabase Edge Functions" : (s.has("Node API") ? "Node API" : "Server endpoints"), icon: "⇄" });
  }

  // data
  if (hasSupabase) pipeline.push({ id: "data", label: "Supabase", detail: "Postgres · Auth · Storage", icon: "▤" });
  else if (hasDb) pipeline.push({ id: "data", label: "Database", detail: depHas(pkg, "prisma") ? "Prisma" : "SQL", icon: "▤" });

  // externals
  const externals: FlowNode[] = [];
  const addExt = (id: string, label: string, detail: string) => { if (!externals.find((e) => e.id === id)) externals.push({ id, label, detail, icon: "◇" }); };
  if (depHas(pkg, "react-native-purchases") || /revenuecat/.test(text)) addExt("revenuecat", "RevenueCat", "In-app payments");
  if (depHas(pkg, "stripe") || depHas(pkg, "@stripe/stripe-js")) addExt("stripe", "Stripe", "Payments");
  if (depHas(pkg, "openai")) addExt("openai", "OpenAI", "LLM API");
  if (depHas(pkg, "@anthropic-ai/sdk")) addExt("anthropic", "Claude API", "LLM API");
  if (depHas(pkg, "firebase")) addExt("firebase", "Firebase", "Backend services");
  if (/haveibeenpwned|have i been pwned|\bhibp\b|pwned passwords/.test(text)) addExt("hibp", "HaveIBeenPwned", "Breach data API");
  if (depHas(pkg, "@sentry/react-native") || depHas(pkg, "@sentry/node") || depHas(pkg, "@sentry/react")) addExt("sentry", "Sentry", "Error tracking");
  if (depHas(pkg, "expo-notifications") || /push notification/.test(text)) addExt("push", "Push", "Notifications");

  // ops / build
  const ops: FlowNode[] = [];
  if (allPaths.some((p) => /^\.github\/workflows\//.test(p))) ops.push({ id: "actions", label: "GitHub Actions", detail: "CI/CD", icon: "⚙" });
  if (s.has("Docker") || allPaths.some((p) => /(^|\/)Dockerfile$/i.test(p))) ops.push({ id: "docker", label: "Docker", detail: "Containerized", icon: "⬡" });
  if (s.has("Expo")) ops.push({ id: "eas", label: "EAS / App Stores", detail: "Mobile builds", icon: "▲" });

  return { pipeline, externals, ops };
}

/* ---------- top-level dirs from a TreeNode ---------- */
export function topDirsOf(tree: TreeNode | null | undefined): string[] {
  if (!tree?.children) return [];
  return tree.children.filter((c) => c.type === "dir").map((c) => c.name);
}

/* ---------- main builder (used at analyze time) ---------- */
export function buildBlueprint(input: {
  description: string;
  readme: string | null;
  topDirs: string[];
  allPaths: string[];
  pkg: any;
  techStack: string[];
  language: string | null;
}): Blueprint {
  const kind = detectKind(input.techStack, input.language);
  return {
    kind,
    idea: extractIdea(input.readme, input.description),
    purpose: extractPurpose(input.readme),
    layers: buildLayers(input.topDirs),
    ...buildFlow({ kind, stack: input.techStack, pkg: input.pkg, allPaths: input.allPaths, topDirs: input.topDirs, readme: input.readme, description: input.description }),
  };
}

/* ---------- live fallback from a stored project (no README) ---------- */
export function deriveBlueprint(p: { desc?: string; techStack?: string[]; repoTree?: TreeNode | null; defaultBranch?: string }): Blueprint {
  const topDirs = topDirsOf(p.repoTree);
  return buildBlueprint({
    description: p.desc || "",
    readme: null,
    topDirs,
    allPaths: flattenPaths(p.repoTree),
    pkg: null,
    techStack: p.techStack || [],
    language: null,
  });
}

function flattenPaths(tree: TreeNode | null | undefined, acc: string[] = []): string[] {
  if (!tree?.children) return acc;
  for (const c of tree.children) {
    acc.push(c.path);
    if (c.children) flattenPaths(c, acc);
  }
  return acc;
}

/* ---------- stages from phases + tasks ---------- */
export function deriveStages(phases: Phase[], _tasks: Task[]): { stages: Stage[]; currentNum: string | null } {
  let currentSet = false;
  let currentNum: string | null = null;
  const stages: Stage[] = phases.map((ph) => {
    let st: Stage["state"] = "upcoming";
    if (ph.status === "done") st = "done";
    else if (ph.status === "active") st = "active";
    const current = st === "active" && !currentSet;
    if (current) { currentSet = true; currentNum = ph.num; }
    return { ...ph, state: st, current };
  });
  // if no explicit active, mark first non-done as current
  if (!currentSet) {
    const idx = stages.findIndex((s) => s.state !== "done");
    if (idx >= 0) { stages[idx].current = true; stages[idx].state = "active"; currentNum = stages[idx].num; }
  }
  return { stages, currentNum };
}
