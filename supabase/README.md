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
| `20260718120000_eventpilot_console_admins` | Vendor console identity: `eventpilot_console_admins`, login throttle, audit log, and the bcrypt verify/upsert functions. Service-role only — see "Vendor console" below. |
| `20260718140000_eventpilot_billing_documents` | Client roster (`eventpilot_client_companies`), issuer settings, and the billing document engine (`eventpilot_documents`, `eventpilot_document_deliveries`, `eventpilot_document_counters`) with Thai VAT/WHT/branch fields. |
| `20260718160000_eventpilot_client_active_users` | Client active-user tracking. |
| `20260725120000_eventpilot_retire_vendor_owner_profile` | Removes the seeded vendor-owner profile (`workspace_code = 'admin'`) from `eventpilot_profiles` and reserves that workspace code, keeping the `/admin` vendor plane out of customers' Top Management user lists. Includes a manual note to delete the leftover `auth.users` row. |
| `20260725130000_eventpilot_fix_handle_new_user` | Fixes the `eventpilot_handle_new_user()` trigger (auth.users → eventpilot_profiles). It defaulted new profiles to the pre-three-tier role `'Client User'`, which the current role CHECK rejects — breaking every admin-API `createUser`. Now defaults to `'staff'` and carries `username` through from user_metadata. |

These files are the source of truth for rebuilding the schema. They are already
applied to the live project — do not re-run them against it. Apply them in
version order when standing up a fresh project.

## Vendor console

The SaaS owner console at `/admin` runs on a **separate authority plane** from
customer accounts. Customer identities live in `auth.users` +
`eventpilot_profiles`; NNR-Solutions operators live in
`eventpilot_console_admins`. A customer's own Top Management account therefore
has no path into `/admin`, no matter what its profile row says.

The `eventpilot_console_*` tables have RLS enabled with **zero policies** and
all grants revoked from `anon`/`authenticated`, so the only way in is the
`eventpilot-console` edge function, which holds the service role key.

Required function secrets:

| Secret | Purpose |
| --- | --- |
| `EVENTPILOT_CONSOLE_TOKEN_SECRET` | HMAC key for console session tokens. Required — the function refuses to run without it. |
| `EVENTPILOT_CONSOLE_ADMIN_USER` | Bootstrap username, used only until a real `eventpilot_console_admins` row exists. |
| `EVENTPILOT_CONSOLE_ADMIN_PASSWORD` | Bootstrap password. |

Seed the first real operator from the SQL editor (service role):

```sql
select public.eventpilot_console_upsert_admin(
  'poti', '<a-strong-password>', 'Poti Chaopaisarn', 'poti@nanirand.com', true
);
```

Then clear the bootstrap env secrets.

## Billing documents

Quotations, invoices, tax invoices and receipts live in `eventpilot_documents`,
issued by the vendor console. Design notes worth knowing before changing them:

- **Both parties are snapshotted** onto the document (`issuer_snapshot`,
  `buyer_snapshot`). A document must not change because a company later edits
  its address, so nothing is rendered from a live join.
- **All money is recomputed server-side** from `line_items`. Totals sent by the
  browser are never trusted.
- **Numbering** is allocated by `eventpilot_next_doc_number(scope, doc_type,
  issue_date)`, which locks a counter row per `(scope, doc_type, period)` — the
  Revenue Department expects sequential, non-reused tax invoice numbers.
  Format `PREFIX + YYYY-MM + NNN`, resetting monthly, e.g. `INV2026-07001`.
  The period comes from the Bangkok issue date, not UTC.
- **Delivery is an append-only log** (`eventpilot_document_deliveries`), one row
  per send attempt, so a resend adds history instead of overwriting when the
  document was first delivered.
- `issuer_scope` is `vendor` today; `venue` is reserved for venue-to-event-client
  billing through the same engine.

## Auth users

Auth accounts are **not** covered by these migrations. `eventpilot_profiles`
rows reference `auth.users`, so users must exist first (created via the
Supabase dashboard or admin API), then a matching profile row inserted with the
desired `role` and `workspace_code`.

Staff sign in with a username scoped to their workspace code; the app derives a
synthetic auth email of the form
`<username>@<workspace-code>.staff.eventpilot.internal`.

## Customer user provisioning (`eventpilot-users`)

The customer app can now create real login accounts in-app (Settings → User
management) via the `eventpilot-users` edge function — the customer-plane
analogue of `eventpilot-console`. Key differences:

- It authenticates the **caller's own Supabase JWT** (`Authorization: Bearer`),
  not a self-issued token: it validates the JWT with the service role, reads the
  caller's `eventpilot_profiles` role, and only then acts.
- Deployed with **verify_jwt off** (it authenticates callers itself).
- Actions: `list_users`, `create_user`, `delete_user`. Permission model —
  Top Management manages all three tiers; Managers may add/remove **Staff only**;
  Staff cannot manage users. The last Top Management account cannot be deleted,
  and callers cannot delete themselves.
- On `create_user` it creates the `auth.users` row (Auth Admin API) with the
  role/workspace/username in `user_metadata`; the `eventpilot_handle_new_user`
  trigger mirrors those into a profile, and the function then upserts to stay
  authoritative. It rolls back the auth user if the profile write fails.

**BEO Viewers are NOT created here** — they are an app-layer roster (name +
department) stored in `eventpilot_app_state`, signing in view-only through the
"Department (BEO)" login tab. Editable **departments** and per-role
**permission overrides** are likewise per-user synced app-state, edited in
Settings by Top Management.
