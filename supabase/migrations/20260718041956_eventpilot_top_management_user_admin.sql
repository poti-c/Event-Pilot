-- Let Top Management administer every user's access level, with server-side
-- guardrails against privilege escalation and lockout.

-- Helper: is the current user Top Management? SECURITY DEFINER bypasses RLS so
-- it can be used inside profile policies without recursion.
create or replace function public.eventpilot_is_top_management()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.eventpilot_profiles
    where user_id = auth.uid() and role = 'top_management'
  );
$$;

-- Top Management can read every profile (others still see only their own row).
create policy eventpilot_profiles_select_top_management
  on public.eventpilot_profiles for select
  using (public.eventpilot_is_top_management());

-- Top Management can update any profile (others still update only their own).
create policy eventpilot_profiles_update_top_management
  on public.eventpilot_profiles for update
  using (public.eventpilot_is_top_management())
  with check (public.eventpilot_is_top_management());

-- Guard the role column: only Top Management may change a role, and the last
-- Top Management account cannot be demoted (avoids locking everyone out).
create or replace function public.eventpilot_guard_role_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role then
    if not public.eventpilot_is_top_management() then
      raise exception 'Only Top Management can change account roles.';
    end if;
    if old.role = 'top_management' and new.role <> 'top_management'
       and (select count(*) from public.eventpilot_profiles where role = 'top_management') <= 1 then
      raise exception 'Cannot demote the last Top Management account.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists eventpilot_profiles_role_guard on public.eventpilot_profiles;
create trigger eventpilot_profiles_role_guard
  before update on public.eventpilot_profiles
  for each row execute function public.eventpilot_guard_role_change();
