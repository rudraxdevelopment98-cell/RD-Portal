/* ============================================================
   Voice intent engine — local pattern matcher with per-user
   learning. No external LLM call: free, offline, private.

   How "learning" works:
   · Each intent has a few seed patterns ("what's overdue", "show overdue").
   · When you say something that doesn't match a seed pattern but scores
     well against an intent's keywords, we run that intent AND remember
     your exact phrase → intent mapping (stored per-user in localStorage).
   · Next time you say that exact phrase, it's an instant direct hit —
     the assistant has "learned" your personal wording.
   ============================================================ */
import type { PortalState, Project, Task, User } from "../types";
import { Store } from "../store";
import { today, dateOffset } from "../util";
import { SECTIONS } from "../roles";

export interface VoiceCtx {
  state: PortalState & { sessionUser: string | null; activeProject: string | null };
  me: User | null;
  proj: Project | null;
  isManager: boolean;
  go: (route: string) => void;
  switchProject: (id: string) => Promise<void>;
  reload: () => Promise<void>;
}

export interface VoiceResult {
  say: string;       // spoken + shown response
  ok: boolean;        // false = "didn't understand" style result
}

interface Intent {
  id: string;
  keywords: string[];                  // for fuzzy scoring
  patterns: RegExp[];                   // seed phrasings, checked first
  run: (ctx: VoiceCtx, text: string, m: RegExpMatchArray | null) => Promise<VoiceResult> | VoiceResult;
}

/* ---------- personal learning store ---------- */
function learnKey(username: string | null) { return `rd_voice_learn_${username || "anon"}`; }

function loadLearned(username: string | null): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(learnKey(username)) || "{}"); } catch { return {}; }
}
function learn(username: string | null, phrase: string, intentId: string) {
  try {
    const m = loadLearned(username);
    m[phrase] = intentId;
    localStorage.setItem(learnKey(username), JSON.stringify(m));
  } catch { /* ignore */ }
}

/* usage stats — purely informational, lets the assistant say "you usually ask this" */
function bumpUsage(username: string | null, intentId: string) {
  try {
    const key = `rd_voice_usage_${username || "anon"}`;
    const m: Record<string, number> = JSON.parse(localStorage.getItem(key) || "{}");
    m[intentId] = (m[intentId] || 0) + 1;
    localStorage.setItem(key, JSON.stringify(m));
  } catch { /* ignore */ }
}

export function topCommands(username: string | null, n = 5): string[] {
  try {
    const m: Record<string, number> = JSON.parse(localStorage.getItem(`rd_voice_usage_${username || "anon"}`) || "{}");
    return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, n).map(([id]) => id);
  } catch { return []; }
}

/* ---------- helpers ---------- */
function myTasks(ctx: VoiceCtx): Task[] {
  const all = ctx.proj ? ctx.state.tasks.filter((t) => t.projectId === ctx.proj!.id) : ctx.state.tasks;
  return all;
}
function overdue(tasks: Task[]): Task[] {
  const td = today();
  return tasks.filter((t) => t.due && t.due < td && t.status !== "Done");
}
function dueToday(tasks: Task[]): Task[] {
  const td = today();
  return tasks.filter((t) => t.due === td && t.status !== "Done");
}
function finishedToday(tasks: Task[]): Task[] {
  // best-effort: Done tasks with due == today (we don't track completedAt)
  return tasks.filter((t) => t.status === "Done");
}
function parseDue(text: string): string | null {
  const t = text.toLowerCase();
  if (/\btoday\b/.test(t)) return today();
  if (/\btomorrow\b/.test(t)) return dateOffset(1);
  const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  for (let i = 0; i < days.length; i++) {
    if (t.includes(days[i])) {
      const now = new Date();
      let diff = (i - now.getDay() + 7) % 7;
      if (diff === 0) diff = 7;
      return dateOffset(diff);
    }
  }
  const iso = t.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (iso) return iso[1];
  return null;
}
function parsePriority(text: string): "Critical" | "High" | "Medium" | "Low" | null {
  const t = text.toLowerCase();
  if (/\bcritical\b/.test(t)) return "Critical";
  if (/\bhigh\b/.test(t)) return "High";
  if (/\b(medium|normal)\b/.test(t)) return "Medium";
  if (/\blow\b/.test(t)) return "Low";
  return null;
}
function fuzzyFindTask(tasks: Task[], titleGuess: string): Task | null {
  const g = titleGuess.toLowerCase().trim();
  if (!g) return null;
  let best: Task | null = null, bestScore = 0;
  for (const t of tasks) {
    const lt = t.title.toLowerCase();
    let score = 0;
    if (lt === g) score = 100;
    else if (lt.includes(g) || g.includes(lt)) score = 60;
    else {
      const gw = new Set(g.split(/\s+/));
      const tw = lt.split(/\s+/);
      score = tw.filter((w) => gw.has(w)).length * 10;
    }
    if (score > bestScore) { bestScore = score; best = t; }
  }
  return bestScore >= 10 ? best : null;
}

