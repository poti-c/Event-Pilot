# Event Pilot

Local sandbox for building the Event Pilot platform before connecting Supabase
or production DNS.

## Current Stack

- Vite
- React
- TypeScript
- ESLint
- Local browser storage first

## Local Setup

```sh
npm install
npm run dev
```

## Useful Commands

```sh
npm run lint
npm run typecheck
npm run build
```

## Environment

Keep Supabase values blank while building locally:

```sh
cp .env.example .env.local
```

Supabase and `nnr-solutions.com` DNS are intentionally deferred until the
platform is ready to migrate.
