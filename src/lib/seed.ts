import { ALLSEC } from "./roles";
import type { PortalState } from "./types";
import { dateOffset, uid } from "./util";

/** First-run dataset: the two real projects, their phases, tasks and research. */
export function buildSeed(): PortalState & { firstRun: boolean; session: null; active: string } {
  const now = Date.now();

  const taskRows: [string, string, number, string, string, string][] = [
    // Shiva — MCP / agent-tool security
    ["Day 1 · Install the MCP SDK", "pip install + Claude Desktop as the client", 1, "High", "shiva", "P0"],
    ["Day 2 · Run benign_server.py", "mcp dev — learn the tool call flow", 2, "High", "shiva", "P0"],
    ["Day 3 · Reproduce tool poisoning (attack #1)", "The key demo — screen-record it", 3, "Critical", "shiva", "P0"],
    ["Day 4 · Write up attack #1 + push", "docs/attacks/01-tool-poisoning.md", 4, "High", "shiva", "P0"],
    ["Day 5 · Run attacks #2 & #3", "drift + escalation; log in evidence.md", 5, "Medium", "shiva", "P0"],
    ["Day 6 · Sketch the scanner's 3 checks", "hidden instructions · perms · hashing", 6, "Medium", "shiva", "P0"],
    ["Day 7 · Decision gate 0", "In for Phase 1? Log in improvements.md", 7, "Medium", "shiva", "P0"],
    // Breachly — email breach checker (Expo / React Native)
    ["Wire up real HIBP API key", "Replace mock mode with live HIBP v3 API via Supabase Edge Function", 1, "High", "breachly", "P0"],
    ["Polish breach result cards", "Show breach logo, year, data classes leaked", 2, "Medium", "breachly", "P0"],
    ["Add email validation", "Client + Edge Function; reject invalid / disposable addresses", 2, "Medium", "breachly", "P0"],
    ["Phase 2 · User authentication", "Supabase Auth — magic-link or OTP, persisted sessions", 5, "High", "breachly", "P1"],
    ["Phase 2 · RevenueCat paywall", "Paywall for monitoring; free tier = 1 check", 7, "High", "breachly", "P1"],
    ["Phase 2 · Monitoring backend", "Supabase cron + HIBP polling; push on new breach", 10, "High", "breachly", "P1"],
    ["Phase 2 · Password exposure check", "HIBP Pwned Passwords k-anonymity, local hash prefix only", 12, "Medium", "breachly", "P1"],
    ["App Store submission prep", "Screenshots, privacy policy, App Privacy labels, TestFlight", 14, "High", "breachly", "P2"],
  ];

  return {
    firstRun: true,
    session: null,
    active: "shiva",
    users: [
      { id: uid(), name: "Kuldeep", username: "kuldeep", password: "Shiva@2026", status: "Active", platformAdmin: true, created: now },
    ],
    projects: [
      {
        id: "shiva",
        name: "Shiva",
        key: "SHV",
        color: "#FF7A66",
        desc: "MCP / agent-tool security",
        repo: "rudraxdevelopment98-cell/shiva",
        created: now,
        phases: [
          { num: "1", label: "Phase 0", name: "Learn + Break", status: "active" },
          { num: "2", label: "Phase 1", name: "OSS Scanner", status: "" },
          { num: "3", label: "Phase 2", name: "Runtime Gateway", status: "" },
          { num: "4", label: "Phase 3", name: "Hosted Layer", status: "" },
        ],
      },
      {
        id: "breachly",
        name: "Breachly",
        key: "BRY",
        color: "#7FD1A8",
        desc: "Mobile app — email breach checker + monitoring (Expo / React Native)",
        repo: "rudraxdevelopment98-cell/Breachly",
        created: now,
        phases: [
          { num: "1", label: "Phase 1", name: "MVP", status: "active" },
          { num: "2", label: "Phase 2", name: "Auth + Paywall", status: "" },
          { num: "3", label: "Phase 3", name: "Monitoring", status: "" },
          { num: "4", label: "Phase 4", name: "Launch", status: "" },
        ],
      },
    ],
    members: [
      { id: uid(), username: "kuldeep", projectId: "shiva", role: "Owner", access: ALLSEC.slice(), created: now },
      { id: uid(), username: "kuldeep", projectId: "breachly", role: "Owner", access: ALLSEC.slice(), created: now },
    ],
    invites: [],
    tasks: taskRows.map((t) => ({
      id: uid(),
      projectId: t[4],
      title: t[0],
      desc: t[1],
      assignee: "kuldeep",
      due: dateOffset(t[2]),
      priority: t[3] as any,
      status: "To do" as const,
      phase: t[5],
      created: now,
    })),
    docs: [],
    research: [
      { id: uid(), projectId: "shiva", title: "Simon Willison — MCP prompt injection", url: "https://simonwillison.net/tags/model-context-protocol/", category: "Reference", note: "Core read on why MCP has injection problems.", by: "kuldeep", date: now },
      { id: uid(), projectId: "breachly", title: "Have I Been Pwned API v3", url: "https://haveibeenpwned.com/API/v3", category: "Reference", note: "Auth via API key header. Rate limit 1 req / 1.5s on free tier.", by: "kuldeep", date: now },
      { id: uid(), projectId: "breachly", title: "HIBP k-anonymity (Pwned Passwords)", url: "https://www.troyhunt.com/ive-just-launched-pwned-passwords-version-2/", category: "Reference", note: "Send first 5 chars of SHA-1; server returns suffixes. Never sends full password.", by: "kuldeep", date: now },
      { id: uid(), projectId: "breachly", title: "RevenueCat Expo / RN SDK", url: "https://www.revenuecat.com/docs/getting-started/installation/reactnative", category: "Reference", note: "react-native-purchases. Needs Dev Client — not Expo Go.", by: "kuldeep", date: now },
    ],
    activity: [
      { id: uid(), projectId: "shiva", user: "system", action: "Project created", time: now },
      { id: uid(), projectId: "breachly", user: "system", action: "Project created", time: now },
    ],
  };
}
