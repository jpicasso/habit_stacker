# Habit Stacker — iOS App (Capacitor)

This folder contains everything needed to ship **www.habitstackerapp.com** as an
iOS app on the App Store. It uses [Capacitor](https://capacitorjs.com/) to wrap
the live website in a native iOS shell.

**How it works:** the app opens a native WebView pointed at
`https://www.habitstackerapp.com` (see `server.url` in `capacitor.config.json`).
There is no separate mobile codebase — updates you deploy to the website appear
in the app automatically. The `www/` folder here is only an offline fallback
page.

---

## What's in this folder

| Path | What it is |
|------|------------|
| `capacitor.config.json` | App ID, app name, and the website URL the app loads |
| `package.json` | Capacitor dependencies and helper scripts |
| `www/` | Fallback page shown only if the site is unreachable |
| `ios/` | The generated native Xcode project (already created) |
| `ios/App/App.xcworkspace` | **The file you open in Xcode** (not `.xcodeproj`) |

---

## Prerequisites

1. **Mac with Xcode** — already installed (Xcode 26.3 detected).
2. **Node 20+** — you have Node 24 via nvm. In any new terminal, run:
   ```bash
   export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh" && nvm use 24
   ```
3. **CocoaPods** — already installed. Note: on this machine `pod install`
   requires a UTF-8 locale (see Troubleshooting).
4. **Apple Developer Program membership** — $99/year, required for the App
   Store. Enroll at https://developer.apple.com/programs/enroll/
   (can take 1–2 days to be approved).

## Step 1 — Run the app in the iOS Simulator

```bash
cd capacitor-app
npm install    
nvm alias default 24      
npx cap add ios      
npx cap sync ios     
npx cap open ios     
# install Capacitor
# generate the ios/ native project
# copy config + web assets into the iOS project
# opens Xcode with the project

# if you need to refresh the web app code
cd
export NVM_DIR=~/.nvm
source $(brew --prefix nvm)/nvm.sh
nvm install 24
nvm use 24
cd Dropbox/4_HabitStacker
rm -rf node_modules dist
npm install
npm run build
npm run dev
```

In Xcode:
1. At the top of the window, pick a simulator (e.g. **iPhone 17**).
2. Press **▶ (Run)** or `Cmd+R`.
3. The app should launch and load www.habitstackerapp.com.

Test everything: login (Supabase), signup, habits. The WebView behaves
like Safari, so anything that works in mobile Safari should work here.

## Step 2 — Run on your real iPhone

1. Plug in your iPhone via USB (or use wireless debugging).
2. In Xcode select your phone as the run target.
3. The first run will fail until you set up signing:
   - Click the **App** project in the left sidebar → **Signing & Capabilities** tab.
   - Check **Automatically manage signing**.
   - **Team:** select your Apple ID / developer team (add your Apple ID under
     Xcode → Settings → Accounts if it's not there).
4. Press Run. On the phone, approve the developer certificate the first time
   (Settings → General → VPN & Device Management).

## Step 3 — Supabase Auth configuration

Because the app loads the live site directly, Supabase sees the same origin
(`https://www.habitstackerapp.com`) as the regular website, so **login should
work with no extra mobile configuration**. Verify by logging in from the app.

If signup confirmation emails link to the wrong place, check in the Supabase
Dashboard (Authentication → URL Configuration) that:
- **Site URL** is `https://www.habitstackerapp.com`
- **Redirect URLs** include `https://www.habitstackerapp.com/**`

## Step 4 — App icon and launch screen

The App Store requires a 1024×1024 icon with no transparency.

1. Save your icon as `assets/icon-only.png` (1024×1024) and optionally
   `assets/splash.png` (2732×2732) inside this folder.
2. Generate all required sizes:
   ```bash
   npx capacitor-assets generate --ios
   ```
3. Re-sync and rebuild: `npx cap sync ios`, then run from Xcode.

## Step 5 — Prepare App Store Connect

1. Go to https://appstoreconnect.apple.com → **My Apps** → **+** → **New App**.
2. Fill in:
   - **Platform:** iOS
   - **Name:** Habit Stacker (must be unique on the App Store)
   - **Bundle ID:** `com.habitstackerapp.app` (register it at
     https://developer.apple.com/account/resources/identifiers if prompted)
   - **SKU:** anything, e.g. `habitstacker-001`
3. You will also need:
   - **Screenshots** — take these in the Simulator (`Cmd+S`) for a 6.7"/6.9"
     iPhone. At least one required.
   - **Privacy policy URL** — required because the app has accounts. Host a
     page on habitstackerapp.com (e.g. `/privacy.html`).
   - **App privacy details** — declare what you collect: email (Supabase
     account), user content (habits). All "linked to identity", none
     used for tracking.
   - **Demo account for review** — create a test account and put the
     credentials in the "App Review Information" notes. Reviewers must be able
     to log in.

## Step 6 — Upload the build

1. In Xcode, select **Any iOS Device (arm64)** as the destination.
2. Menu: **Product → Archive**.
3. When the Organizer window opens: **Distribute App → App Store Connect →
   Upload**. Accept the defaults.
4. Wait ~15–60 min for the build to finish processing in App Store Connect.

## Step 7 — TestFlight (recommended before submitting)

1. In App Store Connect → your app → **TestFlight** tab.
2. Add yourself as an internal tester; install the TestFlight app on your
   phone; install the build.
3. Use the app for a few days. Fix anything broken (website fixes deploy
   instantly; native/config changes require a new archive + upload).

## Step 8 — Submit for review

1. App Store Connect → **App Store** tab → create version **1.0**.
2. Attach the uploaded build, fill in the description, keywords, support URL.
3. **Submit for Review.** First reviews typically take 1–3 days.

### Avoiding rejection (important for wrapped sites)

Apple guideline 4.2 ("minimum functionality") is the main risk for web
wrappers. To improve your odds:
- The app is a focused habit-stacking tool, not a brochure site —
  emphasize this in the review notes.
- Make sure the site looks/feels good on a phone: no horizontal scrolling,
  touch-friendly buttons, no desktop-only UI.
- Everything must work: no dead links, no broken pages inside the app.
  Keep the app scoped to the habits experience.
- Provide the demo login so reviewers see the real product immediately.

If rejected, don't panic — read the reason, fix it, reply in the Resolution
Center. Many apps pass on the second try.

---

## Updating the app later

| Change | What to do |
|--------|-----------|
| Website content/features | Just deploy the website — the app updates automatically |
| App name, icon, URL, config | Edit here → `npx cap sync ios` → new Archive → upload |
| New Capacitor plugins (push, etc.) | `npm install` the plugin → sync → archive → upload |

---

## Troubleshooting

**No keyboard when tapping a text field (Simulator only)**
The iOS Simulator often hides the on-screen keyboard because it treats your
Mac keyboard as an attached hardware keyboard. Fix it with either:
- **I/O → Keyboard → Toggle Software Keyboard** (or press **⌘K**)
- **I/O → Keyboard → uncheck Connect Hardware Keyboard**

On a real iPhone the keyboard appears normally — no app change needed.

**`pod install` fails with "Unicode Normalization not appropriate for ASCII-8BIT"**
Run with a UTF-8 locale:
```bash
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8
```
(Consider adding those two exports to your `~/.zshrc`.)

**`npm`/`npx` uses the wrong Node version**
```bash
export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh" && nvm use 24
```

**White screen / fallback page in the app**
The device can't reach https://www.habitstackerapp.com — check the site is up
and the device has internet.

**Login fails in the app**
Check the Supabase URL configuration (Step 3) and that
`src/js/supabase-config.js` on the website has the correct project URL and
anon key.

**Build succeeds but changes don't appear**
Config or `www/` changes need `npx cap sync ios` before rebuilding in Xcode.

---

## Android later

When you're ready for Google Play:
```bash
npm install @capacitor/android
npx cap add android
npx cap sync android
```
Then open `android/` in Android Studio. The same config and website are reused.
