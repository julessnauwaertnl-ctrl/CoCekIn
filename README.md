# CoCekIn — find your clan, rule the war

CoCekIn is a fan-made hub for **Clash of Clans** players: a player profile that looks the part, clan discovery that tells you whether you qualify, and tools to run your own clan.

> **Unofficial fan content.** CoCekIn is not affiliated with, endorsed, sponsored, or specifically approved by Supercell, and Supercell is not responsible for it. See Supercell's [Fan Content Policy](https://supercell.com/en/fan-content-policy/). All artwork in this project (avatars, clan badges, cover scenes, logo) is original and generated in code; the hero/CTA illustrations are AI-generated originals. No Supercell assets are used.

## What's inside

| Area | What it does |
| --- | --- |
| **Homepage** | Full-bleed hero, live stats from the database, clans that are recruiting right now, top players, recruit board. Every number is real; if there's no data you see an honest empty state. |
| **Player profiles** `/u/:handle` | Procedural cover + avatar, rank, village stats, 14 computed achievements with progress, clan card, tabs. Stats are labelled *self-reported* or *verified*. |
| **Clan discovery** `/clans` | Search + filters (type, language, war frequency, focus, my Town Hall, my trophies, free slots, "clans I qualify for"), sort, pagination, URL-synced state, mobile filter sheet. Each card tells you if you qualify and why not. |
| **Clan pages** `/clans/:slug` | Stats, requirements, members, join / request-to-join, leave. Leaders and co-leaders get Requests + Settings tabs; leaders manage roles, transfer leadership, delete. |
| **Players directory** `/players` | Filter by Town Hall range, language, looking-for-clan, verified. |
| **Accounts** | Register / sign in / sign out, settings (profile, game stats, appearance, security), change password, delete account, dashboard with profile-strength checklist and join-request tracker. |
| **Optional: official API** | With a Clash of Clans API key the server can *verify* an account (in-game API token) and *sync* stats. |

## Quick start

Requires **Node.js 22.13 or newer** (uses the built-in `node:sqlite`). There are **no runtime npm dependencies**.

```bash
npm install          # only installs dev tools (TypeScript for type-checking)
npm run dev          # http://localhost:3000  (auto-restarts on change)
npm run seed         # optional: add clearly-labelled DEMO players/clans
```

`npm run seed -- --reset` removes all demo data again. Demo accounts show a **Demo** badge everywhere and cannot be signed into.

Production-style run:

```bash
npm run build        # -> dist/public (minified CSS, import/asset verification, JS syntax check)
NODE_ENV=production npm start
```

## Configuration

Copy `.env.example` to `.env` (loaded automatically) or set real environment variables.

| Variable | Default | Notes |
| --- | --- | --- |
| `PORT` | `3000` | |
| `DATABASE_PATH` | `./data/cocekin.db` | **Put this on persistent storage in production.** |
| `NODE_ENV` | – | `production` turns on `Secure` cookies + HSTS and serves `dist/`. |
| `COOKIE_SECURE` | `true` in production | Set `false` only if you run production mode over plain HTTP. |
| `TRUST_PROXY` | `false` | Set `true` behind a proxy/PaaS so rate limiting sees the real client IP. |
| `SITE_URL` | – | Public URL, used for canonical/OpenGraph tags and the sitemap. |
| `ALLOWED_ORIGINS` | – | Extra origins allowed to call the API (normally none). |
| `COC_API_TOKEN` | – | Optional official API key — enables verification + stat sync. |

### Enabling account verification (optional)

1. Create a key at <https://developer.clashofclans.com> and allow-list the **public IP of your server** (Supercell keys are IP-bound).
2. Set `COC_API_TOKEN`.
3. Players open *Settings → Game stats → Verify your account*, paste their player tag plus the one-time token from *Clash of Clans → Settings → More Settings → API Token*. Verified stats are read-only and can be re-synced.

Without the key the UI says so plainly and every stat stays labelled *self-reported*.

## Deploying it publicly

CoCekIn is a small Node server with a SQLite file, so it needs a host that runs a process and has **a persistent disk/volume** (single instance). Pick one:

