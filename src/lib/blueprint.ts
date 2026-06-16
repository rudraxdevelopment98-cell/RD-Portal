/* ============================================================
   Blueprint — heuristic "understanding" of a project.
   Turns raw repo signals (README, dirs, deps, stack) into:
     · idea + purpose        (what it is / why)
     · kind                  (mobile / web / api / library)
     · layers                (building structure)
     · pipeline + externals  (data-flow diagram)
   Pure functions — no network. AI enrichment layers on later.
   ============================================================ */
import type { Phase, TreeNode } from "./types";

export interface FlowNode { id: string; label: string; detail: string; icon: string; }
export interface FlowEdge { from: string; to: string; label: string; }
export interface ExtService { id: string; label: string; detail: string; icon: string; connectsTo: string; /* pipeline node id */ flowIn: string; flowOut: string; }
export interface Layer { id: string; name: string; role: string; icon: string; dirs: string[]; color: string; }
export interface Column { name: string; type: string; pk?: boolean; fk?: { table: string; column: string }; }
export interface TableInfo { name: string; columns: Column[]; }
export interface Relation { from: string; fromCol: string; to: string; toCol: string; }
export interface Blueprint {
  kind: string;
  idea: string;
  purpose: string[];
  layers: Layer[];
  pipeline: FlowNode[];
  edges: FlowEdge[];
  externals: ExtService[];
  ops: FlowNode[];
  tables: TableInfo[];
  relations: Relation[];
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
const LAYER_DEFS: { id: string; name: string; role: string; icon: string; color: string; match: string[] }[] = [
  { id: "app",    name: "Application",   role: "Screens, components, hooks and client logic", icon: "◐", color: "var(--coral)",  match: ["src", "app", "lib", "components", "screens", "pages", "hooks", "views", "ui", "features"] },
  { id: "server", name: "Backend / API", role: "Edge functions, server endpoints, business logic", icon: "⇄", color: "var(--gold)",   match: ["api", "server", "backend", "functions", "routes", "controllers", "services"] },
  { id: "data",   name: "Data layer",    role: "Database schema, migrations, models, storage",  icon: "▤", color: "var(--sage)",   match: ["supabase", "db", "database", "migrations", "prisma", "models", "schema"] },
  { id: "assets", name: "Assets",        role: "Static files, images and fonts",                icon: "▦", color: "var(--muted)",  match: ["public", "assets", "static", "images", "img", "fonts"] },
  { id: "test",   name: "Tests",         role: "Automated tests — unit, integration, e2e",      icon: "✓", color: "var(--muted)",  match: ["test", "tests", "__tests__", "e2e", "spec", "cypress"] },
  { id: "ops",    name: "Build & CI/CD", role: "Pipelines, scripts and deployment automation",  icon: "⚙", color: "var(--faint)", match: [".github", "ci", ".circleci", "scripts", "deploy", "infra"] },
  { id: "docs",   name: "Docs",          role: "Documentation and guides",                      icon: "⌕", color: "var(--faint)", match: ["docs", "doc", "documentation"] },
];

function buildLayers(topDirs: string[]): Layer[] {
  const dirs = topDirs.map((d) => d.toLowerCase());
  const layers: Layer[] = [];
  for (const def of LAYER_DEFS) {
    const matched = topDirs.filter((_, i) => def.match.includes(dirs[i]));
    if (matched.length) layers.push({ id: def.id, name: def.name, role: def.role, icon: def.icon, color: def.color, dirs: matched });
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
}): { pipeline: FlowNode[]; edges: FlowEdge[]; externals: ExtService[]; ops: FlowNode[] } {
  const { kind, stack, pkg, allPaths, topDirs, readme, description } = input;
  const s = new Set(stack);
  const lowDirs = topDirs.map((d) => d.toLowerCase());
  const text = `${readme || ""} ${description}`.toLowerCase();

  const hasSupabaseFns = allPaths.some((p) => /^supabase\/functions\//.test(p));
  const hasServerDir = lowDirs.some((d) => ["api", "server", "backend", "functions", "routes"].includes(d)) || hasSupabaseFns;
  const hasSupabase = s.has("Supabase");
  const hasDb = hasSupabase || lowDirs.some((d) => ["db", "database", "migrations", "prisma"].includes(d)) || depHas(pkg, "prisma") || depHas(pkg, "drizzle-orm");

  const pipeline: FlowNode[] = [];
  const edges: FlowEdge[] = [];

  // client
  if (s.has("Expo") || s.has("React Native")) {
    pipeline.push({ id: "client", label: "Mobile app", detail: [...s].filter((x) => ["Expo", "React Native", "TypeScript"].includes(x)).join(" · ") || "React Native", icon: "▢" });
  } else if (s.has("Next.js") || s.has("React") || s.has("Vue") || s.has("Svelte") || s.has("Angular")) {
    pipeline.push({ id: "client", label: "Web client", detail: [...s].filter((x) => ["Next.js", "React", "Vue", "Svelte", "Angular", "TypeScript"].includes(x)).join(" · "), icon: "▢" });
  } else if (kind === "Backend service") {
    pipeline.push({ id: "client", label: "API consumers", detail: "HTTP clients", icon: "▢" });
  }

  // server / edge
  if (hasServerDir || s.has("Node API")) {
    pipeline.push({ id: "server", label: hasSupabaseFns ? "Edge Functions" : "Backend / API", detail: hasSupabaseFns ? "Supabase Edge Functions (Deno)" : (s.has("Node API") ? "Node.js API" : "Server"), icon: "⇄" });
  }

  // data
  if (hasSupabase) pipeline.push({ id: "data", label: "Supabase", detail: "Postgres · Auth · Storage · RLS", icon: "▤" });
  else if (hasDb) pipeline.push({ id: "data", label: "Database", detail: depHas(pkg, "prisma") ? "Prisma ORM" : "SQL", icon: "▤" });

  // edges — infer what data flows on each hop
  const isMobile = s.has("Expo") || s.has("React Native");
  const hasHibp = /haveibeenpwned|have i been pwned|\bhibp\b|pwned passwords/.test(text);
  if (pipeline[0] && pipeline[1]) {
    // client → server/data
    const reqLabel = hasHibp ? "email address / SHA-1 prefix" :
      hasSupabase ? "HTTPS + JWT token" : "HTTP request";
    const resLabel = hasHibp ? "breach list / password match" :
      hasSupabase ? "JSON rows + RLS-filtered" : "JSON response";
    edges.push({ from: pipeline[0].id, to: pipeline[1].id, label: `→ ${reqLabel}` });
    edges.push({ from: pipeline[1].id, to: pipeline[0].id, label: `← ${resLabel}` });
  }
  if (pipeline[1]?.id === "server" && pipeline[2]) {
    const dbIn = hasHibp ? "k-anon prefix query" : hasSupabase ? "SQL query + JWT" : "SQL query";
    const dbOut = hasHibp ? "matching breach records" : hasSupabase ? "rows (RLS enforced)" : "result set";
    edges.push({ from: "server", to: pipeline[2].id, label: `→ ${dbIn}` });
    edges.push({ from: pipeline[2].id, to: "server", label: `← ${dbOut}` });
  }

  // externals — wired to specific pipeline nodes
  const externals: ExtService[] = [];
  const addExt = (x: Omit<ExtService, "icon">) => {
    if (!externals.find((e) => e.id === x.id)) externals.push({ ...x, icon: "◇" });
  };

  const serverOrClient = (pipeline.find((n) => n.id === "server") ? "server" : "client");
  const clientNode = pipeline.find((n) => n.id === "client")?.id || "client";

  if (depHas(pkg, "react-native-purchases") || /revenuecat/.test(text))
    addExt({ id: "revenuecat", label: "RevenueCat", detail: "In-app subscriptions & paywalls", connectsTo: clientNode, flowIn: "purchase request", flowOut: "entitlement status" });
  if (depHas(pkg, "stripe") || depHas(pkg, "@stripe/stripe-js"))
    addExt({ id: "stripe", label: "Stripe", detail: "Web payments", connectsTo: serverOrClient, flowIn: "payment intent", flowOut: "charge confirmation" });
  if (depHas(pkg, "openai"))
    addExt({ id: "openai", label: "OpenAI", detail: "LLM completions", connectsTo: serverOrClient, flowIn: "prompt + context", flowOut: "completion stream" });
  if (depHas(pkg, "@anthropic-ai/sdk"))
    addExt({ id: "anthropic", label: "Claude API", detail: "LLM completions", connectsTo: serverOrClient, flowIn: "prompt + context", flowOut: "completion stream" });
  if (depHas(pkg, "firebase"))
    addExt({ id: "firebase", label: "Firebase", detail: "Backend services", connectsTo: serverOrClient, flowIn: "SDK call", flowOut: "realtime / auth response" });
  if (hasHibp) {
    const hiNode = pipeline.find((n) => n.id === "server") ? "server" : clientNode;
    addExt({ id: "hibp", label: "HaveIBeenPwned", detail: "Breach data (k-anonymity)", connectsTo: hiNode, flowIn: "SHA-1 prefix (5 chars)", flowOut: "matching suffix list" });
  }
  if (depHas(pkg, "@sentry/react-native") || depHas(pkg, "@sentry/node") || depHas(pkg, "@sentry/react"))
    addExt({ id: "sentry", label: "Sentry", detail: "Error tracking", connectsTo: clientNode, flowIn: "error event + stack trace", flowOut: "ack" });
  if (depHas(pkg, "expo-notifications") || /push notification/.test(text))
    addExt({ id: "push", label: "Push Notifications", detail: "APNs / FCM", connectsTo: serverOrClient, flowIn: "trigger event", flowOut: "device notification" });

  // ops / build
  const ops: FlowNode[] = [];
  if (allPaths.some((p) => /^\.github\/workflows\//.test(p))) ops.push({ id: "actions", label: "GitHub Actions", detail: "CI/CD pipeline", icon: "⚙" });
  if (s.has("Docker") || allPaths.some((p) => /(^|\/)Dockerfile$/i.test(p))) ops.push({ id: "docker", label: "Docker", detail: "Containerized deploy", icon: "⬡" });
  if (s.has("Expo")) ops.push({ id: "eas", label: "EAS Build", detail: "iOS + Android builds", icon: "▲" });
  if (isMobile) ops.push({ id: "stores", label: "App Stores", detail: "App Store · Play Store", icon: "◉" });

  return { pipeline, edges, externals, ops };
}

/* ---------- database schema parsing ---------- */
const unquote = (s: string) => s.replace(/^["'`\[]|["'`\]]$/g, "").trim();

/* Split a parenthesised body on top-level commas (ignores commas inside (...)) */
function splitTopLevel(body: string): string[] {
  const parts: string[] = [];
  let depth = 0, cur = "";
  for (const ch of body) {
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    if (ch === "," && depth === 0) { parts.push(cur); cur = ""; }
    else cur += ch;
  }
  if (cur.trim()) parts.push(cur);
  return parts;
}

/* Parse PostgreSQL `create table` statements (Supabase style). */
function parseSqlSchema(sql: string): { tables: TableInfo[]; relations: Relation[] } {
  const tables: TableInfo[] = [];
  const relations: Relation[] = [];
  const lower = sql;
  const re = /create\s+table\s+(?:if\s+not\s+exists\s+)?([`"\[]?[\w.]+[`"\]]?)\s*\(/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(lower))) {
    let name = unquote(m[1]).replace(/^public\./, "");
    // scan balanced parens for the table body
    let i = re.lastIndex, depth = 1, body = "";
    while (i < lower.length && depth > 0) {
      const ch = lower[i];
      if (ch === "(") depth++;
      else if (ch === ")") depth--;
      if (depth > 0) body += ch;
      i++;
    }
    const columns: Column[] = [];
    for (const rawLine of splitTopLevel(body)) {
      const line = rawLine.trim();
      if (!line) continue;
      const low = line.toLowerCase();

      // table-level foreign key:  foreign key (col) references other(c)
      const tfk = low.match(/foreign\s+key\s*\(\s*([\w"]+)\s*\)\s*references\s+([`"\[]?[\w.]+[`"\]]?)\s*(?:\(\s*([\w"]+)\s*\))?/i);
      if (tfk) {
        const fromCol = unquote(tfk[1]); const to = unquote(tfk[2]).replace(/^public\./, ""); const toCol = tfk[3] ? unquote(tfk[3]) : "id";
        relations.push({ from: name, fromCol, to, toCol });
        const c = columns.find((x) => x.name === fromCol); if (c) c.fk = { table: to, column: toCol };
        continue;
      }
      // skip other table-level constraints
      if (/^(primary\s+key|unique|constraint|check|exclude)\b/i.test(low)) continue;

      // column definition: name type ...
      const cm = line.match(/^([`"\[]?[\w]+[`"\]]?)\s+([a-zA-Z][\w]*(?:\s*\([^)]*\))?(?:\[\])?)/);
      if (!cm) continue;
      const colName = unquote(cm[1]);
      const colType = cm[2].replace(/\s+/g, "").toLowerCase();
      const col: Column = { name: colName, type: colType };
      if (/\bprimary\s+key\b/i.test(low)) col.pk = true;
      // inline fk: references other(col)
      const ifk = low.match(/references\s+([`"\[]?[\w.]+[`"\]]?)\s*(?:\(\s*([\w"]+)\s*\))?/i);
      if (ifk) {
        const to = unquote(ifk[1]).replace(/^public\./, ""); const toCol = ifk[2] ? unquote(ifk[2]) : "id";
        col.fk = { table: to, column: toCol };
        relations.push({ from: name, fromCol: colName, to, toCol });
      }
      columns.push(col);
    }
    if (columns.length) tables.push({ name, columns });
  }
  return { tables, relations };
}

/* Parse Prisma schema `model X { ... }` blocks. */
function parsePrismaSchema(src: string): { tables: TableInfo[]; relations: Relation[] } {
  const tables: TableInfo[] = [];
  const relations: Relation[] = [];
  const re = /model\s+(\w+)\s*\{([^}]*)\}/g;
  const modelNames = new Set<string>();
  let m: RegExpExecArray | null;
  const blocks: { name: string; body: string }[] = [];
  while ((m = re.exec(src))) { modelNames.add(m[1]); blocks.push({ name: m[1], body: m[2] }); }
  for (const { name, body } of blocks) {
    const columns: Column[] = [];
    for (const rawLine of body.split("\n")) {
      const line = rawLine.trim();
      if (!line || line.startsWith("//") || line.startsWith("@@")) continue;
      const parts = line.split(/\s+/);
      if (parts.length < 2) continue;
      const colName = parts[0];
      const baseType = parts[1].replace(/[?\[\]]/g, "");
      const col: Column = { name: colName, type: parts[1].toLowerCase() };
      if (/@id\b/.test(line)) col.pk = true;
      // relation to another model
      if (modelNames.has(baseType)) {
        const rel = line.match(/@relation\([^)]*fields:\s*\[(\w+)\][^)]*references:\s*\[(\w+)\]/);
        if (rel) { col.fk = { table: baseType, column: rel[2] }; relations.push({ from: name, fromCol: rel[1], to: baseType, toCol: rel[2] }); }
        continue; // virtual relation field, not a stored column
      }
      columns.push(col);
    }
    if (columns.length) tables.push({ name, columns });
  }
  return { tables, relations };
}

export function parseSchema(content: string, path: string): { tables: TableInfo[]; relations: Relation[] } {
  if (/\.prisma$/i.test(path)) return parsePrismaSchema(content);
  return parseSqlSchema(content);
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
  schema?: { content: string; path: string } | null;
}): Blueprint {
  const kind = detectKind(input.techStack, input.language);
  const { pipeline, edges, externals, ops } = buildFlow({ kind, stack: input.techStack, pkg: input.pkg, allPaths: input.allPaths, topDirs: input.topDirs, readme: input.readme, description: input.description });
  const db = input.schema ? parseSchema(input.schema.content, input.schema.path) : { tables: [], relations: [] };
  return {
    kind,
    idea: extractIdea(input.readme, input.description),
    purpose: extractPurpose(input.readme),
    layers: buildLayers(input.topDirs),
    pipeline, edges, externals, ops,
    tables: db.tables,
    relations: db.relations,
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

/* ---------- stages from phases ---------- */
export function deriveStages(phases: Phase[]): { stages: Stage[]; currentNum: string | null; progress: number } {
  const stages: Stage[] = phases.map((ph) => ({
    ...ph,
    state: ph.status === "done" ? "done" : ph.status === "active" ? "active" : "upcoming",
    current: false,
  }));

  // current = first explicitly-active phase; else the first not-done phase
  // (the next thing to work on). If everything is done, there is no "current".
  let curIdx = stages.findIndex((s) => s.state === "active");
  if (curIdx === -1) curIdx = stages.findIndex((s) => s.state !== "done");
  if (curIdx >= 0) stages[curIdx].current = true;

  // stage-based progress: done = 1, active = 0.5, upcoming = 0
  const score = stages.reduce((a, s) => a + (s.state === "done" ? 1 : s.state === "active" ? 0.5 : 0), 0);
  const progress = stages.length ? Math.round((score / stages.length) * 100) : 0;

  return { stages, currentNum: curIdx >= 0 ? stages[curIdx].num : null, progress };
}
