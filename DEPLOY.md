# Deploying Event Pilot

Event Pilot is hosted the same way as the Kaizen System: a static Vite build
served by **GitHub Pages** at a custom subdomain, with **GoDaddy managing DNS**.
Backend (auth + data) is Supabase, called directly from the browser.

- **Live URL:** https://eventpilot.nnr-solutions.com
- **Repo:** `poti-c/Event-Pilot` (must be **public** — GitHub Pages on the Free
  plan only serves public repos)
- **Build/deploy:** `.github/workflows/deploy.yml` runs on every push to
  `master`: type-check → `vite build` → publish `dist/` to the `gh-pages` branch,
  which GitHub Pages serves.

## How it deploys (automatic)

Push to `master` → GitHub Actions builds and deploys. No manual upload.

The Supabase URL + publishable key are injected at build time from **repo
secrets** (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`). Set/rotate them with:

```sh
gh secret set VITE_SUPABASE_URL --repo poti-c/Event-Pilot --body "https://uwswaeazowhtrpktakhx.supabase.co"
gh secret set VITE_SUPABASE_ANON_KEY --repo poti-c/Event-Pilot --body "<publishable key>"
```

The publishable key is safe to expose in client code; data access is controlled
by Supabase row-level security.

## One-time setup

1. **Repo public + Pages:** repo is public; Pages source = `gh-pages` branch.
2. **CNAME file:** `public/CNAME` contains `eventpilot.nnr-solutions.com` and is
   copied into every build, so Pages keeps the custom domain across deploys.
3. **SPA fallback:** the workflow copies `index.html` → `404.html` so the
   `/admin` path route boots the app instead of returning a 404.
4. **GoDaddy DNS** (in the nnr-solutions.com DNS zone), identical to Kaizen:

   | Type  | Name         | Value             | TTL |
   |-------|--------------|-------------------|-----|
   | CNAME | `eventpilot` | `poti-c.github.io`| 1 hr|

   After DNS propagates, GitHub issues a Let's Encrypt certificate automatically
   and HTTPS is enforced.

## Supabase accounts

- `admin.eventpilot@nnr-solutions.com` — Owner Admin (can access `/admin`)
- `poti@nanirand.com` — Client User (password unchanged by this migration; it's
  the one already set on that shared Supabase account)

If you later add password-reset / magic-link emails, add
`https://eventpilot.nnr-solutions.com` to *Supabase → Authentication → URL
Configuration*. Plain email/password sign-in needs no change.
