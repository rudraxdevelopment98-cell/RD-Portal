import React, { createContext, useCallback, useContext, useEffect, useReducer } from "react";
import { ALLSEC, ROLES, SECTIONS } from "../lib/roles";
import { Store } from "../lib/store";
import type { Activity, Doc, Member, PortalState, Project, Research, Task, User } from "../lib/types";

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

  const value: PortalCtx = {
    state, me, proj, myMember, myRole, myAccess, isPlatformAdmin, isManager,
    can, myProjects, inProj, assigneeName,
    go, reload, switchProject, logout, addActivity,
    store: Store,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
