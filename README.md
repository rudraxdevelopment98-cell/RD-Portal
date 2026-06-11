# RD-Portal

A multi-project management portal — projects, per-project roles & access, tasks,
documents, research, activity log, and an interactive **Project Map** canvas.
Runs as a static web app; optionally backed by Supabase for real multi-user.

## Run it

- **Locally:** open `web/index.html` in a browser (or `npx serve web`).
- **Hosted (free):** push to `main`, then enable **Settings → Pages → Source: GitHub Actions**.
  The included workflow publishes `web/` to `https://<you>.github.io/RD-Portal/`.

First-run login (local prototype): **kuldeep / Shiva@2026** — change it in Profile.

## Modes

The portal auto-detects its backend from `web/config.js`:

- **Local** (default) — data stored in the browser. Great for trying it out.
- **Cloud** — real accounts/projects via Supabase. Fill in `web/config.js`
  (`SUPABASE_URL` + anon key) and run `supabase/schema.sql`. Full guide:
  [`docs/supabase-setup.md`](docs/supabase-setup.md).

## Structure

```
web/                  the app (static)
  index.html          login + shell
  store.js            data layer (Local + Supabase backends)
  app.js              UI: dashboard, tasks, docs, research, activity, members, projects, profile
  canvas.js           interactive Project Map
  styles.css          dark/light theme
  config.js           Supabase keys (blank = local mode)
supabase/
  schema.sql          tables + row-level security (multi-project)
  functions/admin-create-user/  secure account-creation Edge Function
.github/workflows/pages.yml      auto-deploy web/ to GitHub Pages
```

## Concepts

- **Projects** — every project managed in one portal; switch via the sidebar.
- **Membership = user × project × role** — a person's role/access is per project
  (Owner / Admin / Manager / Member / Viewer), plus per-section access.
- **Platform admin** can create projects and accounts; per-project Owner/Admin
  manage that project's members.
