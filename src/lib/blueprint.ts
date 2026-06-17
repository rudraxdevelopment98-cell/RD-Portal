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
export interface ExtService { id: string; label: string; detail: string; icon: string; connectsTo: string; /* pipeline node id */ flowIn: string; flowOut: string; platform?: string; /* provider / vendor */ limits?: string; /* free-tier caps, rate limits, key expiry */ }
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

/* ---------- external API / service catalog ----------
   Matched against package deps (pkgs) AND a combined text haystack (rx):
   README + description + manifests + env templates + file paths.
   This lets us spot a service used via raw REST or env var, not just an SDK. */
interface ApiSig {
  id: string; label: string; platform: string; limits: string;
  detail: string; flowIn: string; flowOut: string;
  side?: "client" | "server"; // where it typically connects (default: server-or-client)
  pkgs?: string[]; rx?: RegExp;
}
const API_CATALOG: ApiSig[] = [
  { id: "gemini", label: "Gemini API", platform: "Google (Google AI Studio / Vertex AI)",
    detail: "Google Generative AI — Gemini models (text / vision / multimodal)",
    flowIn: "prompt + message history (optional images)", flowOut: "generated tokens / JSON",
    limits: "Free tier via Google AI Studio with low RPM/RPD limits (varies by model); paid tier raises quotas. AI Studio API key is long-lived until revoked.",
    pkgs: ["@google/generative-ai", "@google/genai", "google-generativeai", "google_generative_ai"],
    rx: /\bgemini\b|generative\s*ai|google[ _-]?generativeai|generativelanguage\.googleapis\.com|google ai studio|gemini[_-]?api[_-]?key/ },
  { id: "openai", label: "OpenAI API", platform: "OpenAI",
    detail: "Chat/completions, embeddings & images endpoints",
    flowIn: "prompt + message history", flowOut: "streamed completion tokens",
    limits: "Pay-per-token, no free tier; rate limits (RPM/TPM) scale by usage tier. API keys are long-lived until revoked.",
    pkgs: ["openai"], rx: /\bopenai\b|api\.openai\.com|openai[_-]?api[_-]?key|gpt-4|gpt-3\.5/ },
  { id: "anthropic", label: "Claude API", platform: "Anthropic",
    detail: "Messages endpoint (Claude models)",
    flowIn: "prompt + message history", flowOut: "streamed completion tokens",
    limits: "Pay-per-token; rate limits (RPM/TPM/ITPM) scale by usage tier. API keys are long-lived until revoked.",
    pkgs: ["@anthropic-ai/sdk", "anthropic"], rx: /\banthropic\b|\bclaude\b|api\.anthropic\.com|anthropic[_-]?api[_-]?key/ },
  { id: "firebase", label: "Firebase", platform: "Google (Firebase)",
    detail: "Auth / Firestore / Realtime DB / Cloud Messaging",
    flowIn: "SDK call (auth token / query)", flowOut: "realtime snapshot / auth result", side: "client",
    limits: "Spark (free) plan: 50K Firestore reads/day, 1 GB stored; upgrade to Blaze for pay-as-you-go.",
    pkgs: ["firebase", "firebase-admin", "@react-native-firebase/app", "firebase_core", "cloud_firestore"],
    rx: /firebase|firestore|firebaseio\.com|firebase[_-]?api[_-]?key|google-services\.json/ },
  { id: "stripe", label: "Stripe", platform: "Stripe",
    detail: "PaymentIntents API + webhooks",
    flowIn: "PaymentIntent / checkout session", flowOut: "charge result + webhook event",
    limits: "No free-tier cap; per-transaction fee (~2.9% + 30¢). Secret/restricted keys can be rotated in the dashboard.",
    pkgs: ["stripe", "@stripe/stripe-js"], rx: /\bstripe\b|api\.stripe\.com|stripe[_-]?(secret|api|publishable)[_-]?key|sk_live|pk_live/ },
  { id: "revenuecat", label: "RevenueCat", platform: "RevenueCat",
    detail: "Entitlements, offerings & receipt validation for in-app subscriptions",
    flowIn: "purchase / restore request (product id)", flowOut: "CustomerInfo (active entitlements)", side: "client",
    limits: "Free up to $2.5K monthly tracked revenue, then 1% of revenue.",
    pkgs: ["react-native-purchases", "purchases_flutter"], rx: /revenuecat/ },
  { id: "twilio", label: "Twilio", platform: "Twilio",
    detail: "SMS / WhatsApp / voice messaging API",
    flowIn: "send-message request (to, body)", flowOut: "message SID + delivery status",
    limits: "Pay-as-you-go (trial credit only); per-message fees vary by country. Auth token can be rotated.",
    pkgs: ["twilio"], rx: /\btwilio\b|api\.twilio\.com|twilio[_-]?(account[_-]?sid|auth[_-]?token)/ },
  { id: "sendgrid", label: "SendGrid", platform: "Twilio SendGrid",
    detail: "Transactional email API",
    flowIn: "email payload (to, subject, body)", flowOut: "send accepted + message id",
    limits: "Free tier: 100 emails/day; API key is long-lived until revoked.",
    pkgs: ["@sendgrid/mail"], rx: /sendgrid|sendgrid[_-]?api[_-]?key/ },
  { id: "resend", label: "Resend", platform: "Resend",
    detail: "Transactional email API",
    flowIn: "email payload (to, subject, html)", flowOut: "send accepted + message id",
    limits: "Free tier: 3,000 emails/month, 100/day; API key is long-lived until revoked.",
    pkgs: ["resend"], rx: /\bresend\b|resend[_-]?api[_-]?key/ },
  { id: "googlemaps", label: "Google Maps Platform", platform: "Google",
    detail: "Maps / Places / Geocoding / Directions APIs",
    flowIn: "geocode / places / directions request", flowOut: "coordinates / place data / routes", side: "client",
    limits: "$200 free monthly credit, then pay-per-request; restrict the API key by referrer/IP.",
    pkgs: ["@react-google-maps/api", "google_maps_flutter"], rx: /maps\.googleapis\.com|google[_-]?maps[_-]?api[_-]?key|places api/ },
  { id: "mapbox", label: "Mapbox", platform: "Mapbox",
    detail: "Maps / geocoding / navigation tiles",
    flowIn: "tile / geocode request", flowOut: "map tiles / geocode results", side: "client",
    limits: "Free tier: 50K map loads/month; access token can be rotated/scoped.",
    pkgs: ["mapbox-gl", "@rnmapbox/maps"], rx: /mapbox|mapbox[_-]?(access[_-]?)?token|pk\.eyj/ },
  { id: "cloudinary", label: "Cloudinary", platform: "Cloudinary",
    detail: "Image / video upload, storage & transformation CDN",
    flowIn: "asset upload", flowOut: "hosted + transformed media URL",
    limits: "Free tier: 25 monthly credits (storage+transforms+bandwidth); API secret can be rotated.",
    pkgs: ["cloudinary"], rx: /cloudinary|cloudinary[_-]?(url|api[_-]?key)/ },
  { id: "algolia", label: "Algolia", platform: "Algolia",
    detail: "Hosted search index + instant search",
    flowIn: "indexing / search query", flowOut: "ranked search hits",
    limits: "Free 'Build' plan: 10K search requests + 1M records/month; admin key must stay server-side.",
    pkgs: ["algoliasearch"], rx: /algolia|algolia[_-]?(app[_-]?id|api[_-]?key)/ },
  { id: "aws", label: "AWS", platform: "Amazon Web Services",
    detail: "AWS SDK — S3 / Lambda / DynamoDB / etc.",
    flowIn: "signed AWS API request", flowOut: "service response",
    limits: "12-month free tier on many services then pay-as-you-go; rotate IAM access keys regularly.",
    pkgs: ["aws-sdk", "@aws-sdk/client-s3", "boto3"], rx: /\baws[_-]?(access[_-]?key[_-]?id|secret)|amazonaws\.com|\bboto3\b/ },
  { id: "sentry", label: "Sentry", platform: "Sentry",
    detail: "Error & performance monitoring ingest",
    flowIn: "exception event + stack trace + breadcrumbs", flowOut: "ingest ack", side: "client",
    limits: "Free Developer plan: 5K errors/month, 1 user; DSN is public, auth tokens can be scoped/rotated.",
    pkgs: ["@sentry/react-native", "@sentry/node", "@sentry/react", "@sentry/nextjs", "sentry-sdk"],
    rx: /\bsentry\b|sentry[_-]?dsn|ingest\.sentry\.io/ },
  { id: "push", label: "Push Notifications", platform: "Expo → Apple APNs / Google FCM",
    detail: "Push delivery via Expo / APNs / FCM",
    flowIn: "push token + payload", flowOut: "device-delivered notification",
    limits: "Expo push service is free; APNs/FCM credentials must stay valid (APNs key/cert can expire).",
    pkgs: ["expo-notifications", "@react-native-firebase/messaging"], rx: /push notification|expo[_-]?push|fcm[_-]?(server[_-]?)?key/ },
];

