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
export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh" && nvm use 24
cd /Users/johnpicasso/Dropbox/4_HabitStacker/capacitor-app
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

# commit changes
git add . 
git commit -m "TBD"
git push origin master
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

## Step 3b — Push notifications (Capacitor iOS app)

The website’s PWA notifications (service worker + Web Push) **do not work** inside
the Capacitor iOS WebView. Apple only shows the notifications toggle in
**Settings → Habit Stacker → Notifications** after the **native** app requests
permission via `@capacitor/push-notifications`.

### One-time Xcode setup

1. Open the project: `npx cap open ios`
2. Select the **App** target → **Signing & Capabilities** → **+ Capability** →
   **Push Notifications**
3. Confirm **App.entitlements** includes `aps-environment` (already in this repo)

### One-time Apple Developer + server setup

1. [Apple Developer](https://developer.apple.com/account/resources/authkeys/list) →
   **Keys** → **+** → enable **Apple Push Notifications service (APNs)** →
   download the `.p8` file. Note the **Key ID** and your **Team ID**.
2. On Heroku (or your host), set env vars from `.env.example`:
   - `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_KEY_PATH` (or `APNS_KEY` with the `.p8` contents)
   - `APNS_BUNDLE_ID=com.habitstackerapp.app`
   - `APNS_PRODUCTION=true`
3. Deploy the latest website (`master`) so the live site includes the native
   push JavaScript in `daily-notifications.js`.

### Rebuild and test on your iPhone

```bash
cd capacitor-app
npx cap sync ios
npx cap open ios
```

Bump **Build** in Xcode, Archive, upload to TestFlight, install on your phone.

1. Log in to the app.
2. Tap anywhere once (or go to `/test.html` → **Enable notifications**).
3. Allow the iOS prompt.
4. **Settings → Notifications → Habit Stacker** should now appear with toggles.

Daily achievement messages are sent from the server via APNs when the cron runs
(`/api/cron/daily-achievements`), same as the PWA web-push path.

## Step 4 — App icon and launch screen

The App Store requires a 1024×1024 icon with no transparency. The project
already uses `../src/img/habit_stacker_icon.png` (copied to
`assets/icon-only.png`). To regenerate native icons after changing the PNG:

```bash
cp ../src/img/habit_stacker_icon.png assets/icon-only.png
npx capacitor-assets generate --ios
npx cap sync ios
```

Then rebuild/run from Xcode. The website “Add to Home Screen” icon uses the
same PNG via `apple-touch-icon` + `site.webmanifest` (deploy the website for
that to update).

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
   - **Promotional Text** -  
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
3. When the Organizer window opens: **Distribute App → App Store Connect → Upload**. Accept the defaults.
4. Wait ~15–60 min for the build to finish processing in App Store Connect.

## Step 7 — TestFlight (recommended before submitting)

TestFlight lets you install the uploaded build on your real iPhone **before**
App Store review. Use it to catch signing, login, and layout issues.

### Prerequisites

1. Finish **Step 6** (Archive → Upload). In App Store Connect → your app →
   **TestFlight**, wait until the build status is **Ready to Test** (not
   “Processing”). This often takes 15–60 minutes; sometimes longer.
2. If Apple shows a missing **compliance / export** questionnaire on the
   build, open it and answer (for this app: usually **None of the algorithms
   mentioned** / standard encryption only — follow the prompts).
3. Sign the latest **Paid Applications** / free agreements if App Store
   Connect banners ask you to (Account → Agreements).

### A. Add yourself as an internal tester

Internal testers must be on your App Store Connect team (Admin, Developer,
Marketing, or similar).

1. Go to https://appstoreconnect.apple.com → **My Apps** → **Habit Stacker**.
2. Open the **TestFlight** tab.
3. In the left sidebar under **Internal Testing**, click **+** (or
   **Create Group** if you have no group yet). Name it e.g. `Internal`.
4. Select that group → **Add Testers** (or the **+** next to Testers).
5. Add your own Apple ID email (the one you use on your iPhone).
6. Enable the group for the build: select the processed build (or turn on
   **Automatic Distribution** so new uploads go to the group).

You should get an email from TestFlight / App Store Connect inviting you.

### B. Install TestFlight and the app on your iPhone

1. On your iPhone, open the **App Store** and install **TestFlight**
   (Apple’s free app: search “TestFlight”).
2. Open the invite email on the phone (or open the link from iCloud Mail /
   Mail). Tap **View in TestFlight** / **Start Testing**.
   - Or open **TestFlight** → you should see **Habit Stacker** listed under
     Apps.
3. In TestFlight, tap **Habit Stacker** → **Install** (or **Update**).
4. When install finishes, tap **Open**. The icon also appears on your
   Home Screen like a normal app (with an orange TestFlight dot in some
   iOS versions).

### C. What to test

1. Cold launch, login / signup, load habits, add/edit/delete a habit.
2. Leave the app and return; confirm session still works.
3. Check the status-bar / notch area and keyboard on form fields.
4. Use it for a few days if you can.

**Website** fixes (HTML/CSS/JS on habitstackerapp.com) show up after a
refresh — no new TestFlight build needed.  
**Native** changes (icon, Capacitor config, bundle id, plugins) need a new
Xcode **Archive → Upload**, then install the new build from TestFlight.

### D. Common TestFlight issues

| Problem | What to do |
|--------|------------|
| Build stuck on Processing | Wait; check email for processing failures. Re-upload from Xcode if it fails. |
| “Missing compliance” | Complete the export-compliance questions on that build in TestFlight. |
| No invite / app not in TestFlight | Confirm your Apple ID is in the Internal group and the build is assigned to that group. |
| Can’t install | Same Apple ID on phone and in App Store Connect; enough storage; iOS version ≥ app’s minimum (14.0). |
| “Developer mode” / untrusted | Rare for TestFlight; for ad-hoc/dev installs use Settings → Privacy & Security → Developer Mode. |

### External testers (optional)

To share with people **outside** your App Store Connect team: create an
**External Testing** group, add their emails, and submit the build for
Apple’s brief TestFlight review (often a few hours). Internal testing does
**not** need that review — prefer Internal for yourself.

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
| Website content/features (habits, achievements/belts, copy, CSS) | Deploy the website to Heroku/`master` — the app loads the live site and picks them up after a refresh. **No new App Store build required** unless you also want a store listing version bump. |
| App name, icon, splash, URL, config, native plugins | Edit here → bump version (below) → `npx cap sync ios` → Archive → upload |
| New store listing version (required to re-submit to Apple) | Bump `MARKETING_VERSION` / `CURRENT_PROJECT_VERSION` → sync → Archive → upload → submit (see **Uploading a new version to the App Store**) |

### Version numbers (this release)

| Field | Value | Where |
|-------|-------|--------|
| Marketing version (user-facing) | **1.1.0** | Xcode → App target → General → Version, or `MARKETING_VERSION` in `ios/App/App.xcodeproj/project.pbxproj` |
| Build number (must increase every upload) | **2** | Xcode → Build, or `CURRENT_PROJECT_VERSION` in the same file |
| npm package version | **1.1.0** | `package.json` |

Each App Store Connect upload needs a **higher build number** than any build already uploaded for that app (even if the marketing version stays the same).

---

## Uploading a new version to the App Store

Use this checklist whenever you want Apple to review a new binary (e.g. after native changes, or when you want the store listing to show **1.1.0** after website updates like achievements / karate belts).

### 0. Confirm the website is live first

The iOS app WebView loads `https://www.habitstackerapp.com`. Before you archive:

1. Push / deploy the latest web app to production (you already pushed to `master`).
2. Open https://www.habitstackerapp.com on a phone browser and smoke-test:
   - Login / signup
   - Habits list (colors / days kept)
   - **Achievements** inbox and belt milestones
   - Homepage / habits “How the app works” content
3. Fix anything broken on the site **before** submitting the app — reviewers will see the live site inside the app.

### 1. Sync this Capacitor project

```bash
export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh" && nvm use 24
cd /Users/johnpicasso/Dropbox/4_HabitStacker/capacitor-app
npm install
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8
npx cap sync ios
```

If you changed the app icon PNG:

```bash
cp ../src/img/habit_stacker_icon.png assets/icon-only.png
npx capacitor-assets generate --ios
npx cap sync ios
```

### 2. Bump version / build (if not already done)

In Xcode (**open with `npx cap open ios`**):

1. Open the **General** settings for the App target:
   1. In the **left sidebar** (Project Navigator), click the blue **App** project icon at the very top of the file tree (it sits above folders like `App`, `CapApp-SPM`, `Pods`).
   2. In the **middle pane**, you should see two columns: **PROJECT** and **TARGETS**. Under **TARGETS**, click **App** (the one with the app icon — not “Pods-*”).
   3. Along the top of that middle pane, click the **General** tab (next to Signing & Capabilities, Info, Build Settings, etc.).
2. Set **Version** to the marketing version (e.g. `1.1.0`).
3. Set **Build** to an integer **higher than the last uploaded build** (e.g. `2`, then `3`, …).

Or edit both Debug and Release in `ios/App/App.xcodeproj/project.pbxproj`:

- `MARKETING_VERSION = 1.1.0;`
- `CURRENT_PROJECT_VERSION = 2;`

Also keep `package.json` `"version"` in sync for your own bookkeeping.

### 3. Smoke-test in Simulator / on device

```bash
npx cap open ios
```

1. Pick a simulator or your iPhone → **Run** (`Cmd+R`).
2. Confirm the live site loads, login works, habits and Achievements work.
3. Signing: **Signing & Capabilities** → Automatically manage signing → Team `9TDJJ3V4DD` (or your team).

### 4. Archive and upload to App Store Connect

1. In Xcode, set the run destination to **Any iOS Device (arm64)** (not a simulator).
2. Menu: **Product → Archive**. Wait for the archive to finish.
3. Organizer opens automatically. Select the new archive → **Distribute App**.
4. Choose **App Store Connect** → **Upload** → Next.
5. Keep defaults (automatically manage signing, upload symbols, etc.) unless you have a reason to change them → **Upload**.
6. Wait until Xcode reports a successful upload.

Optional CLI alternative (after Archive exists): **Window → Organizer**, or use Transporter / `xcrun altool` / `notary` flows — Xcode Organizer is the simplest path.

### 5. Wait for processing in App Store Connect

1. Go to https://appstoreconnect.apple.com → **My Apps** → **Habit Stacker**.
2. Open **TestFlight**. The new build appears as **Processing**, then **Ready to Test** (often 15–60 minutes).
3. If Apple asks for **export compliance**, answer it. This project sets `ITSAppUsesNonExemptEncryption` to `false` in `Info.plist` so you can usually select that you only use standard/exempt encryption.

### 6. (Recommended) Install via TestFlight and re-test

1. Assign the build to your **Internal Testing** group (or enable Automatic Distribution).
2. On your iPhone, open **TestFlight** → **Habit Stacker** → **Update** / **Install**.
3. Re-test login, habits, Achievements / belts, and cold launch.

### 7. Create the App Store version and submit

1. App Store Connect → **Habit Stacker** → **App Store** tab (Distribution).
2. Click **+ Version** or **Add Version** if needed. Enter the marketing version (**1.1.0**).
3. **Build:** click the build picker and select the build you just uploaded (build **2**).
4. Update listing fields for this release:
   - **What’s New in This Version** — example:

     > Track milestone belts as you keep habits (white through black), see achievements in your inbox, and learn how stacking works on the habits screen.

   - Screenshots — refresh if the UI changed (Simulator `Cmd+S`).
   - Description / keywords — mention habits, streaks, belts / achievements if you want.
   - Privacy policy URL — still `https://www.habitstackerapp.com/privacy.html` (or your live privacy page).
   - App Review notes — include a **demo account** email/password so reviewers can log in.
5. Answer any Age Rating / Privacy questionnaires if prompted (email account, user-generated habits content; no tracking ads).
6. Click **Add for Review** / **Submit for Review**.

### 8. After approval

1. Choose release: **Automatically release** or **Manually release this version**.
2. When live, verify from a clean App Store install (not only TestFlight).
3. For the *next* upload, bump **Build** again (e.g. to `3`). Bump **Version** only when you want a new user-facing version string.

### Quick reference — do I need a new upload?

| You changed… | New App Store upload? |
|--------------|------------------------|
| HTML/CSS/JS on the website only | No (deploy site). Optional if you want “What’s New” marketing. |
| `capacitor.config.json`, icon, splash, Info.plist, plugins, signing | **Yes** |
| You want App Store “Version 1.1.0” / release notes | **Yes** |

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
