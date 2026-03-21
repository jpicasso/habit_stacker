# Goals Tracker page — developer overview

This document summarizes **user-facing behavior**, **DOM IDs** (including those created by JavaScript), **assets and scripts**, and **important functions** for the Goals Tracker (`goals_tracker.html`). **Section 4** is a dedicated walkthrough of `goals-table-load.js` (`loadGoals` / `addGoalForm`).

---

## 1. Key user functionality and journeys

### Auth gate

- Unauthenticated users see `#login-required-message` and can use **Log In** (`handleLogin` from shared auth scripts).
- After Auth0 succeeds, `#private-content` is shown and scripts load user-specific data.

### Module pills (habit stacker nav)

- Pills `#stopwatch-card-pill`, `#working-card-pill`, `#calories-today-card-pill`, `#goals-section-pill` toggle visibility of the four cards (`#stopwatch-card`, `#working-card`, `#calories-today-card`, `#goals-section`).
- Choice is stored in `module_visibility` (Supabase `temporary_variables` + local pattern in code).

### Stopwatch

- Start / pause / reset updates `#stopwatch-display`; elapsed time can be **Submit**’d into the working “minutes” flow and related goals logic.

### Working table

- Editable cells: `#minutes_value`, `#daily-hours-value`, `#working_start` (yellow `.goals-cell-box` overlays) open modals to set values.
- Derived rows: **Expected Done**, **Projected Done**, **Delta** (`#expected-done-value`, `#projected-done-value`, `#delta-to-expected-done-value`) update from start time, daily hours, and minutes worked.

### Calories today

- Six meal rows (`meal1`–`meal6` / `calories1`–`calories6`) plus `#total-calories`.
- Clicking a data row opens `#caloriesRowEditModal`; saves mirror to local storage and Supabase, then can push today’s total into a **Calories** goal cell for the current day.

### Goals table

- User sets the week via `#goals-table-date-input` (Sunday). Changing the date reloads the table (`loadGoals`).
- **Add goal**: `#goal-form` / `#goal-input` → POST new goal name into `goal1`…`goal8` slot via API → table rebuilds.
- **Per goal row** (built by JS): click **goal name** to edit/delete goal; click **day / target** yellow cells to set values; click **grey >< cell** to choose `>` or `<` for delta direction; totals and **Delta** column update after edits.
- **Charts**: one bar chart shows last-12-month aggregates for goal 1 (`#goal1-bar-chart`).

### Typical journeys

| Journey | What happens |
|--------|----------------|
| First login | `updateContentVisibility` runs → `loadGoals`, charts, `loadMinutesValueFromSupabase`; DOMContentLoaded restores modules, calories, working values, stopwatch state. |
| Add a goal | Submit `#goal-form` → `addGoalForm` → `loadGoals` rebuilds rows. |
| Log a day value | Click cell → modal → POST `/api/goals/values` with `goal_name`, `date`, `value` (goal_name must match slug prefix used in cell `id`). |
| Change week | Change Sunday date → `loadGoals` recomputes Sun–Sat column IDs and refetches values. |
| Time worked → Hours goal | Stopwatch submit or minutes modal → `submitTimeWorked` finds a goal cell whose id contains `"hours"` and today’s date, writes computed hours. |
| Calories → Calories goal | After calories edits, `submitTodaysCalories` finds a goal cell whose id contains `"calories"` and today’s date. |

---

## 2. Important IDs: layout, tables, and JS-generated cells

### Page shell (from layout / auth)

| ID | Role |
|----|------|
| `#private-content` | Main authenticated content wrapper (toggled by auth). |
| `#login-required-message` | Shown when not logged in. |

### Module cards and nav

| ID | Role |
|----|------|
| `#habit-stacker-nav-pills` | Pill container. |
| `#stopwatch-card-pill`, `#working-card-pill`, `#calories-today-card-pill`, `#goals-section-pill` | Pill links; `moduleId` = id with `-pill` removed. |
| `#stopwatch-card`, `#working-card`, `#calories-today-card`, `#goals-section` | Toggled sections (must match keys in `moduleVisibility`). |
| `#flex-modules-container-stopwatch` | Flex wrapper for first three modules. |

### Stopwatch

| ID | Role |
|----|------|
| `#stopwatch-display` | Elapsed time text. |
| `#stopwatch-start`, `#stopwatch-pause`, `#stopwatch-reset`, `#stopwatch-submit` | Buttons. |

### Working table `#working-table`

