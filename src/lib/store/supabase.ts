import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { ALLSEC, DEFAULT_PHASES } from "../roles";
import type { LoginResult, NewProjectInput, PortalState, Project, Store, User } from "../types";
import { normalizeRepo } from "../util";

/* Real multi-user backend. Mirrors LocalStore's contract.
   Schema lives in supabase/schema.sql. */
export function makeSupabaseStore(url: string, key: string): Store {
  const sb: SupabaseClient = createClient(url, key);
  const EMAIL = (u: string) => (u.includes("@") ? u : `${u}@rd.local`);
  let _session: any = null;
  let _profile: any = null;
  let _active: string | null = null;

  const rU = (p: any): User => ({ id: p.id, name: p.name, username: p.username, status: p.status, platformAdmin: p.platform_admin, created: Date.parse(p.created_at) });

  return {
    mode: "cloud",

    async init() {
      const { data } = await sb.auth.getSession();
      _session = data.session;
      if (_session) {
        const { data: p } = await sb.from("profiles").select("*").eq("id", _session.user.id).single();
        _profile = p;
        const { data: m } = await sb.from("members").select("project_id").eq("username", p.username).limit(1);
        _active = m && m[0] ? m[0].project_id : null;
      }
    },

    firstRun() {
      return false;
    },

    async login(u: string, p: string): Promise<LoginResult> {
      const { data, error } = await sb.auth.signInWithPassword({ email: EMAIL(u), password: p });
      if (error) return { error: "Invalid username or password." };
      const { data: prof } = await sb.from("profiles").select("*").eq("id", data.user.id).single();
      if (prof && prof.status !== "Active") {
        await sb.auth.signOut();
        return { error: "This account is deactivated." };
      }
      _profile = prof;
      _session = data.session;
      const { data: m } = await sb.from("members").select("project_id").eq("username", prof.username).limit(1);
      _active = m && m[0] ? m[0].project_id : null;
      return { user: rU(prof) };
    },

    async logout() {
      await sb.auth.signOut();
      _session = null;
      _profile = null;
    },

    sessionUser() {
      return _profile ? _profile.username : null;
    },

    activeProject() {
      return _active;
    },

    async setActive(id: string) {
      _active = id;
    },

    async fetchAll(): Promise<PortalState> {
      const [u, pr, m, t, d, r, a] = await Promise.all([
        sb.from("profiles").select("*"),
        sb.from("projects").select("*").order("created_at"),
        sb.from("members").select("*"),
        sb.from("tasks").select("*").order("due"),
        sb.from("documents").select("*").order("created_at", { ascending: false }),
        sb.from("research").select("*").order("created_at", { ascending: false }),
        sb.from("activity").select("*").order("created_at", { ascending: false }).limit(400),
      ]);
      return {
        users: (u.data || []).map(rU),
        projects: (pr.data || []).map((x: any) => ({ id: x.id, name: x.name, key: x.key, color: x.color, desc: x.descr, phases: x.phases || DEFAULT_PHASES(), repo: x.repo || undefined, techStack: x.tech_stack || undefined, repoTree: x.repo_tree || undefined, contributors: x.contributors || undefined, fileCount: x.file_count ?? undefined, defaultBranch: x.default_branch || undefined, lastSynced: x.last_synced ? Date.parse(x.last_synced) : undefined, readme: x.readme || undefined, blueprint: x.blueprint || undefined, created: Date.parse(x.created_at) })),
        members: (m.data || []).map((x: any) => ({ id: x.id, username: x.username, projectId: x.project_id, role: x.role, access: x.access || [] })),
        tasks: (t.data || []).map((x: any) => ({ id: x.id, projectId: x.project_id, title: x.title, desc: x.descr, assignee: x.assignee, due: x.due, priority: x.priority, status: x.status, phase: x.phase || "P0", source: x.source || "manual", ghNumber: x.gh_number ?? undefined, created: Date.parse(x.created_at) })),
        docs: (d.data || []).map((x: any) => ({ id: x.id, projectId: x.project_id, name: x.name, category: x.category, size: x.size, data: x.url, by: x.uploaded_by, date: Date.parse(x.created_at) })),
        research: (r.data || []).map((x: any) => ({ id: x.id, projectId: x.project_id, title: x.title, url: x.url, category: x.category, note: x.note, by: x.created_by, date: Date.parse(x.created_at) })),
        activity: (a.data || []).map((x: any) => ({ id: x.id, projectId: x.project_id, user: x.actor, action: x.action, time: Date.parse(x.created_at) })),
      };
    },

    async addActivity(action: string, projectId?: string) {
      await sb.from("activity").insert({ actor: this.sessionUser() || "system", action, project_id: projectId || _active });
    },

    async createProject(o: NewProjectInput): Promise<Project> {
      const id = o.key.toLowerCase().replace(/[^a-z0-9]/g, "") || Math.random().toString(36).slice(2, 8);
      const phases = o.phases?.length ? o.phases : DEFAULT_PHASES();
      const repo = normalizeRepo(o.repo);
      await sb.from("projects").insert({ id, name: o.name, key: o.key, color: o.color, descr: o.desc, phases, repo });
      await sb.from("members").insert({ username: this.sessionUser(), project_id: id, role: "Owner", access: ALLSEC });
      return { id, phases, repo, created: Date.now(), name: o.name, key: o.key, color: o.color, desc: o.desc };
    },

    async updateProject(id: string, patch: Partial<Project>) {
      const p: any = {};
      if (patch.name) p.name = patch.name;
      if (patch.desc) p.descr = patch.desc;
      if (patch.phases) p.phases = patch.phases;
      if (patch.repo !== undefined) p.repo = patch.repo;
      if (patch.techStack !== undefined) p.tech_stack = patch.techStack;
      if (patch.repoTree !== undefined) p.repo_tree = patch.repoTree;
      if (patch.contributors !== undefined) p.contributors = patch.contributors;
      if (patch.fileCount !== undefined) p.file_count = patch.fileCount;
      if (patch.defaultBranch !== undefined) p.default_branch = patch.defaultBranch;
      if (patch.readme !== undefined) p.readme = patch.readme;
      if (patch.blueprint !== undefined) p.blueprint = patch.blueprint;
      if (patch.lastSynced !== undefined) p.last_synced = new Date(patch.lastSynced).toISOString();
      await sb.from("projects").update(p).eq("id", id);
    },

    async deleteProject(id: string) {
      await sb.from("projects").delete().eq("id", id);
    },

    async createAccount(o: { name: string; username: string; password: string }) {
      const { error } = await sb.functions.invoke("admin-create-user", { body: { name: o.name, username: o.username, password: o.password } });
      if (error) throw error;
      return o;
    },

    async addMember(o: any) {
      await sb.from("members").insert({ username: o.username, project_id: o.projectId, role: o.role, access: o.access });
    },

    async updateMember(id: string, patch: any) {
      await sb.from("members").update(patch).eq("id", id);
    },

    async removeMember(id: string) {
      await sb.from("members").delete().eq("id", id);
    },

    async updateSelf(patch: { name?: string; password?: string }) {
      if (patch.name) await sb.from("profiles").update({ name: patch.name }).eq("id", _session.user.id);
      if (patch.password) await sb.auth.updateUser({ password: patch.password });
      if (patch.name && _profile) _profile.name = patch.name;
    },

    async createTask(o: any) {
      await sb.from("tasks").insert({ title: o.title, descr: o.desc, assignee: o.assignee, due: o.due, priority: o.priority, status: o.status || "To do", phase: o.phase || "P0", source: o.source || "manual", gh_number: o.ghNumber ?? null, project_id: _active });
    },

    async updateTask(id: string, patch: any) {
      const p: any = {};
      ["status", "priority", "due", "title", "descr", "assignee", "phase"].forEach((k) => {
        const src = k === "descr" ? patch.desc : patch[k];
        if (src != null) p[k] = src;
      });
      await sb.from("tasks").update(p).eq("id", id);
    },

    async deleteTask(id: string) {
      await sb.from("tasks").delete().eq("id", id);
    },

    async createDoc(o: any) {
      let url = o.data;
      if (o.file) {
        const path = `${_active}/${Date.now()}_${o.file.name}`;
        const up = await sb.storage.from("documents").upload(path, o.file);
        if (!up.error) url = sb.storage.from("documents").getPublicUrl(path).data.publicUrl;
      }
      await sb.from("documents").insert({ name: o.name, category: o.category, size: o.size, url, uploaded_by: this.sessionUser(), project_id: _active });
    },

    async deleteDoc(id: string) {
      await sb.from("documents").delete().eq("id", id);
    },

    async createResearch(o: any) {
      await sb.from("research").insert({ title: o.title, url: o.url, category: o.category, note: o.note, created_by: this.sessionUser(), project_id: _active });
    },

    subscribe(cb: () => void) {
      const channel = sb
        .channel("rd-portal-changes")
        .on("postgres_changes", { event: "*", schema: "public" }, () => cb())
        .subscribe();
      return () => { sb.removeChannel(channel); };
    },
  };
}
