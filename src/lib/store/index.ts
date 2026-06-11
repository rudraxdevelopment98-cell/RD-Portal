import type { Store } from "../types";
import { LocalStore } from "./local";
import { makeSupabaseStore } from "./supabase";

/* Config is injected at runtime via window.RD_CONFIG (public/config.js),
   or at build time via Vite env vars. Either is optional — without keys
   the portal runs fully on localStorage. */
declare global {
  interface Window {
    RD_CONFIG?: { SUPABASE_URL?: string; SUPABASE_ANON_KEY?: string };
    supabase?: unknown;
  }
}

function resolveConfig() {
  const w = (typeof window !== "undefined" && window.RD_CONFIG) || {};
  const env = import.meta.env;
  return {
    url: w.SUPABASE_URL || (env.VITE_SUPABASE_URL as string | undefined),
    key: w.SUPABASE_ANON_KEY || (env.VITE_SUPABASE_ANON_KEY as string | undefined),
  };
}

let store: Store;
const cfg = resolveConfig();
if (cfg.url && cfg.key) {
  try {
    store = makeSupabaseStore(cfg.url, cfg.key);
  } catch (e) {
    console.error("Supabase init failed, falling back to local:", e);
    store = LocalStore;
  }
} else {
  store = LocalStore;
}

export const Store = store;
