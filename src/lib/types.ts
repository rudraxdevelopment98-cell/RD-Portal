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

export interface PortalState {
  users: User[];
  projects: Project[];
  members: Member[];
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

/* The backend contract both LocalStore and SupabaseStore satisfy. */
export interface Store {
  mode: "local" | "cloud";
  init(): Promise<void>;
  firstRun(): boolean;
  login(u: string, p: string): Promise<LoginResult>;
  logout(): Promise<void>;
  sessionUser(): string | null;
  activeProject(): string | null;
  setActive(id: string): Promise<void>;
  fetchAll(): Promise<PortalState>;
  addActivity(action: string, projectId?: string): Promise<void>;

  createProject(o: NewProjectInput): Promise<Project>;
  updateProject(id: string, patch: Partial<Project>): Promise<void>;
  deleteProject(id: string): Promise<void>;

  createAccount(o: { name: string; username: string; password: string }): Promise<{ name: string; username: string; password: string }>;
  addMember(o: Omit<Member, "id">): Promise<void>;
  updateMember(id: string, patch: Partial<Member>): Promise<void>;
  removeMember(id: string): Promise<void>;
  updateSelf(patch: { name?: string; password?: string }): Promise<void>;

  createTask(o: Partial<Task>): Promise<void>;
  updateTask(id: string, patch: Partial<Task>): Promise<void>;
  deleteTask(id: string): Promise<void>;

  createDoc(o: Partial<Doc> & { file?: File }): Promise<void>;
  deleteDoc(id: string): Promise<void>;
  createResearch(o: Partial<Research>): Promise<void>;

  resetAll?(): Promise<void>;
}
