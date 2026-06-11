import { ALLSEC, DEFAULT_PHASES } from "../roles";
import { buildSeed } from "../seed";
import type { LoginResult, NewProjectInput, PortalState, Project, Store } from "../types";
import { normalizeRepo, uid } from "../util";

type DB = PortalState & { firstRun: boolean; session: string | null; active: string | null };

const KEY = "rd_portal_v1";

export const LocalStore: Store = {
  mode: "local",
  // @ts-expect-error internal handle
  db: null as DB | null,

  _load(this: any): DB {
    try {
      this.db = JSON.parse(localStorage.getItem(KEY) || "null");
    } catch {
      this.db = null;
    }
    if (!this.db) this._seed();
    return this.db;
  },

  _save(this: any) {
    localStorage.setItem(KEY, JSON.stringify(this.db));
  },

  _seed(this: any) {
    this.db = buildSeed();
    this._save();
  },

  async init(this: any) {
    this._load();
  },

  firstRun(this: any) {
    return !!this.db.firstRun;
  },

  async login(this: any, u: string, p: string): Promise<LoginResult> {
    const f = this.db.users.find((x: any) => x.username === u && x.password === p);
    if (!f) return { error: "Invalid username or password." };
    if (f.status !== "Active") return { error: "This account is deactivated." };
    this.db.session = u;
    this.db.firstRun = false;
    const mine = this.db.members.filter((m: any) => m.username === u).map((m: any) => m.projectId);
    if (mine.length && !mine.includes(this.db.active)) this.db.active = mine[0];
    this._save();
    return { user: f };
  },

  async logout(this: any) {
    this.db.session = null;
    this._save();
  },

  sessionUser(this: any) {
    return this.db?.session ?? null;
  },

  activeProject(this: any) {
    return this.db?.active ?? null;
  },

  async setActive(this: any, id: string) {
    this.db.active = id;
    this._save();
  },

  async fetchAll(this: any): Promise<PortalState> {
    const d = this.db;
    return { users: d.users, projects: d.projects, members: d.members, tasks: d.tasks, docs: d.docs, research: d.research, activity: d.activity };
  },

  async addActivity(this: any, action: string, projectId?: string) {
    this.db.activity.unshift({ id: uid(), projectId: projectId || this.db.active, user: this.db.session || "system", action, time: Date.now() });
    this.db.activity = this.db.activity.slice(0, 400);
    this._save();
  },

  async createProject(this: any, o: NewProjectInput): Promise<Project> {
    const p: Project = { id: uid(), created: Date.now(), phases: o.phases?.length ? o.phases : DEFAULT_PHASES(), repo: normalizeRepo(o.repo), name: o.name, key: o.key, color: o.color, desc: o.desc };
    this.db.projects.push(p);
    this.db.members.push({ id: uid(), username: this.db.session, projectId: p.id, role: "Owner", access: ALLSEC.slice(), created: Date.now() });
    this._save();
    return p;
  },

  async updateProject(this: any, id: string, patch: Partial<Project>) {
    const p = this.db.projects.find((x: any) => x.id === id);
    if (p) Object.assign(p, patch);
    this._save();
  },

  async deleteProject(this: any, id: string) {
    this.db.projects = this.db.projects.filter((p: any) => p.id !== id);
    this.db.members = this.db.members.filter((m: any) => m.projectId !== id);
    this.db.tasks = this.db.tasks.filter((t: any) => t.projectId !== id);
    this.db.docs = this.db.docs.filter((d: any) => d.projectId !== id);
    this.db.research = this.db.research.filter((r: any) => r.projectId !== id);
    if (this.db.active === id) this.db.active = (this.db.projects[0] || {}).id || null;
    this._save();
  },

  async createAccount(this: any, o: { name: string; username: string; password: string }) {
    this.db.users.push({ id: uid(), created: Date.now(), status: "Active", platformAdmin: false, ...o });
    this._save();
    return o;
  },

  async addMember(this: any, o: any) {
    this.db.members.push({ id: uid(), created: Date.now(), ...o });
    this._save();
  },

  async updateMember(this: any, id: string, patch: any) {
    const m = this.db.members.find((x: any) => x.id === id);
    if (m) Object.assign(m, patch);
    this._save();
  },

  async removeMember(this: any, id: string) {
    this.db.members = this.db.members.filter((m: any) => m.id !== id);
    this._save();
  },

  async updateSelf(this: any, patch: any) {
    const u = this.db.users.find((x: any) => x.username === this.db.session);
    if (u) Object.assign(u, patch);
    this._save();
  },

  async createTask(this: any, o: any) {
    this.db.tasks.push({ id: uid(), created: Date.now(), status: "To do", projectId: this.db.active, ...o });
    this._save();
  },

  async updateTask(this: any, id: string, patch: any) {
    const t = this.db.tasks.find((x: any) => x.id === id);
    if (t) Object.assign(t, patch);
    this._save();
  },

  async deleteTask(this: any, id: string) {
    this.db.tasks = this.db.tasks.filter((x: any) => x.id !== id);
    this._save();
  },

  async createDoc(this: any, o: any) {
    this.db.docs.unshift({ id: uid(), date: Date.now(), projectId: this.db.active, ...o });
    this._save();
  },

  async deleteDoc(this: any, id: string) {
    this.db.docs = this.db.docs.filter((x: any) => x.id !== id);
    this._save();
  },

  async createResearch(this: any, o: any) {
    this.db.research.unshift({ id: uid(), date: Date.now(), projectId: this.db.active, by: this.db.session, ...o });
    this._save();
  },

  async resetAll(this: any) {
    localStorage.removeItem(KEY);
    this._seed();
  },
} as Store;
