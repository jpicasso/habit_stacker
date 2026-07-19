# Habit Stacker

Build habits that stick by stacking them onto routines you already have.

**Live site:** [www.habitstackerapp.com](https://www.habitstackerapp.com)

Habit stacking pairs a new behavior with an existing automatic daily routine, so an established habit becomes the trigger and you rely less on willpower.

## What this app does

- Sign up / log in with **Supabase Auth** (email + password)
- Create habits with a start date
- Track streaks (days kept), with color levels at 1 / 21 / 100 / 365 days
- Persist habits in **Supabase** (PostgreSQL)

## Tech stack

| Layer | Tech |
|-------|------|
| Frontend | HTML, Bootstrap, jQuery, Panini templates |
| Build | Gulp → `dist/` |
| API | Express (`server.js`) |
| Auth | Supabase Auth (browser client + server JWT check) |
| Database | Supabase (`habits` table); SQLite fallback for local habits only |
| iOS wrapper | Capacitor in `capacitor-app/` |

## First-time setup (you must do this)

Follow **[README_SETUP.md](./README_SETUP.md)** — that file is the checklist for:

1. Creating / configuring your **new Supabase project**
2. Filling in browser keys (`src/js/supabase-config.js`)
3. Filling in server keys (`.env`)
4. Enabling Auth + redirect URLs for `habitstackerapp.com`
5. Building and running locally
6. Deploying to production

Database table SQL is in **[SUPABASE_SETUP.md](./SUPABASE_SETUP.md)**.  
iOS App Store steps are in **[capacitor-app/README.md](./capacitor-app/README.md)**.

## Local development

```bash
# Use Node 14 for this web app (via nvm)
export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh" && nvm use 14

npm install
npm run build
npm run dev
```

- App (with live reload): http://localhost:3001  
- Express API: http://localhost:3000  

If Gulp/Node is broken on your Mac, see the Node 14 reset steps at the bottom of `README_SETUP.md`.

## Project layout

```
src/pages/          # index, login, habits
src/js/             # supabase-config.js, supabase-auth.js, …
src/partials/       # navbar, footer
src/layouts/        # default HTML shell
dist/               # generated site (served by Express) — do not edit by hand
capacitor-app/      # iOS Capacitor wrapper
supabase-*.js       # server-side Supabase helpers
server.js           # Express API + static hosting
```

## Deploy (production)

1. Complete `README_SETUP.md` (Supabase Auth + env vars on the host).
2. Point the host at this repo; set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
3. Build (`npm run build`) and start (`npm start`) — or use your host’s build command.
4. Confirm the site is served at **https://www.habitstackerapp.com**.
5. In Supabase Auth → URL Configuration, set Site URL / Redirect URLs to that domain.

GitHub repo for this product: `https://github.com/jpicasso/habit_stacker`
