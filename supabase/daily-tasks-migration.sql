-- ============================================================
-- RD Portal — repeating daily tasks
-- Run in Supabase: SQL Editor → New query → paste → Run.
-- Safe to run multiple times.
-- ============================================================

-- A task with repeat = 'daily' is a template; the portal spawns a fresh
-- copy of it each day (with repeat = null) so it can be checked off.
alter table tasks add column if not exists repeat text;
