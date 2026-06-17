import type { Phase, Priority, Project } from "./types";
import { dateOffset } from "./util";

/* ---------- Auto task-plan generator ----------
   Builds a full, phase-by-phase set of starter tasks for a project.
   It reads the project's phases (Planning / Build / Test / Launch …) and
   its detected tech stack / blueprint externals, then lays out sensible
   tasks per phase with daily-staggered due dates. The plan is a *preview*
   — the manager reviews it, drops anything they don't want, creates the
   rest as unassigned "To do" tasks, and then allocates them to people. */

export interface PlanTask {
  title: string;
  desc: string;
  priority: Priority;
  phase: string; // phase.num
  /** which generated bucket produced it (for the preview UI) */
  group: string;
}

type PhaseKind = "plan" | "design" | "build" | "test" | "launch" | "ops" | "generic";

/* Classify a phase by its name so we know which tasks belong in it. */
function phaseKind(p: Phase): PhaseKind {
  const t = `${p.name} ${p.label}`.toLowerCase();
  if (/(plan|discov|research|scope|requirement|ideat)/.test(t)) return "plan";
  if (/(design|ux|ui|wireframe|prototyp)/.test(t)) return "design";
  if (/(build|dev|implement|mvp|feature|engineer|alpha)/.test(t)) return "build";
  if (/(test|qa|quality|review|beta|stabil)/.test(t)) return "test";
  if (/(launch|release|ship|deploy|go.?live|prod)/.test(t)) return "launch";
  if (/(ops|maintain|monitor|scale|support|growth|post)/.test(t)) return "ops";
  return "generic";
}

/* Base tasks for each kind of phase. */
const PHASE_TASKS: Record<PhaseKind, { title: string; desc: string; priority: Priority }[]> = {
  plan: [
    { title: "Define scope & success metrics", desc: "Lock down what's in/out for this phase and how success is measured.", priority: "High" },
    { title: "Break down requirements", desc: "Turn the goals into a concrete list of features and user stories.", priority: "High" },
    { title: "Estimate effort & timeline", desc: "Rough-size each work item and set phase milestones.", priority: "Medium" },
    { title: "Identify risks & dependencies", desc: "List blockers, external dependencies and unknowns to track.", priority: "Medium" },
  ],
  design: [
    { title: "Draft user flows", desc: "Map the key screens and how a user moves between them.", priority: "High" },
    { title: "Wireframes / mockups", desc: "Low-fidelity layouts for the main views.", priority: "High" },
    { title: "Design system & components", desc: "Colors, typography and reusable UI components.", priority: "Medium" },
    { title: "Design review & sign-off", desc: "Walk the team through designs and collect feedback.", priority: "Medium" },
  ],
  build: [
    { title: "Set up project scaffolding", desc: "Repo, CI, environments and base app structure.", priority: "High" },
    { title: "Implement core data models", desc: "Build the primary entities and their relationships.", priority: "High" },
    { title: "Build main feature flows", desc: "Implement the primary user-facing features for this phase.", priority: "High" },
    { title: "Wire up navigation & state", desc: "Routing, global state and screen transitions.", priority: "Medium" },
    { title: "Error handling & edge cases", desc: "Loading, empty and failure states across the app.", priority: "Medium" },
  ],
  test: [
    { title: "Write unit & integration tests", desc: "Cover core logic and critical paths.", priority: "High" },
    { title: "Manual QA pass", desc: "Run through every flow on real devices/browsers.", priority: "High" },
    { title: "Fix priority bugs", desc: "Triage and resolve blockers found in QA.", priority: "High" },
    { title: "Accessibility & performance check", desc: "Audit a11y, load times and responsiveness.", priority: "Medium" },
  ],
  launch: [
    { title: "Production deploy checklist", desc: "Env vars, secrets, domains and build pipeline verified.", priority: "Critical" },
    { title: "Set up monitoring & alerts", desc: "Error tracking, uptime and key metric dashboards.", priority: "High" },
    { title: "Prepare release notes & docs", desc: "Changelog, user docs and support material.", priority: "Medium" },
    { title: "Go-live & smoke test", desc: "Ship to production and verify critical flows live.", priority: "Critical" },
  ],
  ops: [
    { title: "Triage incoming feedback", desc: "Collect user feedback and bug reports into the backlog.", priority: "Medium" },
    { title: "Monitor metrics & errors", desc: "Watch dashboards and act on regressions.", priority: "Medium" },
    { title: "Plan next iteration", desc: "Prioritize the next batch of improvements.", priority: "Low" },
  ],
  generic: [
    { title: "Plan this phase", desc: "Outline the goals and work items for the phase.", priority: "High" },
    { title: "Execute phase work", desc: "Do the main work for this phase.", priority: "High" },
    { title: "Review & wrap up", desc: "Verify the phase goals are met before moving on.", priority: "Medium" },
  ],
};

