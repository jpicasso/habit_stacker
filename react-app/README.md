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

## Deploy as a website (web app)

Expo can export a static web app (React Native Web) from this same codebase.

### Local web preview

From the `react-app` folder (don’t `cd react-app` again if you’re already there):

```bash
npx expo start --web
```

Opens a browser at http://localhost:8081. If Metro crashes with
`window is not defined`, pull the latest `lib/supabase.ts` (SSR-safe storage)
and restart.

### Production static export

```bash
cd react-app
npx expo start --web
```

Output lands in `dist/` (or `web-build/` depending on Expo version — check the
command summary). Host that folder on any static host:

| Host | Idea |
|------|------|
| **Netlify / Vercel / Cloudflare Pages** | Drag-and-drop or connect the `react-app` repo; build command `npx expo export -p web`, publish directory `dist` |
| **Your existing Express server** | Copy export into e.g. `dist-rn/` and serve it at a path or subdomain |
| **GitHub Pages** | Upload the export; set `baseUrl` / Expo `experiments` if the app is not at domain root |

### Web “Add to Home Screen”

`app/+html.tsx` sets `theme-color`, viewport-fit, and apple web app meta tags.
After hosting on HTTPS, Safari → Share → **Add to Home Screen** uses the
exported favicon / icons.

### Important web notes

1. Set `EXPO_PUBLIC_API_BASE_URL` to your live API origin.
2. In Supabase Auth → Redirect URLs, add your web app origin
   (e.g. `https://app.habitstackerapp.com/**`).
3. CORS: `server.js` allows Expo web origins (`http://localhost:8081`, etc.)
   and the production site. Deploy that server change for
   `localhost` → `https://www.habitstackerapp.com` API calls to work.
   Extra origins: set `CORS_ORIGINS` on the host (comma-separated).
   Same-origin hosting (or a reverse proxy) also works without relying on CORS.

Example same-host approach: serve the Expo export at
`https://www.habitstackerapp.com/app/` behind Express/static, or use a
subdomain with CORS enabled for `/api/*`.

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
