import type { ComponentType } from "react";
import Portfolio from "./Portfolio";
import MyWork from "./MyWork";
import Dashboard from "./Dashboard";
import Roadmap from "./Roadmap";
import Tasks from "./Tasks";
import Documents from "./Documents";
import Research from "./Research";
import Activity from "./Activity";
import Members from "./Members";
import AllProjects from "./AllProjects";
import Profile from "./Profile";

const VIEW_MAP: Record<string, ComponentType> = {
  portfolio: Portfolio,
  mywork: MyWork,
  dashboard: Dashboard,
  roadmap: Roadmap,
  tasks: Tasks,
  documents: Documents,
  research: Research,
  activity: Activity,
  members: Members,
  projects: AllProjects,
  profile: Profile,
};

export default function viewFor(route: string): ComponentType {
  return VIEW_MAP[route] ?? Dashboard;
}