function buildFlow(input: {
  kind: string; stack: string[]; pkg: any; allPaths: string[]; topDirs: string[]; readme: string | null; description: string; signals?: string;
}): { pipeline: FlowNode[]; edges: FlowEdge[]; externals: ExtService[]; ops: FlowNode[] } {
  const { kind, stack, pkg, allPaths, topDirs, readme, description, signals } = input;
  const s = new Set(stack);
  const lowDirs = topDirs.map((d) => d.toLowerCase());
  // combined haystack: README + description + manifests/env templates + file paths
  const text = `${readme || ""} ${description} ${signals || ""} ${allPaths.join(" ")}`.toLowerCase();

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
  } else {
    // unknown framework (Python / Flutter / CLI / etc.) — still anchor the flow
    pipeline.push({ id: "client", label: "Application", detail: stack.filter((x) => x !== "JavaScript").join(" · ") || kind || "App", icon: "▢" });
  }

  // server / edge
  if (hasServerDir || s.has("Node API")) {
    pipeline.push({ id: "server", label: hasSupabaseFns ? "Edge Functions" : "Backend / API", detail: hasSupabaseFns ? "Supabase Edge Functions (Deno)" : (s.has("Node API") ? "Node.js API" : "Server"), icon: "⇄" });
  }

  // data
  if (hasSupabase) {
    const hasStorage = /supabase\.storage|\.storage\.from\(/.test(text) || allPaths.some((p) => /storage/i.test(p));
    const hasRealtime = /\.channel\(|supabase\.realtime|postgres_changes/.test(text);
    const parts = ["Postgres", "Auth"];
    if (hasStorage) parts.push("Storage");
    if (hasRealtime) parts.push("Realtime");
    parts.push("RLS");
    pipeline.push({ id: "data", label: "Supabase", detail: parts.join(" · "), icon: "▤" });
  } else if (hasDb) pipeline.push({ id: "data", label: "Database", detail: depHas(pkg, "prisma") ? "Prisma ORM" : "SQL", icon: "▤" });

  // edges — infer what data flows on each hop
  const isMobile = s.has("Expo") || s.has("React Native");
  const hasHibp = /haveibeenpwned|have i been pwned|\bhibp\b|pwned passwords/.test(text);
  if (pipeline[0] && pipeline[1]) {
    // client → server/data
    const reqLabel = hasHibp ? "email address / SHA-1 prefix" :
      hasSupabase ? "Supabase JS call (auth token + Postgrest query)" : "HTTP request";
    const resLabel = hasHibp ? "breach count / pwned-password match" :
      hasSupabase ? "JSON rows, scoped by Row-Level Security policy" : "JSON response";
    edges.push({ from: pipeline[0].id, to: pipeline[1].id, label: `→ ${reqLabel}` });
    edges.push({ from: pipeline[1].id, to: pipeline[0].id, label: `← ${resLabel}` });
  }
  if (pipeline[1]?.id === "server" && pipeline[2]) {
    const dbIn = hasHibp ? "k-anonymity prefix query (first 5 SHA-1 chars)" : hasSupabase ? "SQL query carrying the user's JWT (auth.uid())" : "SQL query";
    const dbOut = hasHibp ? "matching breach hash suffixes" : hasSupabase ? "rows filtered by RLS policy" : "result set";
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

  if (hasSupabase) {
    addExt({ id: "supabase-auth", label: "Supabase Auth", detail: "OAuth (Google / GitHub) + JWT session issuance", connectsTo: clientNode, flowIn: "OAuth sign-in redirect", flowOut: "JWT access + refresh token", platform: "Supabase", limits: "Free tier: 50,000 monthly active users; access token (JWT) expires after 1 hour, then refreshed." });
    if (/supabase\.storage|\.storage\.from\(/.test(text) || allPaths.some((p) => /storage/i.test(p)))
      addExt({ id: "supabase-storage", label: "Supabase Storage", detail: "S3-compatible object storage with RLS-backed buckets", connectsTo: serverOrClient, flowIn: "file upload (multipart)", flowOut: "public / signed URL", platform: "Supabase", limits: "Free tier: 1 GB stored, 5 GB egress/month; signed URLs expire on the TTL you set." });
    if (/\.channel\(|supabase\.realtime|postgres_changes/.test(text))
      addExt({ id: "supabase-realtime", label: "Supabase Realtime", detail: "WebSocket subscription to Postgres row changes", connectsTo: clientNode, flowIn: "channel subscribe (table filter)", flowOut: "INSERT / UPDATE / DELETE row events", platform: "Supabase", limits: "Free tier: 200 concurrent connections, 2M messages/month." });
  }
  if (hasHibp) {
    const hiNode = pipeline.find((n) => n.id === "server") ? "server" : clientNode;
    addExt({ id: "hibp", label: "HaveIBeenPwned", detail: "Pwned Passwords API v3 — k-anonymity model, full hash never leaves the client/server", connectsTo: hiNode, flowIn: "SHA-1 prefix (first 5 hex chars)", flowOut: "list of matching suffix:count pairs", platform: "Have I Been Pwned (Troy Hunt)", limits: "Pwned Passwords range API is free & unauthenticated; the breach-search API needs a paid key with per-tier rate limits." });
  }

  // Data-driven API/service catalog. Each entry matches on npm/pip/dart package
  // names, OR on text signatures (env-var names, REST hostnames, import lines)
  // found across README + manifests + env templates + file paths — so APIs are
  // detected even when used via raw HTTP or env vars rather than an SDK package.
  for (const c of API_CATALOG) {
    const byPkg = c.pkgs?.some((p) => depHas(pkg, p));
    const byText = c.rx?.test(text);
    if (!byPkg && !byText) continue;
    const node = c.side === "client" ? clientNode : serverOrClient;
    addExt({ id: c.id, label: c.label, detail: c.detail, connectsTo: node, flowIn: c.flowIn, flowOut: c.flowOut, platform: c.platform, limits: c.limits });
  }

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
  signals?: string;
}): Blueprint {
  const kind = detectKind(input.techStack, input.language);
  const { pipeline, edges, externals, ops } = buildFlow({ kind, stack: input.techStack, pkg: input.pkg, allPaths: input.allPaths, topDirs: input.topDirs, readme: input.readme, description: input.description, signals: input.signals });
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

/* ---------- live fallback from a stored project (no fresh fetch) ---------- */
export function deriveBlueprint(p: { desc?: string; readme?: string; techStack?: string[]; repoTree?: TreeNode | null; defaultBranch?: string }): Blueprint {
  const topDirs = topDirsOf(p.repoTree);
  const paths = flattenPaths(p.repoTree);
  return buildBlueprint({
    description: p.desc || "",
    readme: p.readme ?? null,
    topDirs,
    allPaths: paths,
    pkg: null,
    techStack: p.techStack || [],
    language: null,
    // file paths themselves are strong signals (e.g. llm_gemini.py, .env.example)
    signals: [p.readme || "", p.desc || "", paths.join(" ")].join("\n"),
  });
}

/* A blueprint is "thin" when detection found essentially nothing worth showing
   — e.g. an older/empty stored one. We re-derive those from persisted repo data. */
export function isThinBlueprint(bp: Blueprint | undefined | null): boolean {
  if (!bp) return true;
  const ext = (bp.externals?.length ?? 0);
  const lay = (bp.layers?.length ?? 0);
  const pipe = (bp.pipeline?.length ?? 0);
  return ext + lay + pipe === 0;
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
