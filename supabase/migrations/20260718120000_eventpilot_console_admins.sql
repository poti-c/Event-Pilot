-- Vendor (SaaS owner) console identity.
--
-- This is deliberately NOT part of Supabase Auth. Customer accounts live in
-- auth.users + eventpilot_profiles; the people who sell and operate EventPilot
-- live here. Keeping the two planes separate means a customer's own Top
-- Management account can never reach /admin, no matter what its profile row
-- says. Mirrors the kaizen_console_admins pattern from the Kaizen System.
--
-- None of these tables are reachable with the anon or authenticated key. The
-- only way in is the `eventpilot-console` edge function, which holds the
-- service role key and gates every action behind a signed console token.

create table if not exists public.eventpilot_console_admins (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  display_name text,
  email text,
  password_hash text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  last_login_at timestamptz
);

-- Per-IP throttle for console sign-in.
create table if not exists public.eventpilot_console_login_attempts (
  ip text primary key,
  attempts integer not null default 0,
  locked_until timestamptz,
  last_attempt timestamptz not null default now()
);

create table if not exists public.eventpilot_console_audit (
  id bigserial primary key,
  action text not null,
  actor text,
  detail jsonb not null default '{}'::jsonb,
  ip text,
  success boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists eventpilot_console_audit_created_idx
  on public.eventpilot_console_audit (created_at desc);

alter table public.eventpilot_console_admins enable row level security;
alter table public.eventpilot_console_login_attempts enable row level security;
alter table public.eventpilot_console_audit enable row level security;

-- No policies on purpose: RLS with zero policies denies everything for the
-- anon/authenticated roles, while the service role bypasses RLS entirely.
revoke all on public.eventpilot_console_admins from anon, authenticated;
revoke all on public.eventpilot_console_login_attempts from anon, authenticated;
revoke all on public.eventpilot_console_audit from anon, authenticated;

-- Password verification stays inside the database so the bcrypt hash never
-- leaves it. Returns the admin id on success, NULL otherwise.
create or replace function public.eventpilot_console_verify_login(
  p_username text,
  p_password text
)
returns uuid
language sql
security definer
stable
set search_path = public, extensions
as $$
  select id
    from public.eventpilot_console_admins
   where username = lower(btrim(p_username))
     and is_active
     and password_hash = crypt(p_password, password_hash)
$$;

-- Create or update a console admin, hashing the password with bcrypt.
-- Passing NULL for p_password leaves the existing hash untouched.
create or replace function public.eventpilot_console_upsert_admin(
  p_username text,
  p_password text default null,
  p_display_name text default null,
  p_email text default null,
  p_is_active boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_username text := lower(btrim(p_username));
  v_id uuid;
begin
  if v_username = '' then
    raise exception 'Console admin username is required.';
  end if;

  insert into public.eventpilot_console_admins
    (username, password_hash, display_name, email, is_active)
  values (
    v_username,
    crypt(coalesce(p_password, gen_random_uuid()::text), gen_salt('bf', 12)),
    p_display_name,
    p_email,
    p_is_active
  )
  on conflict (username) do update set
    password_hash = case
      when p_password is null then public.eventpilot_console_admins.password_hash
      else crypt(p_password, gen_salt('bf', 12))
    end,
    display_name = coalesce(p_display_name, public.eventpilot_console_admins.display_name),
    email = coalesce(p_email, public.eventpilot_console_admins.email),
    is_active = p_is_active
  returning id into v_id;

  return v_id;
end;
$$;

-- Both helpers are service-role only; nothing client-side may call them.
revoke execute on function public.eventpilot_console_verify_login(text, text)
  from public, anon, authenticated;
revoke execute on function public.eventpilot_console_upsert_admin(text, text, text, text, boolean)
  from public, anon, authenticated;
