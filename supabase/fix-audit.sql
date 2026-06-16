-- ============================================================
-- RD Portal — audit fixes
-- Run once in Supabase: SQL Editor → New query → paste → Run.
-- Safe to run multiple times.
-- ============================================================

-- 1) Allow a freshly signed-up user to create their OWN profile row.
--    This is what makes "Add member → new person" work from the browser
--    without any Edge Function or service key.
drop policy if exists p_ins on profiles;
create policy p_ins on profiles
  for insert to authenticated
  with check (id = auth.uid());

-- 2) Helpful indexes for per-project queries (faster as data grows).
create index if not exists idx_tasks_project    on tasks(project_id);
create index if not exists idx_documents_project on documents(project_id);
create index if not exists idx_research_project  on research(project_id);
create index if not exists idx_activity_project  on activity(project_id);
create index if not exists idx_members_username  on members(username);

-- ============================================================
-- Done. "Add member" will now work after the site redeploys.
-- ============================================================
