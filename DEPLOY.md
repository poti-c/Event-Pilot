# Deploying Event Pilot to GoDaddy

Event Pilot is a static single-page app (Vite build) backed by Supabase. There is
no Node server to run in production — you upload the built files to GoDaddy's
web hosting and the app talks to Supabase directly from the browser.

## 1. Build the app

```sh
npm install        # first time only
npm run build
```

This produces a `dist/` folder. The Supabase URL and publishable key from
`.env.local` are baked into the bundle at build time (the publishable key is
safe to expose in client code — access is controlled by row-level security).

> Rebuild and re-upload whenever you change the code or the `.env.local` values.

## 2. Upload `dist/` to GoDaddy

Use **cPanel → File Manager** (or an FTP client such as FileZilla):

1. Go to your domain's document root — usually **`public_html`** (or
   `public_html/<subfolder>` if the app lives under a path).
2. Upload the **contents of `dist/`** — i.e. `index.html`, the `assets/`
   folder, `brand/`, `favicon.svg`, **and the hidden `.htaccess` file**.
   Upload the files *inside* `dist/`, not the `dist` folder itself.
3. **The `.htaccess` file is critical and hidden.** In cPanel File Manager click
   **Settings → Show Hidden Files (dotfiles)** before uploading, or in FileZilla
   enable *Server → Force showing hidden files*. Without it, the `/admin` portal
   route returns a 404.

That's it — visit your domain and the app loads.

## Why `.htaccess` is needed

The main app navigates with hash routes (`#Dashboard`, `#BEOs`, …) which need no
server config. But the admin portal uses a real path (`/admin`), so Apache must
serve `index.html` for any path that isn't a real file. The included `.htaccess`
does exactly that (plus sensible caching for fingerprinted assets).

## Deploying under a subfolder (not the root domain)

The build assumes it is served from the domain root (`/`). If you deploy to
`https://yourdomain.com/eventpilot/` instead, set the base path before building:

```sh
# vite.config.ts → defineConfig({ base: '/eventpilot/', plugins: [react()] })
npm run build
```

and change `RewriteBase /` to `RewriteBase /eventpilot/` in `public/.htaccess`.

## Supabase notes

- **Data & auth** are served by the Na Nirand Supabase project. No server-side
  secrets are deployed — only the public URL + publishable key.
- **Accounts:** sign in with a real Supabase user. Two are provisioned:
  - `admin.eventpilot@nnr-solutions.com` — Owner Admin (can access `/admin`)
  - `poti@nanirand.com` — Client User (its password is the one already set on
    that Supabase account, unchanged by this migration)
- **Custom domain in Supabase Auth:** if you later add password-reset or
  magic-link emails, add your GoDaddy domain to
  *Supabase → Authentication → URL Configuration* (Site URL + redirect allowlist).
  Plain email/password sign-in used today needs no change.
