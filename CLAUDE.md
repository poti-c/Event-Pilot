# Event Pilot handoff

Event Pilot is a local-first venue CRM, booking, BEO, and operations prototype.

## Stack

- React 19
- TypeScript
- Vite
- CSS
- Lucide React icons

## Run locally

```sh
npm install
npm run dev
```

Use `npm run typecheck`, `npm run lint`, and `npm run build` when validating changes.

## Current architecture

- `src/App.tsx` contains the primary application UI and behavior.
- `src/data.ts` contains seeded demonstration data.
- `src/App.css` and `src/index.css` contain the active styling.
- Navigation uses URL hash routes such as `#Dashboard` and `#BEOs`; the admin
  portal is the real path `/admin`.
- `src/supabaseClient.ts` initializes Supabase (only when `VITE_SUPABASE_URL`
  and `VITE_SUPABASE_ANON_KEY` are set).

## Backend & auth (Supabase)

- Login uses real Supabase Auth (`signInWithPassword`). The login page has three
  tabs for the authority tiers (`top_management` / `manager` / `staff`), which
  come from the `eventpilot_profiles` table. Sign-in is rejected when the
  account's tier does not match the selected tab.
- Staff sign in with a workspace code + username; the app derives a synthetic
  auth email `<username>@<workspace-code>.staff.eventpilot.internal`. The other
  two tiers sign in with email + password.
- Top Management can edit every user's tier from Settings. RLS lets them
  read/update all profiles, and a database trigger blocks role changes by
  anyone else and refuses to demote the last Top Management account.
- App state persists per-user to the `eventpilot_app_state` table (one JSON row
  per storage key), guarded by row-level security. `useSyncedState` in
  `App.tsx` hydrates from Supabase, seeds on first login, and writes through.
- When Supabase env vars are blank the app falls back to fully-offline
  localStorage mode, so `npm run dev` works with no backend.
- Backend lives in the shared "Na Nirand" Supabase project; all Event Pilot
  tables are `eventpilot_`-prefixed to stay isolated from other apps there.
- Schema is version-controlled in `supabase/migrations/` (see
  `supabase/README.md`). Those files are already applied to the live project —
  do not re-run them against it.

## Deploy

- Hosted on GoDaddy as a static build. See `DEPLOY.md` for build + upload steps.
- Repo: private GitHub repo `poti-c/Event-Pilot`.

## Important notes

- `.env.local` (real Supabase config) is git-ignored; `.env.example` is the
  template. Do not commit real credentials.
- `node_modules`, `dist`, and Git history are git-ignored / not archived.
- Preserve existing behavior and visual design unless a requested change requires otherwise.