| ID | Role |
|----|------|
| `#minutes_value` | Editable minutes (`.goals-cell-box`). |
| `#daily-hours-value` | Daily hours goal. |
| `#working_start` | Start time string. |
| `#expected-done-value`, `#projected-done-value`, `#delta-to-expected-done-value` | Computed cells. |

### Calories table `#calories-today-table`

| ID | Role |
|----|------|
| `#meal1` … `#meal6` | Meal labels. |
| `#calories1` … `#calories6` | Calorie cells (editable via modal). |
| `#total-calories` | Sum row. |

### Goals section

| ID | Role |
|----|------|
| `#goals-section` | Goals card wrapper. |
| `#goals-table-date-input` | Sunday date for the week (may be hidden; still drives `loadGoals`). |
| `#goals-table` | Main goals table; **`tbody` rows are replaced by JS** when goals exist. |
| `#goal-form`, `#goal-input` | Add new goal. |
| `#goal1-chart-title`, `#goal1-bar-chart` | Goal 1 chart title + canvas. |

### Modals (forms)

| Modal ID | Purpose |
|----------|---------|
| `#goalsCellModal` | Set value for a selected goals table cell (`#goals-cell-value-form`, `#goals-cell-value-input`, `#goals-cell-id-display`). |
| `#goalEditModal` | Edit goal name, format, delete (`#goal-edit-form`, `#goal-edit-value-input`, `#goals-cell-format-select`, `#goal-edit-delete-btn`). |
| `#caloriesRowEditModal` | Edit meal + calories row. |
| `#plusMinusModal` | Set `>` or `<` for comparison column (`#plusminus-form`, `#plusminus-select`). |
| `#minutesWorkModal`, `#dailyHoursModal`, `#workingStartModal` | Working table edits. |

### Goals table — **IDs generated by `loadGoals()`** (`goals-table-load.js`)

For each non-empty goal from the API (`goal1`…`goal8`), a row is created with `tr[data-goal-index]` = `1`–`8` (column index in `goals_list`).

**Slug prefix `base`:** goal name lowercased, spaces → hyphens, non-alphanumeric stripped; duplicate names get `-1`, `-2`, …

**Cell `id` pattern** (12 columns: Goal, Sun…Sat, Total, ><, Target, Delta):

| Column | `td.id` pattern |
|--------|------------------|
| Goal | `{base}-goal` |
| Sun … Sat | `{base}-{YYYY-MM-DD}` (seven dates from Sunday in `#goals-table-date-input`) |
| Total | `{base}-total` |
| >< | `{base}><` (literal characters; selector often `td[id$="><"]`) |
| Target | `{base}-target` |
| Delta | `{base}-delta` |

**Inner elements:** editable numeric cells use `<span class="goals-cell-box">` (yellow); target uses `.goals-cell-box-target`; >< uses `.goals-cell-box-plusminus`. First column has `.goals-goal-cell`.

**API alignment:** `POST /api/goals/values` uses `goal_name` equal to the **slug prefix** for that row (e.g. `lose-weight`), not the display string with spaces.

### Empty state

If the user has no goals, `loadGoals` inserts a single placeholder row (no `data-goal-index`).

---

## 3. Files and important functions

### Loaded before goals scripts

| Asset | Role |
|-------|------|
| `/habits/auth_page_load.js` | Auth0, `updateContentVisibility`, `#private-content` / `#login-required-message`. Goals code **wraps** `updateContentVisibility` again in `goals-auth-bridge.js`. |
| Layout partials | Navbar, footer (see page template). |
| `/goals/goals.css` | Page styles. |
| Chart.js | Expected globally as `Chart` for bar charts (loaded via site layout/scripts). |

### Goals page scripts (order matters — shared global scope)

