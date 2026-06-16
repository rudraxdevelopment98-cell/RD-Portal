import { useState } from "react";
import { usePortal } from "../context/PortalContext";
import { SECTIONS } from "../lib/roles";
import Avatar from "./Avatar";
import TokenSettings from "./TokenSettings";
import { hasToken } from "../lib/github";
import viewFor from "../views";

/* Mobile bottom-nav items — the 5 most important */
const MOB_NAV = ["portfolio", "mywork", "tasks", "dashboard", "profile"];

export default function Shell() {
  const { state, me, proj, myRole, myProjects, isPlatformAdmin, can, go, switchProject, logout } = usePortal();
  const [tokenOpen, setTokenOpen] = useState(false);
  if (!me) return null;

  const route = state.route;

  const myOpenTasks = state.tasks.filter(
    (t) => t.assignee === me.username && t.status !== "Done"
  ).length;

  const nav = SECTIONS.filter((s) => can(s.id) && s.id !== "profile");
  const global = nav.filter((s) => s.global || s.id === "projects");
  const workspace = nav.filter((s) => !s.global && !["members", "projects"].includes(s.id));
  const manage = nav.filter((s) => s.id === "members");

  const NavItem = ({ s }: { s: typeof SECTIONS[0] }) => {
    const count = s.id === "tasks" || s.id === "mywork" ? myOpenTasks : 0;
    return (
      <a
        className={`nav ${s.id === route ? "active" : ""}`}
        onClick={() => go(s.id)}
      >
        <span className="ic">{s.ic}</span>
        {s.label}
        {count > 0 && <span className="count">{count}</span>}
      </a>
    );
  };

  const View = viewFor(route);

  return (
    <div className="shell">
      <aside className="side">
        <div className="brand">
          <div className="logo">R</div>
          <div>
            <b>RD Portal</b>
            <small>Project workspace</small>
          </div>
        </div>

        {myProjects.length > 0 && (
          <div className="projbar">
            <select
              value={state.activeProject ?? ""}
              onChange={(e) => switchProject(e.target.value)}
            >
              {myProjects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        )}

        <nav>
          {global.length > 0 && (
            <>
              <div className="navlbl">Overview</div>
              {global.map((s) => <NavItem key={s.id} s={s} />)}
            </>
          )}

          {workspace.length > 0 && (
            <>
              <div className="navlbl">Workspace</div>
              {workspace.map((s) => <NavItem key={s.id} s={s} />)}
            </>
          )}

          {manage.length > 0 && (
            <>
              <div className="navlbl">Manage</div>
              {manage.map((s) => <NavItem key={s.id} s={s} />)}
            </>
          )}

          <div className="navlbl">Account</div>
          <a className={`nav ${route === "profile" ? "active" : ""}`} onClick={() => go("profile")}>
            <span className="ic">◍</span>My Profile
          </a>
          {isPlatformAdmin && (
            <a className={`nav ${route === "projects" ? "active" : ""}`} onClick={() => go("projects")}>
              <span className="ic">⊞</span>All Projects
            </a>
          )}
        </nav>

        <div className="me">
          <Avatar name={me.name} size={34} radius="50%" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="nm">{me.name}</div>
            <div className="rl">{myRole ?? (isPlatformAdmin ? "Platform admin" : "—")}</div>
          </div>
          <button
            className="btn ghost sm"
            title="Sign out"
            onClick={logout}
            style={{ color: "var(--faint)", padding: "6px 8px" }}
          >⎋</button>
        </div>
      </aside>

      <main className="main">
        <div className="topbar">
          <div className="crumb">
            <span>{proj?.name ?? "Portal"}</span>
            {" / "}
            <b>{SECTIONS.find((s) => s.id === route)?.label ?? "Dashboard"}</b>
          </div>
          <div className="search">
            <input placeholder="Search…" />
          </div>
          <div
            className="iBtn"
            title={hasToken() ? "GitHub token connected" : "Connect GitHub token"}
            onClick={() => setTokenOpen(true)}
            style={hasToken() ? { color: "var(--sage)", borderColor: "rgba(127,209,168,.4)" } : undefined}
          >⎇</div>
        </div>

        <div className="content">
          <View />
        </div>
      </main>

      {/* Mobile bottom nav */}
      <nav className="bottom-nav">
        {MOB_NAV.filter((id) => can(id)).map((id) => {
          const s = SECTIONS.find((x) => x.id === id);
          if (!s) return null;
          const count = (id === "tasks" || id === "mywork") ? myOpenTasks : 0;
          return (
            <div
              key={id}
              className={`bn-item ${id === route ? "active" : ""}`}
              onClick={() => go(id)}
            >
              {count > 0 && <span className="bn-count">{count}</span>}
              <span className="bn-ic">{s.ic}</span>
              <span>{s.label}</span>
            </div>
          );
        })}
      </nav>

      {tokenOpen && <TokenSettings onClose={() => setTokenOpen(false)} />}
    </div>
  );
}
