-- ============================================================
-- RD Portal — switch to OAuth (Google / GitHub) login
-- Run in Supabase: SQL Editor → New query → paste → Run.
-- Safe to run multiple times.
-- ============================================================

-- 1) profiles needs email + avatar to match against invites and OAuth metadata.
alter table profiles add column if not exists email text;
alter table profiles add column if not exists avatar text;
create unique index if not exists profiles_email_key on profiles(email);

-- 2) Let a freshly signed-in OAuth user create their own profile row
--    (no service role / Edge Function involved).
drop policy if exists p_ins on profiles;
create policy p_ins on profiles
  for insert to authenticated
  with check (id = auth.uid());

-- 3) Pending invites — "Add member" inserts here when the invited email
--    has no profile yet. consume_invites() below turns it into real
--    membership the moment that person signs in with a matching email.
create table if not exists invites (
  id         uuid primary key default gen_random_uuid(),
  email      text not null,
  project_id text not null references projects(id) on delete cascade,
  role       text not null default 'Member',
  access     text[] not null default '{}',
  created_at timestamptz not null default now()
);
alter table invites enable row level security;

drop policy if exists inv_sel on invites;
create policy inv_sel on invites for select to authenticated
  using (proj_admin(project_id) or is_platform_admin() or email = (auth.jwt() ->> 'email'));
drop policy if exists inv_ins on invites;
create policy inv_ins on invites for insert to authenticated
  with check (proj_admin(project_id) or is_platform_admin());
drop policy if exists inv_del on invites;
create policy inv_del on invites for delete to authenticated
  using (proj_admin(project_id) or is_platform_admin() or email = (auth.jwt() ->> 'email'));

-- 4) Turns any invite matching the signed-in user's email into a real
--    membership row. security definer so it can write to members/invites
--    regardless of the caller's own row-level permissions.
create or replace function consume_invites() returns void
language plpgsql security definer as $$
declare r record; uname text;
begin
  select username into uname from profiles where id = auth.uid();
  if uname is null then return; end if;
  for r in select * from invites where email = (auth.jwt() ->> 'email') loop
    insert into members (username, project_id, role, access)
    values (uname, r.project_id, r.role, r.access)
    on conflict (username, project_id) do nothing;
    delete from invites where id = r.id;
  end loop;
end; $$;

-- 5) realtime for invites, so admins see pending invites disappear live
--    once they're accepted.
do $$
begin
  begin execute 'alter publication supabase_realtime add table invites';
  exception when duplicate_object then null; when others then null; end;
end $$;

-- ============================================================
-- Next steps (do these in the Supabase dashboard, not SQL):
--   Authentication → Providers → enable Google and GitHub.
--   Authentication → URL Configuration → add your site URL as a
--   redirect URL, e.g. https://rudraxdevelopment98-cell.github.io/RD-Portal/
-- ============================================================
