const AV = ["#FF7A66", "#E8C56A", "#7FD1A8", "#22d3ee", "#a855f7", "#60a5fa", "#f472b6", "#37505C"];

export function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function dateOffset(off = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + off);
  return d.toISOString().slice(0, 10);
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function fmt(ts: number): string {
  const d = new Date(ts);
  return (
    d.toLocaleDateString(undefined, { day: "numeric", month: "short" }) +
    " " +
    d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
  );
}

export function avatarColor(name: string): string {
  let h = 0;
  for (const c of name || "?") h = (h * 31 + c.charCodeAt(0)) % AV.length;
  return AV[h];
}

export function initials(name: string): string {
  return (name || "?")
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export const PRIORITY_TONE: Record<string, string> = {
  Critical: "coral",
  High: "gold",
  Medium: "slate",
  Low: "slate",
};

export const STATUS_TONE: Record<string, string> = {
  "To do": "slate",
  "In progress": "coral",
  Done: "sage",
};

/** parse "owner/name" or a full github URL into "owner/name" */
export function normalizeRepo(input?: string): string | undefined {
  if (!input) return undefined;
  const trimmed = input.trim().replace(/\/+$/, "");
  if (!trimmed) return undefined;
  const m = trimmed.match(/github\.com[/:]([^/]+\/[^/]+)/i);
  if (m) return m[1].replace(/\.git$/, "");
  if (/^[^/\s]+\/[^/\s]+$/.test(trimmed)) return trimmed;
  return trimmed;
}
