# Goals Tracker page — developer overview

This document summarizes **user-facing behavior**, **DOM IDs** (including those created by JavaScript), **assets and scripts**, and **important functions** for the Goals Tracker (`goals_tracker.html`).

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
- **Charts**: two bar charts show last-12-month aggregates for goal 1 and goal 2 (`#goal1-bar-chart`, `#goal2-bar-chart`).

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
| `#goal1-chart-title`, `#goal1-bar-chart`, `#goal2-chart-title`, `#goal2-bar-chart` | Chart title + canvas. |

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
| `goals-charts.js` | `goal1ChartInstance`, `goal2ChartInstance`, `loadGoal1Chart`, `loadGoal2Chart`. |
| `goals-working-calories.js` | Working/calories math and persistence helpers; `setGoalsFormat`; `currentCaloriesEdit`; `loadMinutesValueFromSupabase`. |
| `goals-table-load.js` | `loadGoals`, `addGoalForm`. |
| `goals-auth-bridge.js` | Wraps `updateContentVisibility` to call `loadGoals`, charts, `loadMinutesValueFromSupabase` when authenticated. |
| `goals-module-visibility.js` | `moduleVisibility`, `applyModuleVisibility`, `saveModuleVisibilityToSupabase`. |
| `goals-dom-init.js` | Large `DOMContentLoaded`: pills, stopwatch, calories/working/goals listeners, modals, `submitTimeWorked`, `submitTodaysCalories`, goals table interactions. |

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
- `loadGoal2Chart()`

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

**`goals-dom-init.js`** (inner functions — not global unless attached)

- Stopwatch: `initStopwatch` IIFE, `formatStopwatch`, `getCurrentElapsedSeconds`, `stopwatchTick`
- `saveMinutesValueToSupabase` (inner)
- `submitTimeWorked()`, `submitTodaysCalories()`
- Goals table UI: `showPlusMinusModal`, `showGoalsCellModal`, `showGoalEditModal`
- Date display helper: `formatGoalsDate`, `showDisplay`, `showInput`, `commitDate` (goals table date display/input)

### Backend routes used

| Route | Use |
|-------|-----|
| `GET/POST /api/temporary_variables` | User-scoped key/value (mirrors many localStorage keys). |
| `GET/POST/PATCH /api/goals` | List/update `goal1`…`goal8`, add goal, delete goal slot. |
| `GET/POST /api/goals/values` | Per-day goal values by `goal_name` + `date`. |

### Common `temporary_variables` keys on this page

`module_visibility`, `minutes_value`, `working_values`, `calories_today_local`, `stopwatch_start_time`, `goals_format`, `local_goal_targets`, `goals_targets_plusMinus`.

---

*Gulp copies `src/pages/goals/goals-*.js` and `goals.css` to `dist/goals/`; the HTML template lists script tags in load order.*
