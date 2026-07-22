# Habit Stacker — React Native (Expo)

This folder is a **native-friendly rebuild** of Habit Stacker using
[Expo](https://expo.dev) + [Expo Router](https://docs.expo.dev/router/introduction/)
+ React Native. It keeps the **same backend** as the existing website:

- **Supabase Auth** (email/password, session, password reset)
- **Express API** on `https://www.habitstackerapp.com` for habits CRUD and
  account deletion (`Authorization: Bearer <access_token>`)

The Capacitor wrapper in `../capacitor-app` loads the website in a WebView.
This React Native app is a real native UI that talks to the same APIs.

---

## What’s included

| Area | Behavior (matches the web app) |
|------|--------------------------------|
| Login / Sign up / Forgot password | Supabase Auth |
| Habits list | Sorted by start date (newest first); streak row colors |
| Add habit | Defaults start date to **today** (`YYYY-MM-DD`) |
| Edit / delete habit | Tap a row → edit screen; delete with confirm |
| Settings | Log out, privacy policy link, delete account |
| Delete account | Type `DELETE` → `POST /api/account/delete` → sign out |
| Web | Same codebase via `expo start --web` / static export |

**Streak colors** (same thresholds as `src/pages/habits/habits.js`):

| Days kept | Background | Text |
|-----------|------------|------|
| ≥ 365 | `#000000` | white |
| ≥ 100 | `#006600` | white |
| ≥ 21 | `#00b300` | white |
| ≥ 1 | `#80ff80` | black |
| 0 | white | black |

---

## How the code works

```
react-app/
├── app/                      # Expo Router screens (file-based routes)
│   ├── _layout.tsx           # Root: AuthProvider + stack
│   ├── index.tsx             # Redirect: session → habits, else → login
│   ├── (auth)/
│   │   ├── login.tsx         # login | signup | forgot
│   │   └── reset-password.tsx
│   └── (app)/                # Requires session
│       ├── _layout.tsx       # Tabs: Habits | Settings
│       ├── habits/index.tsx  # List + add form
│       ├── habits/[id].tsx   # Edit / delete
│       └── settings/…
├── context/AuthContext.tsx   # Session + auth helpers
├── lib/
│   ├── supabase.ts           # Supabase JS client (AsyncStorage sessions)
│   ├── api.ts                # fetch() to Express /api/*
│   └── dates.ts              # today / formatDateShort / daysSince
├── constants/theme.ts        # Brand blue #136bfb + streak helpers
├── components/ui.tsx         # Shared buttons, inputs, banners
├── .env.example              # Public env vars template
├── app.json                  # Expo config (bundle id, scheme, icon)
└── eas.json                  # EAS Build / Submit profiles
```

### Auth flow

1. `AuthProvider` creates a Supabase client and listens with
   `onAuthStateChange`.
2. Session (including `access_token`) is stored with AsyncStorage so it
   survives app restarts.
3. `(app)/_layout` redirects to login if there is no session.
4. `(auth)/_layout` redirects to habits if already signed in.

### Habits API flow

1. Screen calls `useAuth()` → `accessToken` + `user.email`.
2. `lib/api.ts` calls:
   - `GET  /api/habits`
   - `POST /api/habits`
   - `PUT  /api/habits/:id`
   - `DELETE /api/habits/:id`
   - `POST /api/account/delete`
3. Every request sends `Authorization: Bearer <token>`.
4. The Express server verifies the JWT (`supabase-auth-server.js`) and
   scopes habits to `req.user.email` — same as the website.

### Environment variables

Copy `.env.example` to `.env` (already matches production public keys):

| Variable | Purpose |
|----------|---------|
| `EXPO_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Supabase **anon** key (public) |
| `EXPO_PUBLIC_API_BASE_URL` | Express origin, e.g. `https://www.habitstackerapp.com` |

Never put `SUPABASE_SERVICE_ROLE_KEY` in this app.

For **local API** testing against `npm run dev` in the repo root:

```bash
EXPO_PUBLIC_API_BASE_URL=http://localhost:3000
```

On a physical phone, `localhost` is the phone itself — use your Mac’s LAN IP
instead (e.g. `http://192.168.1.20:3000`) and ensure the Express server is
reachable.

### Deep links / password reset

`app.json` sets `"scheme": "habitstacker"`. Forgot-password emails should
redirect to a URL Expo can open (see Supabase Dashboard → Authentication →
URL Configuration). Add:

- `habitstacker://reset-password`
- Your Expo web URL if you host the web export
- Existing `https://www.habitstackerapp.com/reset-password.html` still works
  for the classic website

---

## Prerequisites

1. **Node 20+** (this repo uses Node 24 via nvm).
2. **Xcode** (for iOS Simulator / device builds).
3. **Expo account** (free) for EAS Build / App Store uploads:
   https://expo.dev/signup

```bash
   # Connect your project - Run the following command to connect your project and use Expo services:
   npx eas-cli@latest init --id 2fd15702-e7b9-42de-8f85-6a6b12f6ef93
   # Create a production build Run the following command to create a production build:
   npx eas-cli@latest build --profile production
```

4. Apple Developer Program ($99/year) for App Store / TestFlight.

```bash
export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh" && nvm use 24
cd /Users/johnpicasso/Dropbox/4_HabitStacker/react-app
cp .env.example .env   # if needed
npm install
```

---

## Test on the iOS Simulator (iPhone)

### Option A — Expo Go (fastest for UI/API work)

1. Start Metro:
   ```bash
   cd react-app
   npx expo start
   ```
2. Press **`i`** in the terminal to open the **iOS Simulator**, or click
   **Open in iOS simulator** in the Expo Dev Tools.
3. The app loads inside Expo Go. Sign in with a real Habit Stacker account.
4. Shake the device / press **Cmd+D** for the dev menu (reload, etc.).

If the simulator keyboard doesn’t appear: Simulator menu
**I/O → Keyboard → Toggle Software Keyboard** (⌘K).

### Option B — Development build (closer to production)

```bash
npm install -g eas-cli
eas login
eas build --profile development --platform ios
```

Or run a local native project (generates `ios/`):

```bash
npx expo run:ios
```

Requires Xcode and CocoaPods. Use this when you need native modules that
Expo Go doesn’t include.

### Useful checks in the simulator

- Log in / sign up / log out
- Add a habit (date defaults to today)
- Tap a row → edit → save / delete
- Pull to refresh the list
- Settings → Privacy (opens the live website policy)
- Settings → Delete account (careful — permanent)

---

## Deploy to the App Store (iOS)

This uses [EAS Build](https://docs.expo.dev/build/introduction/) +
[EAS Submit](https://docs.expo.dev/submit/introduction/), which replace the
manual Xcode Archive flow used by the Capacitor app.

### 1. Configure the Expo project

```bash
cd react-app
npm install -g eas-cli
eas login
eas init          # creates/links an EAS project; paste the projectId into app.json → extra.eas.projectId
```

Confirm in `app.json`:

- `ios.bundleIdentifier`: `com.habitstackerapp.app` (same as Capacitor, or
  choose a new id if you want a separate App Store listing)
- `version` / iOS `buildNumber` as needed

### 2. Create the app in App Store Connect

If you don’t already have a listing (from the Capacitor work):

1. https://appstoreconnect.apple.com → **My Apps** → **+** → **New App**
2. Bundle ID: `com.habitstackerapp.app`
3. Fill privacy policy URL: `https://www.habitstackerapp.com/privacy.html`
4. Note the numeric **Apple ID** of the app → put it in `eas.json` →
   `submit.production.ios.ascAppId`

### 3. Production build

```bash
eas build --platform ios --profile production
```

EAS signs the app with your Apple team (you’ll be prompted to create/manage
credentials the first time). When the build finishes, download the `.ipa` or
submit directly.

### 4. Submit to App Store Connect / TestFlight

```bash
eas submit --platform ios --profile production --latest
```

Or in App Store Connect, wait for processing, then use **TestFlight** the same
way as described in `../capacitor-app/README.md` (internal tester → install
TestFlight → Install).

### 5. App Review notes

- Provide a **demo login** (email + password) in App Review Information.
- Point reviewers at the habits experience (add / edit / streak colors).
- Privacy policy URL and delete-account path are already in the app.

Website-only content changes still deploy via the Express/`dist` site.
**Native UI changes** require a new EAS build + submit.

---

## Deploy to Heroku as www.habitstackerapp.com

Your Heroku app already runs `node server.js` (see root `Procfile`). That server
exposes `/api/*` **and** serves whatever is in the root `dist/` folder.

The repo is wired so **`heroku-postbuild` builds the Expo web app into `dist/`**:

```json
"heroku-postbuild": "npm run build:web"
"build:web": "npm --prefix react-app ci && npm --prefix react-app run export:web"
```

`react-app` exports with `--output-dir ../dist`, so production HTML/JS replaces
the old Gulp marketing site. Same Express process still handles habits CRUD.

### 1. Set Heroku config vars (required for the web build)

Expo bakes `EXPO_PUBLIC_*` in at **build** time. Set them on the Heroku app
**before** (or and then) you deploy:

```bash
heroku config:set \
  EXPO_PUBLIC_SUPABASE_URL=https://dexwkysbqkjokfwuhmcl.supabase.co \
  EXPO_PUBLIC_SUPABASE_ANON_KEY="YOUR_ANON_KEY" \
  EXPO_PUBLIC_API_BASE_URL=https://www.habitstackerapp.com \
  -a YOUR_HEROKU_APP_NAME
```

Keep the existing server secrets too:

```bash
heroku config:get SUPABASE_URL -a YOUR_HEROKU_APP_NAME
heroku config:get SUPABASE_SERVICE_ROLE_KEY -a YOUR_HEROKU_APP_NAME
```

(Those must already be set for `/api/habits` to work.)

### 2. Deploy

From the **repo root** (not only `react-app/`):

```bash
git add -A
git commit -m "Serve Expo web app from Heroku dist/"
git push heroku HEAD:main
# or: git push origin main   # if Heroku auto-deploys from GitHub
```

Watch the build log: you should see `expo export` write into `dist/`.

### 3. Verify

1. Open https://www.habitstackerapp.com — you should get the React login/habits UI.
2. Log in and confirm habits load (API is same-origin, no CORS issue).
3. Settings → Privacy should open `/privacy`.

### 4. Supabase Auth URLs

In Supabase → Authentication → URL Configuration:

- **Site URL:** `https://www.habitstackerapp.com`
- **Redirect URLs** include:
  - `https://www.habitstackerapp.com/**`
  - `https://www.habitstackerapp.com/reset-password`
  - (optional) Expo scheme for native: `habitstacker://**`

### Local preview of the same build

```bash
cd /Users/johnpicasso/Dropbox/4_HabitStacker
npm run build:web          # writes react-app export → ./dist
EXPO_PUBLIC_API_BASE_URL=http://localhost:3000 npm run build:web   # optional
node server.js             # http://localhost:3000
```

### Notes / tradeoffs

| Topic | Detail |
|-------|--------|
| Old Gulp site | No longer built on Heroku. Marketing HTML in `src/pages` is not what Heroku serves unless you change `heroku-postbuild` back. |
| Capacitor app | Still loads `https://www.habitstackerapp.com` — it will show this React UI inside the WebView. |
| Node version | Root `engines.node` is `>=20`. Set Heroku to Node 20+ (`heroku config:set NODE_VERSION=24` or an `engines`/`package.json` Heroku understands). |
| Rebuild after UI changes | Push again, or `heroku builds:create`, so `expo export` re-runs. |

---

## Deploy as a website (other hosts)

Expo can also export a static web app for Netlify/Vercel/etc. For
**habitstackerapp.com on Heroku**, prefer the section above (API + UI together).

### Local web preview (Metro)

From the `react-app` folder:

```bash
npx expo start --web
```

Opens http://localhost:8081. API calls go to `EXPO_PUBLIC_API_BASE_URL` (needs
CORS on the API if that origin differs — already configured for localhost:8081
in `server.js` after you deploy that change).

### Standalone static export (non-Heroku)

```bash
cd react-app
npx expo export -p web
```

By default this repo’s script writes to the **monorepo** `../dist` for Heroku.
For a separate host, you can override the output dir as needed.

---

## Scripts reference

| Command | What it does |
|---------|----------------|
| `npm start` / `npx expo start` | Dev server (choose iOS / Android / web) |
| `npm run ios` | Open iOS Simulator |
| `npm run web` | Open web |
| `npm run export:web` | Static web export for hosting |
| `eas build -p ios --profile production` | App Store / TestFlight binary |
| `eas submit -p ios --latest` | Upload latest build to App Store Connect |

---

## Relationship to the rest of the monorepo

| Folder | Role |
|--------|------|
| `src/` + `server.js` | Original website + Express API (**backend of record**) |
| `capacitor-app/` | WebView shell around the live website |
| **`react-app/`** | Native React UI using the same Auth + API |

You can ship **both** Capacitor and React Native during migration, or retire
Capacitor once this app is on TestFlight / the App Store.

---

## Troubleshooting

**“Supabase is not configured”**  
Ensure `react-app/.env` exists and restart `expo start` (env is inlined at
bundle time).

**Habits fail with 401 / JWT errors**  
Log out and back in. Confirm `EXPO_PUBLIC_API_BASE_URL` points at the server
that has `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` set. Phone clock should
be set to Automatic.

**Simulator can’t reach API**  
If using a LAN IP for local Express, allow incoming connections and use
`http://<mac-ip>:3000` — not `localhost` — on a physical device.

**`npx cap …` errors**  
Those commands belong in `capacitor-app/`, not here. This app uses Expo/EAS.

**Typecheck**

```bash
npx tsc --noEmit
```