/* ---------- intent catalog ---------- */
const INTENTS: Intent[] = [
  {
    id: "help",
    keywords: ["help", "what can you do", "commands", "options"],
    patterns: [/^(help|what can you do|what commands)/i],
    run: () => ({
      ok: true,
      say: "You can say things like: open tasks. what's overdue. what's due today. summarize my work. create a task to fix the login bug, high priority, due tomorrow. mark the login bug as done. daily briefing. switch to project name.",
    }),
  },
  {
    id: "navigate",
    keywords: ["open", "go to", "show", "navigate"],
    patterns: [/^(open|go to|show|navigate to)\s+(.+)/i],
    run: (ctx, text) => {
      const wanted = text.toLowerCase().replace(/^(open|go to|show me|show|navigate to)\s+/i, "").trim();
      const sec = SECTIONS.find((s) => s.label.toLowerCase() === wanted)
        || SECTIONS.find((s) => s.label.toLowerCase().includes(wanted) || wanted.includes(s.label.toLowerCase()))
        || SECTIONS.find((s) => wanted.includes(s.id));
      if (!sec) return { ok: false, say: `I don't have a page called "${wanted}".` };
      ctx.go(sec.id);
      return { ok: true, say: `Opening ${sec.label}.` };
    },
  },
  {
    id: "switch-project",
    keywords: ["switch to project", "change project", "open project"],
    patterns: [/^(switch to|change to|open)\s+project\s+(.+)/i, /^switch project\s+(.+)/i],
    run: async (ctx, text) => {
      const wanted = text.toLowerCase().replace(/^(switch to|change to|open)\s+project\s+/i, "").replace(/^switch project\s+/i, "").trim();
      const p = ctx.state.projects.find((x) => x.name.toLowerCase() === wanted) ||
        ctx.state.projects.find((x) => x.name.toLowerCase().includes(wanted));
      if (!p) return { ok: false, say: `I couldn't find a project called "${wanted}".` };
      await ctx.switchProject(p.id);
      return { ok: true, say: `Switched to ${p.name}.` };
    },
  },
  {
    id: "overdue",
    keywords: ["overdue", "late", "behind"],
    patterns: [/overdue/i, /\blate\b/i, /what.?s\s+behind/i],
    run: (ctx) => {
      const list = overdue(myTasks(ctx));
      if (!list.length) return { ok: true, say: "Nothing is overdue. You're all caught up." };
      const names = list.slice(0, 5).map((t) => t.title).join(", ");
      return { ok: true, say: `You have ${list.length} overdue task${list.length === 1 ? "" : "s"}: ${names}.` };
    },
  },
  {
    id: "due-today",
    keywords: ["due today", "today"],
    patterns: [/due\s+today/i, /what.?s\s+(due|on)\s+today/i],
    run: (ctx) => {
      const list = dueToday(myTasks(ctx));
      if (!list.length) return { ok: true, say: "Nothing is due today." };
      const names = list.slice(0, 5).map((t) => t.title).join(", ");
      return { ok: true, say: `${list.length} task${list.length === 1 ? "" : "s"} due today: ${names}.` };
    },
  },
  {
    id: "finished-today",
    keywords: ["finished today", "completed today", "done today"],
    patterns: [/(finished|completed|done)\s+today/i, /what.+(finish|complete).+today/i],
    run: (ctx) => {
      const list = finishedToday(myTasks(ctx));
      return { ok: true, say: list.length ? `${list.length} task${list.length === 1 ? "" : "s"} marked done: ${list.slice(0, 5).map((t) => t.title).join(", ")}.` : "Nothing marked done yet." };
    },
  },
  {
    id: "summary",
    keywords: ["summarize", "summary", "how am i doing", "status", "briefing", "overview"],
    patterns: [/summar(y|ize)/i, /how am i doing/i, /give me (a|the) (status|overview)/i],
    run: (ctx) => {
      const tasks = myTasks(ctx);
      const od = overdue(tasks).length;
      const dt = dueToday(tasks).length;
      const inprog = tasks.filter((t) => t.status === "In progress").length;
      const done = tasks.filter((t) => t.status === "Done").length;
      const scope = ctx.proj ? `on ${ctx.proj.name}` : "across all your projects";
      return {
        ok: true,
        say: `${scope === "on" ? "" : ""}Here's where things stand ${scope}: ${tasks.length} total tasks, ${inprog} in progress, ${done} done. ${od ? `${od} overdue.` : "Nothing overdue."} ${dt ? `${dt} due today.` : ""}`,
      };
    },
  },
  {
    id: "daily-briefing",
    keywords: ["daily briefing", "check in", "good morning", "morning briefing", "catch me up"],
    patterns: [/daily briefing/i, /^check in/i, /good morning/i, /catch me up/i],
    run: (ctx) => {
      const tasks = myTasks(ctx).filter((t) => !ctx.me || t.assignee === ctx.me.username);
      const od = overdue(tasks);
      const dt = dueToday(tasks);
      const recent = ctx.state.activity.filter((a) => !ctx.proj || a.projectId === ctx.proj.id).slice(0, 3);
      const parts: string[] = [];
      parts.push(`Good to see you, ${ctx.me?.name?.split(" ")[0] || "there"}.`);
      parts.push(od.length ? `${od.length} of your tasks are overdue: ${od.slice(0, 3).map((t) => t.title).join(", ")}.` : "Nothing of yours is overdue.");
      parts.push(dt.length ? `${dt.length} due today: ${dt.slice(0, 3).map((t) => t.title).join(", ")}.` : "Nothing due today.");
      if (recent.length) parts.push(`Recent activity: ${recent.map((a) => a.action).join("; ")}.`);
      return { ok: true, say: parts.join(" ") };
    },
  },
  {
    id: "create-task",
    keywords: ["create a task", "add a task", "new task", "remind me to"],
    patterns: [
      /^(create|add|make)\s+a?\s*task\s+(to\s+)?(.+)/i,
      /^remind me to\s+(.+)/i,
    ],
    run: async (ctx, text) => {
      if (!ctx.proj) return { ok: false, say: "Open a project first, then I can add a task to it." };
      let body = text.replace(/^(create|add|make)\s+a?\s*task\s+(to\s+)?/i, "").replace(/^remind me to\s+/i, "").trim();
      const priority = parsePriority(body) || "Medium";
      const due = parseDue(body);
      // strip trailing "priority X" / "due Y" clauses from the title
      let title = body
        .replace(/,?\s*priority\s+\w+/i, "")
        .replace(/,?\s*due\s+[a-z0-9-]+(\s+[a-z]+)?/i, "")
        .replace(/,+\s*$/, "")
        .trim();
      if (!title) return { ok: false, say: "I didn't catch what the task should be — try: create a task to fix the login bug." };
      title = title.charAt(0).toUpperCase() + title.slice(1);
      await Store.createTask({ title, desc: "", assignee: ctx.me?.username || "", due: due || "", priority, phase: ctx.proj.phases?.[0]?.num || "", source: "manual" } as any);
      await Store.addActivity(`Voice-created task: ${title}`, ctx.proj.id);
      await ctx.reload();
      return { ok: true, say: `Created "${title}"${due ? `, due ${due}` : ""}, ${priority.toLowerCase()} priority.` };
    },
  },
  {
    id: "update-status",
    keywords: ["mark", "set status", "complete", "finish"],
    patterns: [
      /^mark\s+(.+?)\s+as\s+(done|complete|in progress|to ?do)/i,
      /^(complete|finish)\s+(.+)/i,
    ],
    run: async (ctx, text, m) => {
      let titleGuess = "", statusWord = "done";
      const m1 = text.match(/^mark\s+(.+?)\s+as\s+(done|complete|in progress|to ?do)/i);
      const m2 = text.match(/^(complete|finish)\s+(.+)/i);
      if (m1) { titleGuess = m1[1]; statusWord = m1[2]; }
      else if (m2) { titleGuess = m2[2]; statusWord = "done"; }
      const tasks = myTasks(ctx);
      const task = fuzzyFindTask(tasks, titleGuess);
      if (!task) return { ok: false, say: `I couldn't find a task matching "${titleGuess}".` };
      const status = /done|complete/i.test(statusWord) ? "Done" : /in ?progress/i.test(statusWord) ? "In progress" : "To do";
      await Store.updateTask(task.id, { status });
      await Store.addActivity(`Voice: marked "${task.title}" as ${status}`, task.projectId);
      await ctx.reload();
      return { ok: true, say: `Marked "${task.title}" as ${status}.` };
    },
  },
];

