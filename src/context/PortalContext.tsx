import React, { createContext, useCallback, useContext, useEffect, useReducer, useRef, useState } from "react";
import { ALLSEC, ROLES, SECTIONS } from "../lib/roles";
import { Store } from "../lib/store";
import { analyzeRepo } from "../lib/github";
import { resyncProject } from "../lib/sync";
import type { Activity, Doc, Member, PortalState, Project, Research, Task, User } from "../lib/types";

const STALE_MS = 60 * 60 * 1000; // auto-resync repos older than 1 hour

/* ---- state shape ---- */
interface PS extends PortalState {
  sessionUser: string | null;
  activeProject: string | null;
  loading: boolean;
  route: string;
}

const INIT: PS = {
  users: [], projects: [], members: [], tasks: [], docs: [], research: [], activity: [],
  sessionUser: null, activeProject: null, loading: true, route: "portfolio",
};

type Action =
  | { type: "SET_LOADING"; v: boolean }
  | { type: "SET_DATA"; data: PortalState }
  | { type: "SET_SESSION"; user: string | null }
  | { type: "SET_ACTIVE"; id: string | null }
  | { type: "SET_ROUTE"; route: string };

function reducer(s: PS, a: Action): PS {
  switch (a.type) {
    case "SET_LOADING": return { ...s, loading: a.v };
    case "SET_DATA": return { ...s, ...a.data, loading: false };
    case "SET_SESSION": return { ...s, sessionUser: a.user };
    case "SET_ACTIVE": return { ...s, activeProject: a.id };
    case "SET_ROUTE": return { ...s, route: a.route };
    default: return s;
  }
}

/* ---- context value ---- */
interface PortalCtx {
  state: PS;
  me: User | null;
  proj: Project | null;
  myMember: Member | null;
  myRole: string | null;
  myAccess: string[];
  isPlatformAdmin: boolean;
  isManager: boolean;
  can: (sec: string) => boolean;
  myProjects: Project[];
  inProj: <T extends { projectId: string }>(arr: T[]) => T[];
  assigneeName: (username: string) => string;

  syncing: boolean;

  go: (route: string) => void;
  reload: () => Promise<void>;
  switchProject: (id: string) => Promise<void>;
  logout: () => Promise<void>;
  addActivity: (action: string, projectId?: string) => Promise<void>;

  store: typeof Store;
}

const Ctx = createContext<PortalCtx>(null!);
export const usePortal = () => useContext(Ctx);

export function PortalProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, INIT);
  const [syncing, setSyncing] = useState(false);
  const syncedRef = useRef<Set<string>>(new Set()); // repos already auto-synced this session

  const me = state.users.find((u) => u.username === state.sessionUser) ?? null;
  const proj = state.projects.find((p) => p.id === state.activeProject) ?? null;
  const myMember = state.members.find((m) => m.username === state.sessionUser && m.projectId === state.activeProject) ?? null;
  const myRole = myMember?.role ?? null;
  const myAccess = myMember?.access ?? [];
  const isPlatformAdmin = !!(me?.platformAdmin);
  const isManager = ["Owner", "Admin", "Manager"].includes(myRole ?? "");

  const can = useCallback((sec: string) => {
    if (sec === "profile" || sec === "mywork" || sec === "portfolio") return !!state.sessionUser;
    if (sec === "projects") return isPlatformAdmin;
    return myAccess.includes(sec);
  }, [myAccess, isPlatformAdmin, state.sessionUser]);

  const myProjects = (() => {
    const ids = new Set(state.members.filter((m) => m.username === state.sessionUser).map((m) => m.projectId));
    return isPlatformAdmin ? state.projects : state.projects.filter((p) => ids.has(p.id));
  })();

  const inProj = <T extends { projectId: string }>(arr: T[]) =>
    arr.filter((x) => x.projectId === state.activeProject);

  const assigneeName = (username: string) =>
    state.users.find((u) => u.username === username)?.name ?? username;

  const reload = useCallback(async () => {
    const data = await Store.fetchAll();
    dispatch({ type: "SET_DATA", data });
    dispatch({ type: "SET_SESSION", user: Store.sessionUser() });
    dispatch({ type: "SET_ACTIVE", id: Store.activeProject() });
  }, []);

  const go = useCallback((route: string) => {
    dispatch({ type: "SET_ROUTE", route });
  }, []);

  const switchProject = useCallback(async (id: string) => {
    await Store.setActive(id);
    dispatch({ type: "SET_ACTIVE", id });
    const data = await Store.fetchAll();
    dispatch({ type: "SET_DATA", data });
    const validRoute = SECTIONS.find((s) => s.id === state.route);
    if (validRoute && !validRoute.global) {
      // stay on same view — access check happens in Shell
    }
  }, [state.route]);

  const logout = useCallback(async () => {
    await Store.addActivity("Signed out");
    await Store.logout();
    dispatch({ type: "SET_SESSION", user: null });
  }, []);

  const addActivity = useCallback(async (action: string, projectId?: string) => {
    await Store.addActivity(action, projectId);
  }, []);

  /* boot */
  useEffect(() => {
    (async () => {
      await Store.init();
      const user = Store.sessionUser();
      if (user) {
        const data = await Store.fetchAll();
        dispatch({ type: "SET_DATA", data });
        dispatch({ type: "SET_SESSION", user });
        dispatch({ type: "SET_ACTIVE", id: Store.activeProject() });
      } else {
        dispatch({ type: "SET_LOADING", v: false });
      }
    })();
  }, []);

  /* realtime: reload (debounced) whenever the backend reports a change */
  useEffect(() => {
    if (!state.sessionUser || !Store.subscribe) return;
    let t: ReturnType<typeof setTimeout>;
    const unsub = Store.subscribe(() => {
      clearTimeout(t);
      t = setTimeout(() => { reload(); }, 700);
    });
    return () => { clearTimeout(t); unsub(); };
  }, [state.sessionUser, reload]);

  /* auto-resync: when the active project's GitHub data is stale, refresh it
     in the background. Each repo is attempted once per session. */
  useEffect(() => {
    if (!state.sessionUser) return;
    const p = state.projects.find((x) => x.id === state.activeProject);
    if (!p?.repo || syncedRef.current.has(p.id)) return;
    const stale = !p.lastSynced || Date.now() - p.lastSynced > STALE_MS;
    if (!stale) return;
    syncedRef.current.add(p.id);
    const tasksSnapshot = state.tasks;
    (async () => {
      setSyncing(true);
      try {
        const analysis = await analyzeRepo(p.repo!);
        await resyncProject(p, analysis, tasksSnapshot);
        await reload();
      } catch {
        /* rate-limited / private without token / offline — stay silent */
      } finally {
        setSyncing(false);
      }
    })();
  }, [state.activeProject, state.projects, state.sessionUser, reload]);

  const value: PortalCtx = {
    state, me, proj, myMember, myRole, myAccess, isPlatformAdmin, isManager,
    can, myProjects, inProj, assigneeName,
    syncing,
    go, reload, switchProject, logout, addActivity,
    store: Store,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