/* Tech-stack-specific tasks, slotted into the most relevant phase kind. */
function stackTasks(proj: Project): { kind: PhaseKind; title: string; desc: string; priority: Priority }[] {
  const stack = (proj.techStack || []).map((s) => s.toLowerCase());
  const bp = proj.blueprint;
  const externals = (bp?.externals || []).map((e) => e.id);
  const has = (x: string) => stack.some((s) => s.includes(x));
  const out: { kind: PhaseKind; title: string; desc: string; priority: Priority }[] = [];

  if (has("supabase") || externals.includes("supabase-auth")) {
    out.push({ kind: "build", title: "Design Supabase schema & migrations", desc: "Tables, relations and SQL migrations.", priority: "High" });
    out.push({ kind: "build", title: "Configure Auth & RLS policies", desc: "OAuth providers and row-level security per table.", priority: "High" });
  }
  if (externals.includes("supabase-storage")) out.push({ kind: "build", title: "Set up Storage buckets", desc: "Buckets, upload flow and access policies.", priority: "Medium" });
  if (externals.includes("revenuecat") || has("revenuecat")) out.push({ kind: "build", title: "Integrate in-app purchases (RevenueCat)", desc: "Entitlements, offerings and paywall.", priority: "High" });
  if (externals.includes("stripe") || has("stripe")) out.push({ kind: "build", title: "Integrate Stripe payments", desc: "PaymentIntents and webhook handling.", priority: "High" });
  if (externals.includes("openai") || externals.includes("anthropic")) out.push({ kind: "build", title: "Integrate LLM API", desc: "Prompt handling and streamed responses.", priority: "High" });
  if (externals.includes("hibp")) out.push({ kind: "build", title: "Wire up breach check (HIBP k-anonymity)", desc: "SHA-1 prefix lookup against Pwned Passwords.", priority: "Medium" });
  if (externals.includes("push") || has("expo")) out.push({ kind: "build", title: "Set up push notifications", desc: "Push tokens and APNs/FCM delivery.", priority: "Medium" });
  if (externals.includes("sentry")) out.push({ kind: "launch", title: "Wire up Sentry error tracking", desc: "Capture exceptions with stack traces.", priority: "Medium" });
  if (has("expo") || has("react native")) out.push({ kind: "launch", title: "Submit to App Store & Play Store", desc: "Store listings, screenshots and review.", priority: "High" });
  if ((bp?.ops || []).some((o) => o.id === "actions") || has("github")) out.push({ kind: "build", title: "Set up CI/CD pipeline", desc: "Automated build, test and deploy on push.", priority: "Medium" });

  return out;
}

/* Build the full plan, phase by phase. Due dates are staggered one per
   day in plan order and resolved later via dueFor(index). */
export function generatePlan(proj: Project): PlanTask[] {
  const phases = proj.phases?.length ? proj.phases : [{ num: "P0", label: "Phase 1", name: "", status: "" } as Phase];
  const stack = stackTasks(proj);
  const plan: PlanTask[] = [];

  for (const ph of phases) {
    const kind = phaseKind(ph);
    const base = PHASE_TASKS[kind];
    const extra = stack.filter((t) => t.kind === kind);
    const groupName = ph.name ? `${ph.label} · ${ph.name}` : ph.label;

    for (const t of [...base, ...extra])
      plan.push({ title: t.title, desc: t.desc, priority: t.priority, phase: ph.num, group: groupName });
  }

  return plan;
}

/* Convenience: the staggered (one-per-day) due date for the i-th task. */
export function dueFor(index: number): string {
  return dateOffset(index + 1);
}
