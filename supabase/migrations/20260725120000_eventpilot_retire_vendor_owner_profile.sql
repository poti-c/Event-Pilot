-- Retire the vendor/software-owner identity from the customer plane.
--
-- The SaaS owner console at /admin runs on a SEPARATE authority plane: its
-- operators live in eventpilot_console_admins and authenticate through the
-- eventpilot-console edge function, NOT Supabase Auth. The seeded
-- "EventPilot Owner" profile (workspace_code = 'admin') was therefore never
-- used to sign into /admin — it only leaked the vendor account into every
-- company's Top Management user list, where a customer could see and even try
-- to re-role it. This migration removes it and stops it ever coming back.

-- 1. Drop the vendor-owner profile row(s). Deleting the profile does NOT touch
--    the referenced auth.users row (the FK cascades the other direction), and
--    the role guard trigger fires on UPDATE only, so this DELETE is safe even
--    though the row is top_management (other Top Management accounts remain).
delete from public.eventpilot_profiles
where workspace_code = 'admin'
   or lower(email) = lower('admin.eventpilot@nnr-solutions.com');

-- 2. Reserve 'admin' as a workspace_code so the vendor plane can never be
--    reintroduced into eventpilot_profiles. `is distinct from` lets the common
--    NULL workspace_code (email+password tiers) and every real company code
--    through, and rejects only the reserved vendor marker.
alter table public.eventpilot_profiles
  drop constraint if exists eventpilot_profiles_workspace_not_reserved;

alter table public.eventpilot_profiles
  add constraint eventpilot_profiles_workspace_not_reserved
  check (workspace_code is distinct from 'admin');

-- 3. Manual follow-up (NOT run here — auth.users is provisioned out-of-band and
--    is deliberately outside these migrations, per supabase/README.md):
--    delete the leftover auth account so it can no longer signInWithPassword.
--    From the SQL editor with the service role, or the Supabase dashboard:
--
--      select id, email from auth.users
--      where lower(email) = lower('admin.eventpilot@nnr-solutions.com');
--      -- then, via the Auth admin API / dashboard "Delete user", remove it.
--      -- (Its eventpilot_app_state rows, if any, cascade away with the user.)
