-- The console tracks how many seats a client is actually using, alongside the
-- allowed_users limit, so it can show seat pressure and price extra seats.
alter table public.eventpilot_client_companies
  add column if not exists active_users integer not null default 0;
