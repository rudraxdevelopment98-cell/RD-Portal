/* ============================================================
   Onboard / sync a project from a GitHub repo analysis.
   Uses the Store's public primitives so it works for both
   the local and Supabase backends.
   ============================================================ */
import type { RepoAnalysis } from "./github";
import { PCOLORS } from "./roles";
import { Store } from "./store";
import type { Phase, Project, Task } from "./types";

const TONE = ["#FF7A66", "#E8C56A", "#7FD1A8", "#22d3ee", "#a855f7", "#60a5fa", "#f472b6"];

function keyFromName(name: string): string {
  const letters = name.replace(/[^a-zA-Z]/g, "");
  return (letters.slice(0, 3) || "PRJ").toUpperCase();
}

function pickColor(seed: string): string {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) % TONE.length;
  return TONE[h];
}

function issueToTask(t: RepoAnalysis["tasks"][0]): Partial<Task> {
  const labels = t.labels.map((l) => l.toLowerCase());
  const priority = labels.some((l) => /crit|urgent|p0/.test(l)) ? "Critical"
    : labels.some((l) => /high|p1|bug/.test(l)) ? "High"
    : labels.some((l) => /low|p3/.test(l)) ? "Low"
    : "Medium";
  return {
    title: t.title,
    desc: t.body.split("\n")[0].slice(0, 160),
    status: t.state === "closed" ? "Done" : "To do",
    priority: priority as any,
    phase: "P0",
    source: "github",
    ghNumber: t.ghNumber,
    assignee: "",
  };
}

/* Create a brand-new project from an analysis. Returns the project. */
export async function onboardFromGitHub(analysis: RepoAnalysis, overrides?: { name?: string; key?: string; color?: string }): Promise<Project> {
  const name = overrides?.name?.trim() || analysis.name;
  const key = overrides?.key?.trim().toUpperCase() || keyFromName(name);
  const color = overrides?.color || pickColor(name);
  const phases: Phase[] = analysis.phases.length ? analysis.phases : [
    { num: "1", label: "Phase 1", name: "Build", status: "active" },
    { num: "2", label: "Phase 2", name: "Test", status: "" },
    { num: "3", label: "Phase 3", name: "Launch", status: "" },
  ];

  const project = await Store.createProject({
    name,
    key,
    color,
    desc: analysis.description || `${analysis.language ?? ""} project`.trim(),
    repo: analysis.repo,
    phases,
  } as any);

  // persist analysed metadata onto the project
  await Store.updateProject(project.id, {
    techStack: analysis.techStack,
    repoTree: analysis.tree,
    contributors: analysis.contributors,
    fileCount: analysis.fileCount,
    defaultBranch: analysis.defaultBranch,
    readme: analysis.readme ?? undefined,
    blueprint: analysis.blueprint,
    lastSynced: Date.now(),
  });

  // becomes active on create — import issues as tasks
  await Store.setActive(project.id);
  for (const t of analysis.tasks) {
    await Store.createTask(issueToTask(t));
  }
  await Store.addActivity(`Imported ${analysis.tasks.length} issue(s) and ${phases.length} phase(s) from GitHub`, project.id);
  return project;
}

/* Re-sync an existing repo-linked project: refresh phases, structure,
   and upsert GitHub-sourced tasks without touching manual ones. */
export async function resyncProject(project: Project, analysis: RepoAnalysis, existingTasks: Task[]): Promise<{ added: number; updated: number }> {
  await Store.setActive(project.id);

  await Store.updateProject(project.id, {
    techStack: analysis.techStack,
    repoTree: analysis.tree,
    contributors: analysis.contributors,
    fileCount: analysis.fileCount,
    defaultBranch: analysis.defaultBranch,
    readme: analysis.readme ?? undefined,
    blueprint: analysis.blueprint,
    lastSynced: Date.now(),
    ...(analysis.phases.length ? { phases: analysis.phases } : {}),
  });

  const byNumber = new Map<number, Task>();
  existingTasks
    .filter((t) => t.projectId === project.id && t.source === "github" && t.ghNumber != null)
    .forEach((t) => byNumber.set(t.ghNumber!, t));

  let added = 0, updated = 0;
  for (const t of analysis.tasks) {
    const existing = byNumber.get(t.ghNumber);
    const want = issueToTask(t);
    if (existing) {
      if (existing.status !== want.status) { await Store.updateTask(existing.id, { status: want.status }); updated++; }
    } else {
      await Store.createTask(want);
      added++;
    }
  }
  await Store.addActivity(`Synced from GitHub — ${added} new, ${updated} updated`, project.id);
  return { added, updated };
}

export { PCOLORS };