* **Render** — push to GitHub, *New → Blueprint*, choose the repo (`render.yaml` is included; persistent disks need a paid plan). Set `SITE_URL`.
* **Fly.io** — `fly launch --copy-config --no-deploy`, `fly volumes create cocekin_data --size 1`, `fly deploy` (`fly.toml` included).
* **Any VPS / Docker host** — `docker build -t cocekin .` then
  `docker run -d -p 3000:3000 -v cocekin-data:/data -e SITE_URL=https://your.domain cocekin`, and put Caddy/nginx in front for HTTPS (`TRUST_PROXY=true` is already set in the image).
* **Railway / Azure App Service / others** — use the Dockerfile or `npm run build && npm start` with Node ≥ 22.13 and a mounted volume for `DATABASE_PATH`.

After deploying, check `https://your.domain/health` returns `{"status":"ok"}`, register an account, create a clan, and (optionally) `npm run seed` through your host's shell.

> I (the author of this scaffold) could not deploy it for you: no public URL exists until you run one of the steps above on your own hosting account.

## Architecture

```
server/      Node http server, tiny router, SQLite (node:sqlite), auth, rate limiting, CoC API client
  routes/    account, players, clans, misc (stats/meta)
shared/      game constants + achievements, imported by BOTH server and browser
public/      the single-page app (vanilla ES modules, History-API router, lazy-loaded pages)
  js/        dom.js (safe element builder) · art.js (procedural SVG art) · ui.js · components.js · pages/
scripts/     build.js · seed.js
test/        API tests, frontend smoke tests (fake DOM), type-checked
```

Design language: one stylesheet, dark "night-keep" palette, chunky gold buttons, stone-purple cards, one display type stack. Every page uses the same components (`clanCard`, `playerCard`, `tabs`, `field`, states).

## Security model

* Passwords: scrypt with per-user salt; constant-ish-time login (dummy hash for unknown emails); same error for unknown email and wrong password.
* Sessions: random 256-bit token, **only its SHA-256 is stored**; `HttpOnly`, `SameSite=Lax`, `Secure` in production; sliding 30-day expiry; password change revokes other sessions.
* CSRF: state-changing requests require `Content-Type: application/json` and a same-origin `Origin`/`Sec-Fetch-Site`; cookies are `SameSite=Lax`.
* Authorization is enforced **on the server for every route** (see the matrix test): only you edit your profile; only leaders/co-leaders see and resolve requests; only leaders change roles, transfer or delete; co-leaders can only remove members ranked below them; applicants can only cancel their own requests.
* Rate limits: sign-in, sign-up, verification, general reads/writes (in-memory, per instance).
* Input validation on every field; parameterised SQL everywhere (LIKE wildcards escaped); 32 KB body limit.
* Strict CSP (`default-src 'self'`, no inline scripts or styles), `nosniff`, `frame-ancestors 'none'`, HSTS in production. The UI is built with `createElement`/`textContent`, never `innerHTML`.
* Email addresses are never returned by public endpoints.

## Testing

```bash
npm run check        # type-check + all tests + production build
```

* **Type-check** — `tsc --checkJs` over server, shared, browser code and tests.
* **API tests** (auth, CSRF, validation, rate limiting, privacy, clan lifecycle, authorization matrix, capacity, mocked official API).
* **Frontend smoke tests** — runs the real browser modules against the real server using a small fake DOM: routing + auth guard, discovery filters/chips/URL sync/empty/error/retry states, register → onboarding, join / request / accept flows, member management, clan create/edit/delete, tabs + keyboard navigation, dialogs, mobile filter sheet.

**Not covered by automated tests:** real-browser rendering (CSS/layout), real touch devices, screen-reader behaviour, and the live Supercell API. Please click through it in a browser once after deploying.

## Known limitations / next steps

* **No password reset or email verification** — both need an email provider (SMTP/SendGrid). Until you add one, users who forget their password cannot recover the account.
* No moderation/admin tooling or report button yet.
* Rate limits and sessions live in one process/SQLite file → run a single instance (or move to Postgres + Redis to scale out).
* Fonts are system fonts. For a more game-like look, self-host an OFL display font such as *Lilita One* and add it to `--font-display` (CSP already allows same-origin fonts).
* The hero illustrations are AI-generated; swap `public/assets/*` for your own art any time.
* Max Town Hall is a single constant (`MAX_TH` in `shared/game.js`, currently 18).
