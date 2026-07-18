-- Move eventpilot_profiles to the three-tier authority model (Kaizen-aligned):
-- top_management / manager / staff.

alter table public.eventpilot_profiles drop constraint if exists eventpilot_profiles_role_check;
alter table public.eventpilot_profiles alter column role drop default;

-- Migrate existing rows: both current accounts become Top Management.
update public.eventpilot_profiles set role = 'top_management' where role in ('Owner Admin', 'Client User');

-- Re-key the constraint + default onto the new tiers (new signups default to lowest privilege).
alter table public.eventpilot_profiles
  add constraint eventpilot_profiles_role_check check (role in ('top_management', 'manager', 'staff'));
alter table public.eventpilot_profiles alter column role set default 'staff';

-- Staff identity (mirrors Kaizen: username scoped per workspace_code).
alter table public.eventpilot_profiles add column if not exists username text;