| File | Main responsibilities |
|------|----------------------|
| `goals-temporary-storage.js` | `saveTemporaryToSupabase`, `getTemporaryFromSupabase` → `/api/temporary_variables`. |
| `goals-table-delta.js` | `getDeltaValue` — fills delta column from total, target, ><. |
| `goals-slugs.js` | `goalToSlug`, `getGoalIdPrefixForIndex` (table slug rules; charts may duplicate helpers — last script wins). |
| `goals-charts.js` | `goal1ChartInstance`, `loadGoal1Chart`, `goalToSlug` (duplicates table slug helper; last script wins). |
| `goals-working-calories.js` | Working/calories math and persistence helpers; `setGoalsFormat`; `currentCaloriesEdit`; `loadMinutesValueFromSupabase`. |
| `goals-table-load.js` | `loadGoals`, `addGoalForm`. |
| `goals-auth-bridge.js` | Wraps `updateContentVisibility` to call `loadGoals`, charts, `loadMinutesValueFromSupabase` when authenticated. |
| `goals-module-visibility.js` | `moduleVisibility`, `applyModuleVisibility`, `saveModuleVisibilityToSupabase`. |
| `dom_init_js/goals-dom-submit-helpers.js` | Globals: `saveMinutesValueToSupabase`, `submitTimeWorked`, `submitTodaysCalories` (shared by stopwatch & forms). |
| `dom_init_js/goals-dom-init-bootstrap.js` | `goalsDomInitBootstrap()` — restore pills/modules, calories table, minutes & working_values from storage, run derived cells. |
| `dom_init_js/goals-dom-init-stopwatch.js` | `goalsDomInitStopwatch()` — stopwatch UI and submit-to-minutes. |
| `dom_init_js/goals-dom-init-working-forms.js` | `goalsDomInitWorkingAndCaloriesForms()` — calories row modal, working table modals, working forms, modal focus hooks. |
| `dom_init_js/goals-dom-init-goals-table.js` | `goalsDomInitGoalsTableUi()` — goals add form, week date, cell/plus-minus/edit modals, delete. |
| `dom_init_js/goals-dom-init.js` | `DOMContentLoaded` only: awaits bootstrap + stopwatch, then runs working-forms + goals-table inits. |

### Important functions (by file)

**`goals-temporary-storage.js`**

- `saveTemporaryToSupabase(key, value)`
- `getTemporaryFromSupabase(key)`

**`goals-table-delta.js`**

- `getDeltaValue()`

**`goals-slugs.js`** (and overlapping names in `goals-charts.js`)

- `goalToSlug(goalText)`
- `getGoalIdPrefixForIndex(goalsRow, goalIndex)`

**`goals-charts.js`**

- `loadGoal1Chart()`

**`goals-working-calories.js`**

- `formatCaloriesNumber`, `normalizeWorkingTime`, `timeStringToMinutes`, `minutesToTimeString`
- `updateExpectedDoneValue`, `updateProjectedDoneValue`, `updateDeltaToExpectedDone`
- `setGoalsFormat()`
- `updateCaloriesTotal`, `updateCaloriesTableFromLocal`
- `setMinutesValueCell`, `loadMinutesValueFromSupabase`
- `currentCaloriesEdit` (object)

**`goals-table-load.js`**

- `loadGoals()`
- `addGoalForm(e)`

**`goals-auth-bridge.js`**

- Replaces global `updateContentVisibility` (keeps `originalUpdateContentVisibility`).

**`goals-module-visibility.js`**

- `applyModuleVisibility()`, `saveModuleVisibilityToSupabase()`
- `moduleVisibility` (state object)

**`dom_init_js/goals-dom-submit-helpers.js`**

- `saveMinutesValueToSupabase()`, `submitTimeWorked()`, `submitTodaysCalories()`

**`dom_init_js/goals-dom-init-bootstrap.js`**

- `goalsDomInitBootstrap()` (async)

**`dom_init_js/goals-dom-init-stopwatch.js`**

- `goalsDomInitStopwatch()` (async) — inner helpers `formatStopwatch`, `getCurrentElapsedSeconds`, `stopwatchTick`

**`dom_init_js/goals-dom-init-working-forms.js`**

- `goalsDomInitWorkingAndCaloriesForms()`

**`dom_init_js/goals-dom-init-goals-table.js`**

- `goalsDomInitGoalsTableUi()` — inner `showPlusMinusModal`, `showGoalsCellModal`, `showGoalEditModal`; date display IIFE `formatGoalsDate`, `showDisplay`, `showInput`, `commitDate`

### Backend routes used

| Route | Use |
|-------|-----|
| `GET/POST /api/temporary_variables` | User-scoped key/value (mirrors many localStorage keys). |
| `GET/POST/PATCH /api/goals` | List/update `goal1`…`goal8`, add goal, delete goal slot. |
| `GET/POST /api/goals/values` | Per-day goal values by `goal_name` + `date`. `GET` accepts optional `week_start=YYYY-MM-DD` (Sunday): returns only rows with `date >= week_start` and `date < week_start + 8 days`. Omit `week_start` to fetch all rows (e.g. goal 1 chart). |

### Common `temporary_variables` keys on this page

