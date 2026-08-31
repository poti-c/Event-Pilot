-- Fix the auth.users -> eventpilot_profiles bridge trigger.
--
-- eventpilot_handle_new_user() auto-creates a profile whenever an auth user is
-- created. It predates the three-tier role migration (20260718032558) and still
-- defaulted new profiles to the OLD role 'Client User', which the current role
-- CHECK constraint rejects. That made EVERY admin-API createUser fail with
-- "violates check constraint eventpilot_profiles_role_check" — including the new
-- eventpilot-users edge function that provisions Top Management / Manager / Staff.
--
-- This rewrite:
--   * defaults the role to 'staff' (a valid tier) when none is supplied, and
--   * carries the `username` field (added in 20260718032558) through from
--     user_metadata, so staff accounts created via the admin API get their
--     workspace username on the profile.
--
-- The row is still inserted from user_metadata with ON CONFLICT DO NOTHING, so
-- the edge function's own upsert remains the authoritative writer.

create or replace function public.eventpilot_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  insert into public.eventpilot_profiles
    (user_id, email, role, display_name, workspace_code, username)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'role', 'staff'),
    new.raw_user_meta_data->>'display_name',
    new.raw_user_meta_data->>'workspace_code',
    new.raw_user_meta_data->>'username'
  )
  on conflict (user_id) do nothing;
  return new;
end;
$function$;
