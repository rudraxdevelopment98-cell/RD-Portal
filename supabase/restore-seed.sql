-- ============================================================
-- RD Portal — restore the original seed into Supabase
-- Run AFTER schema.sql, AFTER your profile (kuldeep) exists.
-- Idempotent: safe to re-run (upserts projects/members, clears
-- then re-inserts this seed's tasks/research/activity).
-- ============================================================

-- ---------- projects (fix shiva metadata + add breachly) ----------
insert into projects (id, name, key, color, descr, repo, phases) values
  ('shiva', 'Shiva', 'SHV', '#FF7A66', 'MCP / agent-tool security',
   'rudraxdevelopment98-cell/shiva',
   '[{"num":"1","label":"Phase 0","name":"Learn + Break","status":"active"},
     {"num":"2","label":"Phase 1","name":"OSS Scanner","status":""},
     {"num":"3","label":"Phase 2","name":"Runtime Gateway","status":""},
     {"num":"4","label":"Phase 3","name":"Hosted Layer","status":""}]'::jsonb),
  ('breachly', 'Breachly', 'BRY', '#7FD1A8',
   'Mobile app — email breach checker + monitoring (Expo / React Native)',
   'rudraxdevelopment98-cell/Breachly',
   '[{"num":"1","label":"Phase 1","name":"MVP","status":"active"},
     {"num":"2","label":"Phase 2","name":"Auth + Paywall","status":""},
     {"num":"3","label":"Phase 3","name":"Monitoring","status":""},
     {"num":"4","label":"Phase 4","name":"Launch","status":""}]'::jsonb)
on conflict (id) do update set
  name = excluded.name, key = excluded.key, color = excluded.color,
  descr = excluded.descr, repo = excluded.repo, phases = excluded.phases;

-- ---------- membership (kuldeep owns both) ----------
insert into members (username, project_id, role, access) values
  ('kuldeep', 'shiva',    'Owner', array['dashboard','roadmap','structure','tasks','documents','research','activity','members']),
  ('kuldeep', 'breachly', 'Owner', array['dashboard','roadmap','structure','tasks','documents','research','activity','members'])
on conflict (username, project_id) do update set role = excluded.role, access = excluded.access;

-- ---------- tasks (clear this seed's projects, then re-insert) ----------
delete from tasks where project_id in ('shiva','breachly');
insert into tasks (project_id, title, descr, assignee, due, priority, status, phase) values
  -- Shiva
  ('shiva','Day 1 · Install the MCP SDK','pip install + Claude Desktop as the client','kuldeep',current_date + 1,'High','To do','P0'),
  ('shiva','Day 2 · Run benign_server.py','mcp dev — learn the tool call flow','kuldeep',current_date + 2,'High','To do','P0'),
  ('shiva','Day 3 · Reproduce tool poisoning (attack #1)','The key demo — screen-record it','kuldeep',current_date + 3,'Critical','To do','P0'),
  ('shiva','Day 4 · Write up attack #1 + push','docs/attacks/01-tool-poisoning.md','kuldeep',current_date + 4,'High','To do','P0'),
  ('shiva','Day 5 · Run attacks #2 & #3','drift + escalation; log in evidence.md','kuldeep',current_date + 5,'Medium','To do','P0'),
  ('shiva','Day 6 · Sketch the scanner''s 3 checks','hidden instructions · perms · hashing','kuldeep',current_date + 6,'Medium','To do','P0'),
  ('shiva','Day 7 · Decision gate 0','In for Phase 1? Log in improvements.md','kuldeep',current_date + 7,'Medium','To do','P0'),
  -- Breachly
  ('breachly','Wire up real HIBP API key','Replace mock mode with live HIBP v3 API via Supabase Edge Function','kuldeep',current_date + 1,'High','To do','P0'),
  ('breachly','Polish breach result cards','Show breach logo, year, data classes leaked','kuldeep',current_date + 2,'Medium','To do','P0'),
  ('breachly','Add email validation','Client + Edge Function; reject invalid / disposable addresses','kuldeep',current_date + 2,'Medium','To do','P0'),
  ('breachly','Phase 2 · User authentication','Supabase Auth — magic-link or OTP, persisted sessions','kuldeep',current_date + 5,'High','To do','P1'),
  ('breachly','Phase 2 · RevenueCat paywall','Paywall for monitoring; free tier = 1 check','kuldeep',current_date + 7,'High','To do','P1'),
  ('breachly','Phase 2 · Monitoring backend','Supabase cron + HIBP polling; push on new breach','kuldeep',current_date + 10,'High','To do','P1'),
  ('breachly','Phase 2 · Password exposure check','HIBP Pwned Passwords k-anonymity, local hash prefix only','kuldeep',current_date + 12,'Medium','To do','P1'),
  ('breachly','App Store submission prep','Screenshots, privacy policy, App Privacy labels, TestFlight','kuldeep',current_date + 14,'High','To do','P2');

-- ---------- research ----------
delete from research where project_id in ('shiva','breachly');
insert into research (project_id, title, url, category, note, created_by) values
  ('shiva','Simon Willison — MCP prompt injection','https://simonwillison.net/tags/model-context-protocol/','Reference','Core read on why MCP has injection problems.','kuldeep'),
  ('breachly','Have I Been Pwned API v3','https://haveibeenpwned.com/API/v3','Reference','Auth via API key header. Rate limit 1 req / 1.5s on free tier.','kuldeep'),
  ('breachly','HIBP k-anonymity (Pwned Passwords)','https://www.troyhunt.com/ive-just-launched-pwned-passwords-version-2/','Reference','Send first 5 chars of SHA-1; server returns suffixes. Never sends full password.','kuldeep'),
  ('breachly','RevenueCat Expo / RN SDK','https://www.revenuecat.com/docs/getting-started/installation/reactnative','Reference','react-native-purchases. Needs Dev Client — not Expo Go.','kuldeep');

-- ---------- activity ----------
insert into activity (project_id, actor, action) values
  ('shiva','system','Project created'),
  ('breachly','system','Project created');