`module_visibility`, `minutes_value`, `working_values`, `calories_today_local`, `stopwatch_start_time`, `goals_format`, `local_goal_targets`, `goals_targets_plusMinus`.

---

## 4. How `goals-table-load.js` works

`goals-table-load.js` defines two globals used on the Goals Tracker page: **`loadGoals()`** (rebuild and fill the main goals grid) and **`addGoalForm()`** (add a new goal via the API, then refresh the grid).

### `loadGoals()`

**Guardrails**  
It requires `#goals-table tbody` and a logged-in user from Auth0 (`email`, `nickname`, or `sub`). If either is missing, it returns without changing the table.

**Load the user’s goal list**  
It calls `GET /api/goals?user_id=…` and expects a single row with `goal1` … `goal8`. It collects every non-empty slot into an array `{ value, columnIndex }` so order matches the database columns.

**Week dates (Sun → Sat)**  
The week is anchored on **`#goals-table-date-input`**, interpreted as that week’s Sunday. If the input is empty or invalid, it falls back to the most recent Sunday in the local calendar. It builds seven ISO date strings (`YYYY-MM-DD`) for Sunday through Saturday.

**Build table rows**  
It clears `tbody` and then:

- **No goals:** one placeholder row (“Add your first goal”) with empty cells.
- **Has goals:** for each goal it computes a **slug prefix** from the name (`goalToIdPrefix`: lowercase, spaces → hyphens, strip non-alphanumerics). Duplicate display names get suffixes `-1`, `-2`, … so cell IDs stay unique.

Each goal becomes a `<tr data-goal-index="1"…"8">` with **12 columns** in a fixed order: Goal, Sun…Sat, Total, `><`, Target, Delta.

**Cell IDs** (used by clicks, API saves, and storage):

| Column | Pattern |
|--------|---------|
| Goal | `{base}-goal` |
| Sun … Sat | `{base}-{YYYY-MM-DD}` for that weekday |
| Total | `{base}-total` |
| Comparison | `{base}><` (literal `><` in the id) |
| Target | `{base}-target` |
| Delta | `{base}-delta` |

Editable numeric cells get a yellow `.goals-cell-box` (blue for target, grey for `><`). The goal name cell is `.goals-goal-cell` for edit/delete.

**Fill day values from the server**  
`GET /api/goals/values?user_id=…&week_start=<Sunday YYYY-MM-DD>` returns only rows in that week window (`date >= week_start` and `date < week_start + 8 days`). For each **day** `<td>` whose id ends with `-YYYY-MM-DD`, it finds a matching row (goal name case-insensitive, date normalized to `YYYY-MM-DD`) and writes the value into the inner box. `week_start` matches `#goals-table-date-input` / `baseDateVal`.

**Fill target and `><` from local / Supabase**

- **`local_goal_targets`** (via `getTemporaryFromSupabase`, then `localStorage`) — keys are full target cell ids; values go in the blue boxes.
- **`goals_targets_plusMinus`** — same pattern for grey `><` cells.

**Recompute totals and downstream UI**  
For each data row it sums columns 1–7 (Sun–Sat), strips commas, and puts the sum in column 9 (Total). Then it calls:

- **`getDeltaValue()`** — delta column vs target / `><`
- **`setGoalsFormat()`** — number formatting from saved preferences
- **`loadGoal1Chart()`** — refresh the bar chart for goal 1

### `addGoalForm(e)`

Submit handler for “add goal”:

1. `preventDefault`, read `#goal-input`, require non-empty text.
2. Resolve the same Auth0 user id as above.
3. `POST /api/goals` with `{ user_id, goal }` (the server picks the next free `goal1`…`goal8` slot).
4. On success, clear the input and **`await loadGoals()`** so the new row appears.
5. The submit button is disabled and the label set to “Submitting…” while the request runs.

### Role in the rest of the app

- **Edit goal name / delete** and **click day cells to POST values** live in `dom_init_js/goals-dom-init-goals-table.js`; they rely on these stable **`td.id`** patterns.
- **`loadGoals()`** is also run after login (`goals-auth-bridge.js`), when the week date changes, and after edits that `PATCH` `/api/goals`.

In short: **`loadGoals()` is the single function that turns API + storage into the live `#goals-table` DOM and keeps totals, deltas, formats, and the goal 1 chart in sync.**

---

*Gulp copies `src/pages/goals/goals-*.js`, `src/pages/goals/dom_init_js/*.js`, and `goals.css` to `dist/goals/` (with `dom_init_js/` preserved); the HTML template lists script tags in load order.*
