# Habit Stacker — what you need to configure


This file lists **only the things you must do yourself** after the code was switched from Uprise University / Auth0 to Habit Stacker / Supabase Auth.

The app will not log users in until steps 1–3 are done.

---

## Checklist

- [ ] 1. Create (or open) your **new** Supabase project
- [ ] 2. Create the `habits` table (and optional tables)
- [ ] 3. Put **server** keys in `.env`
- [ ] 4. Put **browser** keys in `src/js/supabase-config.js`
- [ ] 5. Configure Supabase **Auth** (email + URLs)
- [ ] 6. Build and test locally
- [ ] 7. Set the same env vars on your **host** (production)
- [ ] 8. Point DNS / host to **www.habitstackerapp.com**
- [ ] 9. (Optional) iOS app — see `capacitor-app/README.md`

---

## 1. New Supabase project

1. Go to [https://supabase.com](https://supabase.com) → **New project**.
2. Name it something like `habit-stacker` (not the old Uprise project).
3. Save the database password somewhere safe.
4. Wait until the project is ready.

You are starting fresh: old Auth0 users and the old Supabase data do **not** transfer automatically. Users will need new accounts (same email is fine).

---

## 2. Create tables

In Supabase → **SQL Editor**, run the SQL in **[SUPABASE_SETUP.md](./SUPABASE_SETUP.md)**.

For a habits-only launch you only need the `habits` table. The other tables (`goals_*`, `feedback`, etc.) are optional leftovers from the old app.

---

## 3. Server keys (never put these in the browser)

In Supabase → **Project Settings → API**, copy:

| Value | Goes in |
|-------|---------|
| Project URL | `SUPABASE_URL` |
| `service_role` key (**secret**) | `SUPABASE_SERVICE_ROLE_KEY` |

Create a file named `.env` in the project root (it is gitignored):

```bash
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
```

Or copy from the template:

```bash
cp .env.example .env
# then edit .env with your real values
```

Restart the Node server after changing `.env`.

---

## 4. Browser keys (safe to ship; still do not commit real keys if you prefer)

In the same API settings page, copy:

| Value | Goes in |
|-------|---------|
| Project URL | `src/js/supabase-config.js` → `url` |
| `anon` `public` key | `src/js/supabase-config.js` → `anonKey` |

Edit `src/js/supabase-config.js`:

```js
window.SUPABASE_PUBLIC_CONFIG = {
  url: 'https://YOUR_PROJECT_REF.supabase.co',
  anonKey: 'YOUR_SUPABASE_ANON_PUBLIC_KEY'
};
```

**Do not** paste the `service_role` key here. That key must stay on the server only.

After editing, rebuild so `dist/` picks it up:

```bash
npm run build
```

---

## 5. Supabase Auth settings

In Supabase → **Authentication**:

### Email provider

1. **Providers → Email** — enabled.
2. For local testing you can turn **off** “Confirm email” so signup logs in immediately.
3. For production, decide whether you want email confirmation (if on, users must click the email link before logging in).

### URL configuration

**Authentication → URL Configuration:**

| Field | Value |
|-------|--------|
| Site URL | `https://www.habitstackerapp.com` |
| Redirect URLs | `https://www.habitstackerapp.com/**` |
| | `http://localhost:3000/**` |
| | `http://localhost:3001/**` |

Also add any preview / staging URLs you use.

---

## 6. Build and test locally

```bash
export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh" && nvm use 14
npm install
npm run build
npm run dev
```

Open http://localhost:3001 and verify:

1. Homepage shows Habit Stacker branding and the habit-stacking explanation.
2. **Sign up** → creates an account in Supabase → Auth → Users.
3. **My Habits** → add / edit / delete a habit; it appears in the Supabase `habits` table.
4. **Logout** / **Login** work.
5. Browser console has no “Supabase is not configured” error.

---

## 7. Production host env vars

Wherever the Express app runs (Heroku, Railway, Render, etc.), set the **same** two variables:

```bash
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
```

Redeploy / restart after saving.

Confirm production also serves a built `dist/` that includes your filled-in `supabase-config.js` (anon key). If the host builds from git, either:

- Commit the anon key in `src/js/supabase-config.js` (common for public anon keys), **or**
- Inject it at build time (more advanced).

The anon key is designed to be public; the service role key must never be in `src/` or git.

---

## 8. Domain: www.habitstackerapp.com

1. Point DNS for `habitstackerapp.com` / `www` at your host.
2. Enable HTTPS.
3. Double-check Supabase Site URL / Redirect URLs (step 5).
4. Update Capacitor if needed (`capacitor-app/capacitor.config.json` already uses this domain).

---

## 9. What changed from the old app (reference)

| Old | New |
|-----|-----|
| Auth0 login redirects | Supabase email/password on `/login.html` |
| `src/js/auth0-config.js` | `src/js/supabase-config.js` + `src/js/supabase-auth.js` |
| www.upriseu.com / Uprise University | www.habitstackerapp.com / Habit Stacker |
| Course / goals content | Habits-focused product |
| GitHub `UpriseU2026` | GitHub `habit_stacker` |

---

## Node 14 reset (if `npm run build` / Gulp crashes)

```bash
cd
export NVM_DIR=~/.nvm
source $(brew --prefix nvm)/nvm.sh
nvm install 14.4.0
nvm use 14
cd Dropbox/4_HabitStacker   # or your path to this repo
rm -rf node_modules dist
npm install
npm run build
npm run dev
```