/* ---------- matching ---------- */
function score(text: string, intent: Intent): number {
  const t = text.toLowerCase();
  let s = 0;
  for (const k of intent.keywords) if (t.includes(k)) s += k.split(" ").length * 5;
  return s;
}

export async function handleVoiceCommand(ctx: VoiceCtx, rawText: string): Promise<VoiceResult> {
  const text = rawText.trim();
  if (!text) return { ok: false, say: "I didn't hear anything." };
  const username = ctx.state.sessionUser;
  const learned = loadLearned(username);
  const key = text.toLowerCase();

  // 1) exact learned phrase
  if (learned[key]) {
    const intent = INTENTS.find((i) => i.id === learned[key]);
    if (intent) {
      bumpUsage(username, intent.id);
      return await intent.run(ctx, text, null);
    }
  }

  // 2) seed pattern match
  for (const intent of INTENTS) {
    for (const re of intent.patterns) {
      const m = text.match(re);
      if (m) {
        bumpUsage(username, intent.id);
        learn(username, key, intent.id);
        return await intent.run(ctx, text, m);
      }
    }
  }

  // 3) fuzzy keyword fallback — "learns" your phrasing if confident enough
  let best: Intent | null = null, bestScore = 0;
  for (const intent of INTENTS) {
    const s = score(text, intent);
    if (s > bestScore) { bestScore = s; best = intent; }
  }
  if (best && bestScore >= 10) {
    bumpUsage(username, best.id);
    learn(username, key, best.id);
    return await best.run(ctx, text, null);
  }

  return { ok: false, say: "I didn't understand that. Say \"help\" to hear what I can do." };
}

export function intentCount() { return INTENTS.length; }
