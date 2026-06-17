/* ============================================================
   RD Portal — shared types
   ============================================================ */

export type Role = "Owner" | "Admin" | "Manager" | "Member" | "Viewer";
export type TaskStatus = "To do" | "In progress" | "Done";
export type Priority = "Critical" | "High" | "Medium" | "Low";
export type PhaseStatus = "" | "active" | "done";

export interface User {
  id: string;
  name: string;
  username: string;
  email?: string;  // cloud mode — real OAuth email
  avatar?: string;  // cloud mode — OAuth avatar URL
  password?: string; // local mode only
  status: "Active" | "Inactive";
  platformAdmin: boolean;
  created: number;
}

export interface Phase {
  num: string;
  label: string; // e.g. "Phase 1"
  name: string; // e.g. "MVP"
  status: PhaseStatus;
}

export interface Project {
  id: string;
  name: string;
  key: string;
  color: string;
  desc: string;
  phases: Phase[];
  repo?: string; // "owner/name" for GitHub sync
  techStack?: string[];
  repoTree?: TreeNode | null;
  contributors?: Contributor[];
  fileCount?: number;
  defaultBranch?: string;
  lastSynced?: number;
  readme?: string;
  blueprint?: import("./blueprint").Blueprint;
  created: number;
}

export interface TreeNode {
  name: string;
  path: string;
  type: "dir" | "file";
  children?: TreeNode[];
}

export interface Contributor {
  login: string;
  avatar: string;
  contributions: number;
  url: string;
}

export interface Member {
  id: string;
  username: string;
  projectId: string;
  role: Role;
  access: string[];
  created?: number;
}

export interface Task {
  id: string;
  projectId: string;
  title: string;
  desc: string;
  assignee: string;
  due: string;
  priority: Priority;
  status: TaskStatus;
  phase: string;
  source?: "manual" | "github";
  ghNumber?: number; // GitHub issue number when source === "github"
  repeat?: "daily"; // template: a fresh copy is spawned each day
  created: number;
}

export interface Doc {
  id: string;
  projectId: string;
  name: string;
  category: string;
  size: string;
  data?: string | null;
  by: string;
  date: number;
}

export interface Research {
  id: string;
  projectId: string;
  title: string;
  url?: string;
  category: string;
  note?: string;
  by: string;
  date: number;
}

export interface Activity {
  id: string;
  projectId: string;
  user: string;
  action: string;
  time: number;
}

/** A pending invite by email — becomes a Member once that person signs
    in with a matching OAuth email (cloud mode only). */
export interface Invite {
  id: string;
  email: string;
  projectId: string;
  role: Role;
  access: string[];
  created: number;
}

export interface PortalState {
  users: User[];
  projects: Project[];
  members: Member[];
  invites: Invite[];
  tasks: Task[];
  docs: Doc[];
  research: Research[];
  activity: Activity[];
}

export interface NewProjectInput {
  name: string;
  key: string;
  color: string;
  desc: string;
  repo?: string;
  phases?: Phase[];
}

export interface LoginResult {
  user?: User;
  error?: string;
}

export type OAuthProvider = "google" | "github";

/* The backend contract both LocalStore and SupabaseStore satisfy.
   Cloud (Supabase) uses real OAuth; local (offline/dev) keeps the
   simple username/password flow since there's no backend to call. */
export interface Store {
  mode: "local" | "cloud";
  init(): Promise<void>;
  firstRun(): boolean;
  login?(u: string, p: string): Promise<LoginResult>;
  loginWithOAuth?(provider: OAuthProvider): Promise<void>;
  logout(): Promise<void>;
  sessionUser(): string | null;
  activeProject(): string | null;
  setActive(id: string): Promise<void>;
  fetchAll(): Promise<PortalState>;
  addActivity(action: string, projectId?: string): Promise<void>;

  createProject(o: NewProjectInput): Promise<Project>;
  updateProject(id: string, patch: Partial<Project>): Promise<void>;
  deleteProject(id: string): Promise<void>;

  /** Local mode only — creates a username/password account. */
  createAccount?(o: { name: string; username: string; password: string }): Promise<{ name: string; username: string; password: string }>;
  /** Cloud mode: invite by email (becomes a Member once they sign in with
      a matching OAuth email). Local mode: o.username adds an existing user. */
  addMember(o: { email?: string; username?: string; projectId: string; role: Role; access: string[] }): Promise<{ status: "added" | "invited" }>;
  cancelInvite?(id: string): Promise<void>;
  updateMember(id: string, patch: Partial<Member>): Promise<void>;
  removeMember(id: string): Promise<void>;
  updateSelf(patch: { name?: string; password?: string }): Promise<void>;

  createTask(o: Omit<Partial<Task>, "repeat"> & { repeat?: "daily" | null }): Promise<void>;
  updateTask(id: string, patch: Omit<Partial<Task>, "repeat"> & { repeat?: "daily" | null }): Promise<void>;
  deleteTask(id: string): Promise<void>;

  createDoc(o: Partial<Doc> & { file?: File }): Promise<void>;
  deleteDoc(id: string): Promise<void>;
  createResearch(o: Partial<Research>): Promise<void>;

  /** Realtime: invoke cb whenever server-side data changes. Returns an
      unsubscribe fn. Cloud backend only; local is a no-op. */
  subscribe?(cb: () => void): () => void;

  resetAll?(): Promise<void>;
}
