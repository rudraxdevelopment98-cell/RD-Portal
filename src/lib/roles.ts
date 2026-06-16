import type { Phase, Role } from "./types";

export interface Section {
  id: string;
  label: string;
  ic: string;
  /** true => not tied to a single project (portfolio-level / account) */
  global?: boolean;
}

/* Navigation sections. `global` items live outside the per-project access model. */
export const SECTIONS: Section[] = [
  { id: "portfolio", label: "Portfolio", ic: "◳", global: true },
  { id: "mywork", label: "My Work", ic: "◈", global: true },
  { id: "dashboard", label: "Dashboard", ic: "▦" },
  { id: "roadmap", label: "Roadmap", ic: "◎" },
  { id: "structure", label: "Structure", ic: "❖" },
  { id: "tasks", label: "Tasks", ic: "✓" },
  { id: "documents", label: "Documents", ic: "▤" },
  { id: "research", label: "Research", ic: "⌕" },
  { id: "activity", label: "Activity", ic: "≣" },
  { id: "members", label: "Members & Roles", ic: "⚙" },
  { id: "profile", label: "My Profile", ic: "◍", global: true },
];

/* Sections that participate in per-project access lists. */
export const PROJECT_SECTIONS = SECTIONS.filter((s) => !s.global).map((s) => s.id);
export const ALLSEC = PROJECT_SECTIONS.slice();

export const ROLES: Record<Role, { all?: boolean; access?: string[] }> = {
  Owner: { all: true },
  Admin: { access: ["dashboard", "roadmap", "structure", "tasks", "documents", "research", "activity", "members"] },
  Manager: { access: ["dashboard", "roadmap", "structure", "tasks", "documents", "research", "activity"] },
  Member: { access: ["dashboard", "roadmap", "structure", "tasks", "documents", "research"] },
  Viewer: { access: ["dashboard", "roadmap", "structure", "documents", "research"] },
};

export function accessForRole(role: Role): string[] {
  const def = ROLES[role];
  return (def.all ? ALLSEC : def.access || []).slice();
}

export const PCOLORS = ["#FF7A66", "#E8C56A", "#7FD1A8", "#22d3ee", "#a855f7", "#60a5fa", "#f472b6", "#37505C"];

export const DEFAULT_PHASES = (): Phase[] => [
  { num: "1", label: "Phase 1", name: "Planning", status: "active" },
  { num: "2", label: "Phase 2", name: "Build", status: "" },
  { num: "3", label: "Phase 3", name: "Test", status: "" },
  { num: "4", label: "Phase 4", name: "Launch", status: "" },
];
