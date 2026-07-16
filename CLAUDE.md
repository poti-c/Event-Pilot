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
- Navigation uses URL hash routes such as `#Dashboard` and `#BEOs`.
- App data is currently stored in the browser's local storage.
- Supabase and production DNS integration are intentionally deferred.

## Important transfer notes

- This archive intentionally excludes `.env.local`, `node_modules`, `dist`, Git history, and machine-specific files.
- `.env.example` is safe to use as a template; do not commit real credentials.
- Browser local-storage records are not contained in this source archive.
- Preserve existing behavior and visual design unless a requested change requires otherwise.
