-- Event Pilot base schema: per-user profiles and synced app state.
--
-- NOTE: this migration was originally applied directly to the Supabase project
-- before migrations were tracked in this repo. It is reconstructed from the
-- live schema so a fresh environment can be rebuilt from scratch. The role
-- values here are the ORIGINAL two-tier ones; 20260718032558 migrates them to
-- the three-tier model.

-- Profiles: one row per auth user, holding their Event Pilot role and workspace.
create table if not exists public.eventpilot_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  role text not null default 'Client User'
    check (role in ('Owner Admin', 'Client User')),
  display_name text,
  workspace_code text,
  created_at timestamptz not null default now()
);

-- App state: one JSON row per (user, storage key); written through by
-- useSyncedState in the front end.
create table if not exists public.eventpilot_app_state (
  user_id uuid not null references auth.users (id) on delete cascade,
  key text not null,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

alter table public.eventpilot_profiles enable row level security;
alter table public.eventpilot_app_state enable row level security;

-- Each user may read and update only their own profile. Rows are provisioned
-- out-of-band (service role), so there is deliberately no INSERT policy.
create policy eventpilot_profiles_select_own
  on public.eventpilot_profiles for select
  using (auth.uid() = user_id);

create policy eventpilot_profiles_update_own
  on public.eventpilot_profiles for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Each user fully owns their own app-state rows.
create policy eventpilot_app_state_select_own
  on public.eventpilot_app_state for select
  using (auth.uid() = user_id);

create policy eventpilot_app_state_insert_own
  on public.eventpilot_app_state for insert
  with check (auth.uid() = user_id);

create policy eventpilot_app_state_update_own
  on public.eventpilot_app_state for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy eventpilot_app_state_delete_own
  on public.eventpilot_app_state for delete
  using (auth.uid() = user_id);
