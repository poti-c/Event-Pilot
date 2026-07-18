# Supabase schema

Event Pilot's database lives in the shared "Na Nirand" Supabase project. All
Event Pilot objects are `eventpilot_`-prefixed so they stay isolated from the
other apps in that project.

## Migrations

`migrations/` mirrors the migrations applied to the project, named
`<version>_<name>.sql` to match what Supabase has recorded:

| Version | Purpose |
| --- | --- |
| `20260716173847_eventpilot_app_state_and_profiles` | Base tables (`eventpilot_profiles`, `eventpilot_app_state`) and their RLS policies. Reconstructed from the live schema — it predates migration tracking in this repo. |
| `20260718032558_eventpilot_three_tier_roles` | Moves roles to the three-tier model (`top_management` / `manager` / `staff`) and adds `username` for staff sign-in. |
| `20260718041956_eventpilot_top_management_user_admin` | Lets Top Management read/update all profiles, plus a guard trigger blocking role changes by non-Top-Management and demotion of the last Top Management account. |

These files are the source of truth for rebuilding the schema. They are already
applied to the live project — do not re-run them against it. Apply them in
version order when standing up a fresh project.

## Auth users

Auth accounts are **not** covered by these migrations. `eventpilot_profiles`
rows reference `auth.users`, so users must exist first (created via the
Supabase dashboard or admin API), then a matching profile row inserted with the
desired `role` and `workspace_code`.

Staff sign in with a username scoped to their workspace code; the app derives a
synthetic auth email of the form
`<username>@<workspace-code>.staff.eventpilot.internal`.
