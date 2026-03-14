# Habit Stacker — Developer README

This document describes the **Habit Stacker** page (`habit_stacker.html`): user flows, structure, IDs, functions, CSS, data/APIs, and notes for new developers.

---

## 1. High-level user paths and functionality

### Authentication
- **Login-required content:** The main app lives inside `#private-content` (hidden until the user is authenticated).
- **Flow:** Page loads → Auth0 is checked (`window.auth0` or `window.auth0Promise`) → if authenticated, `#private-content` is shown and `#login-required-message` is hidden; otherwise the opposite. `checkAuthAndDisplayContent()` runs on load, on `focus`, and when URL has `code=` and `state=` (Auth0 redirect).
- **Login:** User clicks “Log In” (calls `handleLogin()` — provided elsewhere, e.g. Auth0 config).

### After login
- **Habits (tasks):** User sees the Habits table (`#tasks-table`), can add habits via `#task-form`, and click a row to get Edit/Delete in `#rowActionModal`. Edit uses `#editEventModal` and `saveEditTask()`.
- **Goals:** User adds goals via `#goal-form` (name only). Goals table (`#goals-table`) is built from API goals + goal values. User can:
  - Click **goal name (first column)** → `#goalEditModal` (rename, set format, or delete goal).
  - Click **day cell (yellow)** → `#goalsCellModal` to set a numeric value (saved to API).
  - Click **grey >< cell** → `#plusMinusModal` to choose &lt; or &gt; for delta direction.
  - Change the week via the goals table date (Sunday); date is driven by `#goals-table-date-input` (and optionally a display element).
- **Working card:** Minutes worked, daily hours goal, and start time. Click yellow cells to open:
  - `#minutes_value` → `#minutesWorkModal`
  - `#daily-hours-value` → `#dailyHoursModal`
  - `#working_start` → `#workingStartModal`
  Values are synced to Supabase `temporary_variables` (and localStorage fallback). “Expected Done” and “Projected Done” and “Delta” are computed from start + hours and minutes worked.
- **Stopwatch:** Start/Pause/Reset/Submit. Submit adds elapsed time to `#minutes_value`, persists it, and calls `submitTimeWorked()` to push “time worked” into the Goals table (Hours row for today).
- **Calories today:** Table of 6 meals (`#meal1`–`#meal6`, `#calories1`–`#calories6`). Click a row → `#caloriesRowEditModal` to edit meal name and calories. Total is in `#total-calories`. Data is stored in `calories_today_local` (Supabase + localStorage). “Submit today’s calories” (`#submit-todays-calories-btn`) and any change to calories1–6 (e.g. after row edit) call `submitTodaysCalories()` to write the total into the Goals table (Calories row for today).

---

## 2. HTML tables, modules, and important element IDs

### Main layout
| ID / selector | Purpose |
|---------------|--------|
| `#private-content` | Wrapper for all content shown only when authenticated |
| `#login-required-message` | “Access Restricted” / Log In message when not authenticated |
| `#flex-modules-container-stopwatch` | Flex container for Stopwatch, Working, and Calories today cards |

### Habits (tasks) section
| ID | Purpose |
|----|--------|
| `#tasks-loading` | Loading spinner |
| `#tasks-error` | Error message area |
| `#tasks-empty` | “No Habits added yet” message |
| `#tasks-table` | Habits table (created by `loadTasks()`) |
| `#tasks-tbody` | tbody for habit rows (each row has `data-habit-id`) |
| `#task-form` | Add habit form |
| `#task-input` | Habit name input |
| `#event-date` | Start date input |
| `#rowActionModal` | Edit / Delete choice modal |
| `#row-action-habit-name` | Displays habit name in row action modal |
| `#row-action-edit-btn` | Edit button in row action modal |
| `#row-action-delete-btn` | Delete button in row action modal |
| `#editEventModal` | Edit habit modal |
| `#edit-task-form` | Edit form |
| `#edit-task-id` | Hidden input for task id |
| `#edit-task-input` | Edit habit name |
| `#edit-event-date` | Edit start date |

### Goals section
| ID | Purpose |
|----|--------|
| `#goals-table-date-input` | Date input for “Sunday’s date” of the week (may be hidden; used to build Sun–Sat) |
| `#goals-table-date-display` | Optional display for that date (referenced in script; may live in same `<p>` as the input) |
| `#goals-table` | Goals table (rows created by `loadGoals()`) |
| `#goal-form` | Add goal form |
| `#goal-input` | Goal name input |
| `#goalEditModal` | Edit goal name / format / delete |
| `#goal-edit-cell-id` | Shows cell id |
| `#goal-edit-form` | Edit goal form |
| `#goal-edit-value-input` | Goal name input |
| `#goals-cell-format-select` | Format: text, #,###, #.# |
| `#goal-edit-delete-btn` | Delete goal button |
| `#goalsCellModal` | Set value for a single day cell |
| `#goals-cell-id-display` | Shows cell id |
| `#goals-cell-value-form` | Form to enter value |
| `#goals-cell-value-input` | Value input |
| `#plusMinusModal` | Choose < or > for delta |
| `#plusminus-cell-id` | Shows cell id |
| `#plusminus-form` | Form |
| `#plusminus-select` | < or > select |

**Goals table structure (per row):**  
Columns: Goal (0), Sun (1) … Sat (7), Total (8), >< (9), Target (10), Delta (11).  
Cell IDs are built as `{goalSlug}-{date}` for days (e.g. `calories-2026-03-15`), `{goalSlug}-total`, `{goalSlug}><`, `{goalSlug}-target`, `{goalSlug}-delta`. Rows have `data-goal-index`.

### Working card
| ID | Purpose |
|----|--------|
| `#working-table` | Table for Minutes, Daily Hours, Start, Expected/Projected Done, Delta |
| `#minutes_value` | Minutes worked (yellow box) |
| `#daily-hours-value` | Daily hours goal (yellow box) |
| `#working_start` | Start time (yellow box) |
| `#expected-done-value` | Expected done time |
| `#projected-done-value` | Projected done time |
| `#delta-to-expected-done-value` | Delta to expected |
| `#minutesWorkModal` | Minutes worked modal |
| `#minutes-work-form` | Form |
| `#minutes-work-input` | Minutes input |
| `#dailyHoursModal` | Daily hours modal |
| `#daily-hours-form` | Form |
| `#daily-hours-input` | Hours input |
| `#workingStartModal` | Working start modal |
| `#working-start-form` | Form |
| `#working-start-input` | Start time input |

### Stopwatch
| ID | Purpose |
|----|--------|
| `#stopwatch-card` | Card wrapper |
| `#stopwatch-display` | Time display (e.g. 0:00:00) |
| `#stopwatch-start` | Start button |
| `#stopwatch-pause` | Pause button |
| `#stopwatch-reset` | Reset button |
| `#stopwatch-submit` | Submit (adds time to minutes_value and runs submitTimeWorked) |

### Calories today
| ID | Purpose |
|----|--------|
| `#calories-today-card` | Card wrapper |
| `#calories-today-table` | Table (meal names + calories) |
| `#meal1` … `#meal6` | Meal name cells |
| `#calories1` … `#calories6` | Calories cells (yellow boxes) |
| `#total-calories` | Sum of calories1–6 (updated by `updateCaloriesTotal()`) |
| `#submit-todays-calories-btn` | Submit today’s calories to Goals table |
| `#caloriesRowEditModal` | Edit row modal |
| `#calories-row-edit-form` | Form |
| `#calories-edit-meal-id-label` | Meal cell id label |
| `#calories-edit-calories-id-label` | Calories cell id label |
| `#calories-edit-meal-input` | Meal name input |
| `#calories-edit-calories-input` | Calories input |

---

## 3. Functions, click listeners, and what they do

### Auth and visibility
- **checkAuthAndDisplayContent()** — Gets Auth0 (from `window.auth0` or `window.auth0Promise`), waits for `window.redirectHandledPromise` if present, then calls `updateContentVisibility(isAuthenticated)`.
- **updateContentVisibility(isAuthenticated)** — Shows/hides `#private-content` and `#login-required-message`. Overridden so when `true` it also runs `loadTasks`, `loadGoals`, and `loadMinutesValueFromSupabase()` (after a short delay for the first two).
- **waitForAuth0AndCheck(maxRetries, retryDelay)** — Polls for Auth0 then runs `checkAuthAndDisplayContent()`.

### Goals table
- **getDeltaValue()** — For each goals table row: reads Total (col 8) and Target (col 10), strips commas, computes delta from &gt;/&lt; (col 9), writes Delta (col 11) and colors it green/red.
- **loadGoals()** — Fetches `/api/goals?user_id=...`, builds goal list from `goal1`…`goal8`, builds Sun–Sat dates from `#goals-table-date-input`, rebuilds `#goals-table` tbody (one row per goal with day/total/&gt;&lt;/target/delta cells), fetches `/api/goals/values`, fills day and target cells from API and local storage, then computes row totals (sum of day cells, comma-safe) and calls `getDeltaValue()` and `setGoalsFormat()`.
- **addGoalForm(e)** — Submit handler for `#goal-form`. POSTs to `/api/goals` with `user_id` and `goal`; then calls `loadGoals()`.
- **showPlusMinusModal(cell)** — Sets `#plusminus-cell-id`, opens `#plusMinusModal`.
- **showGoalsCellModal(cell)** — Sets `#goals-cell-id-display`, opens `#goalsCellModal`.
- **showGoalEditModal(cell)** — Async. Resolves goal name and format, sets `#goal-edit-cell-id`, `#goal-edit-value-input`, `#goals-cell-format-select`, opens `#goalEditModal`.
- **Goals table click** — Delegated on `#goals-table`: goal name (first column) → `showGoalEditModal`; grey &gt;&lt; → `showPlusMinusModal`; yellow day/target → `showGoalsCellModal`. Stores `currentGoalsCellId` for submit handlers.
- **Goals table keydown** — Enter/Space on focused cell triggers same behavior as click.
- **plusminusForm submit** — Saves &lt;/&gt; to `goals_targets_plusMinus` (Supabase + localStorage), updates cell, closes modal, `getDeltaValue()`.
- **goalsCellValueForm submit** — Reads value, updates cell, recomputes row total (sum of day cells, comma-safe). If cell is a day cell, POSTs to `/api/goals/values` (user_id, goal_name, value, date). Then `setGoalsFormat()`, `getDeltaValue()`, `loadGoals()`.
- **goalEditForm submit** — PATCH `/api/goals` with updated goal name and format; updates local goal targets/format; `loadGoals()`.
- **goalEditDeleteBtn click** — DELETE `/api/goals` for that goal index; then `loadGoals()`.

### Habits (tasks)
- **loadTasks()** — Fetches `/api/habits`, filters by current user email, renders rows into `#tasks-tbody` with `data-habit-id`, shows/hides loading/error/empty/table.
- **addTaskForm(event)** — Submit for `#task-form`. POSTs to `/api/habits` with task, event_date, user_id; then `loadTasks()`.
- **deleteTask(id)** — DELETE `/api/habits/${id}`; then `loadTasks()`.
- **editTask(id)** — Fetches habits, finds task by id, fills `#edit-task-id`, `#edit-task-input`, `#edit-event-date`, opens `#editEventModal`.
- **saveEditTask()** — PUT `/api/habits/${taskId}` with updated task and event_date; then `loadTasks()`, closes modal.
- **tasks-tbody click** — Click on row (not button) sets `rowActionHabitId`, shows `#rowActionModal`.
- **row-action-edit-btn click** — Closes modal, calls `editTask(rowActionHabitId)`.
- **row-action-delete-btn click** — Closes modal, calls `deleteTask(rowActionHabitId)`.

### Working card and stopwatch
- **updateExpectedDoneValue()** — Expected done = working_start + daily_hours (time math), writes to `#expected-done-value`.
- **updateProjectedDoneValue()** — Projected = now + (daily_hours in minutes) − 1.3×minutes_value, writes to `#projected-done-value`.
- **updateDeltaToExpectedDone()** — Delta between projected and expected, writes to `#delta-to-expected-done-value`, colors green/red.
- **setMinutesValueCell(val)** — Sets `#minutes_value` cell text and runs `updateProjectedDoneValue`, `updateDeltaToExpectedDone`.
- **loadMinutesValueFromSupabase()** — Gets `minutes_value` from Supabase; if present, calls `setMinutesValueCell(minutesVal)`.
- **saveMinutesValueToSupabase()** — Reads current `#minutes_value` and calls `saveTemporaryToSupabase('minutes_value', value)`.
- **submitTimeWorked()** — Reads `#minutes_value`, computes (minutes×1.3)/60 as hours, finds today’s “Hours” goal cell in goals table, sets that cell, calls `setGoalsFormat()`, POSTs to `/api/goals/values` if authenticated.
- **Stopwatch (initStopwatch IIFE):** Start/Pause/Reset update internal elapsed time and display. **Submit** adds elapsed minutes to `#minutes_value`, calls `saveMinutesValueToSupabase()`, update helpers, and `submitTimeWorked()`.
- **workingTable click** — `#minutes_value` → `#minutesWorkModal`; `#daily-hours-value` → `#dailyHoursModal`; `#working_start` → `#workingStartModal`.
- **minutesWorkForm submit** — Sets `#minutes_value`, `saveMinutesValueToSupabase()`, update helpers, `submitTimeWorked()`, close modal.
- **dailyHoursForm submit** — Sets `#daily-hours-value`, merges into `working_values` (Supabase + localStorage), update helpers, close modal.
- **workingStartForm submit** — Normalizes time, sets `#working_start`, merges into `working_values` (Supabase + localStorage), update helpers, close modal.

### Calories today
- **updateCaloriesTotal()** — Sums `#calories1`…`#calories6` (comma-stripped), sets `#total-calories` (formatted with `formatCaloriesNumber`).
- **updateCaloriesTableFromLocal()** — Loads `calories_today_local` from Supabase (fallback localStorage), fills meal/calories cells and runs `updateCaloriesTotal()`; if `submitTodaysCalories` is defined, calls it (note: defined later in DOMContentLoaded, so not called on first run).
- **submitTodaysCalories()** — Reads `#total-calories`, finds today’s “Calories” goal cell, sets it, `setGoalsFormat()`, POSTs to `/api/goals/values` if authenticated, then `getDeltaValue()`.
- **caloriesTbody click** — Click on a row (not last): sets `currentCaloriesEdit`, fills `#caloriesRowEditModal` inputs, shows modal.
- **caloriesRowEditForm submit** — Saves meal and calories into `calories_today_local` (Supabase + localStorage), `updateCaloriesTableFromLocal()`, close modal, `submitTodaysCalories()`.
- **submit-todays-calories-btn click** — Calls `submitTodaysCalories()`.

### Helpers and formatting
- **formatCaloriesNumber(n)** — Format number with locale comma (e.g. 1200 → "1,200").
- **normalizeWorkingTime(str)** — Normalize "H:MM AM/PM" to consistent string.
- **timeStringToMinutes(str)** — Parse time string to minutes since midnight.
- **minutesToTimeString(totalMinutes)** — Minutes since midnight to "H:MM AM/PM".
- **setGoalsFormat()** — Loads `goals_format`, applies `#,###` or `#.#` to goal cells that have a format (by goal slug).
- **escapeHtml(text)** — Escape for safe HTML.
- **formatDateOnly**, **formatDateShort**, **daysSince** — Date formatting and “days since” for habits.

### Temporary variables (Supabase + localStorage)
- **saveTemporaryToSupabase(tempKey, tempValue)** — POST `/api/temporary_variables` with user_id (from Auth0), key, value.
- **getTemporaryFromSupabase(tempKey)** — GET `/api/temporary_variables?user_id=...&key=...`, returns `temporary_table_value` or null; strips commas not used here but response is string. Uses `cache: 'no-store'`.

### Global (window) exports
- **window.deleteTask** = deleteTask  
- **window.editTask** = editTask  
- **window.saveEditTask** = saveEditTask  

### Other listeners
- **DOMContentLoaded** — Runs `updateCaloriesTableFromLocal()`, loads `minutes_value` and `working_values` (Supabase then localStorage), applies to cells, runs update helpers and `setGoalsFormat()`, then attaches all form and table listeners above (stopwatch, calories, working, goals, tasks, row action, goal date).
- **Goals table date** — `#goals-table-date-input` change updates internal date and can call `loadGoals()`. Optional `#goals-table-date-display` click/keydown to show date input; input change/blur commits date.

---

## 4. Important CSS

- **#tasks-table** — 90vw, fixed layout; column widths and alignment for Habit / Days kept / Start date; rounded row cards with spacing.
- **#goals-table** — Columns 2–9 min-width 3em; cells with `id*="target"` or `id*="><"` get white text; `id*="goal"` or `id*="total"` bold; column 12 (Delta) centered. Cells with `.goals-cell-box` are positioned relative with min-height.
- **.goals-cell-box** — Yellow (#ffeb3b), absolute overlay, rounded, pointer. Used for editable day/target values in goals table and for working/calories tables.
- **.goals-cell-box-target** — Blue (#2196f3) for target cells.
- **.goals-cell-box-plusminus** — Grey (#9e9e9e) for &gt;&lt; cells.
- **#calories-today-table, #working-table** — 15em width, fixed layout; first column 5em, second 3em, center-aligned. Last row of calories table has blue background and bold (total row).
- **#calories-today-card, #working-card** — Card body and table styling; submit button block.
- **.flex-modules-container** — Column on small screens; row from 800px with gap.
- **#rowActionModal** — No border on header/footer, tight padding.
- **Modals** — Bootstrap `.modal`, `.modal-dialog-centered` for centering.

Numeric parsing note: Anywhere the app reads displayed numbers (totals, targets, deltas, day cells), it should strip commas (e.g. `.replace(/,/g, '')`) before `parseFloat()` so values like "1,200" parse correctly.

---

## 5. Database and API connections

### Backend (Express in `server.js`)
- **Auth:** Not enforced in these routes; frontend sends `user_id` (email or Auth0 sub) where needed.
- **Habits:**  
  - `GET /api/habits` — list habits (from Supabase or SQLite via `supabaseHabits` / `db`).  
  - `POST /api/habits` — body: `task`, `event_date`, `user_id`.  
  - `PUT /api/habits/:id` — update habit.  
  - `DELETE /api/habits/:id` — delete habit.
- **Goals:**  
  - `GET /api/goals?user_id=...` — one row per user with `goal1`…`goal8`.  
  - `POST /api/goals` — body: `user_id`, `goal`.  
  - `PATCH /api/goals` — body: `user_id`, `goal_index`, `value` (goal name), and optional format.  
  - `DELETE /api/goals` — body: `user_id`, `goal_index`.  
  - `GET /api/goals/values?user_id=...` — list of `{ goal_name, date, value }`.  
  - `POST /api/goals/values` — body: `user_id`, `goal_name`, `value`, `date`.
- **Temporary variables (Supabase):**  
  - `GET /api/temporary_variables?user_id=...&key=...` — returns `{ temporary_table_value }` or null.  
  - `POST /api/temporary_variables` — body: `user_id`, `key`, `value`.  
  Implemented in `supabase-temporary.js` (table `temporary_variables`: user_id, temporary_table_key, temporary_table_value).

### Frontend data flow
- **Auth:** Relies on `window.auth0` (or `window.auth0Promise`) and `handleLogin()` (likely from Auth0 config or navbar). User id is `user.email || user.nickname || user.sub`.
- **Temporary keys used:**  
  `minutes_value`, `working_values` (JSON), `calories_today_local` (JSON), `goals_format`, `local_goal_targets`, `goals_targets_plusMinus`.  
  All read with Supabase-first, localStorage fallback where applicable; writes go to both (Supabase via API + localStorage).

### Partials (top of file)
- `{{> navbar}}` — Navbar partial.
- `{{> main-site-footer }}` — Footer at end of script.

---

## 6. Other notes for developers

- **Execution order:** Auth check runs early; `updateContentVisibility` is overridden to call `loadTasks`, `loadGoals`, and `loadMinutesValueFromSupabase` when authenticated. Most DOM listeners are attached inside a single `DOMContentLoaded` handler; `submitTodaysCalories` is defined there, so it is not visible to `updateCaloriesTableFromLocal()` (which lives in an outer scope). Therefore `submitTodaysCalories()` is explicitly called from the calories row-edit submit handler so it runs when calories1–6 change.
- **Goals table week:** The week is determined by “Sunday’s date” from `#goals-table-date-input`. If that element is hidden, ensure it still has a valid value (e.g. set in code or by the date-display click flow). `loadGoals()` uses it to build `dayDateStrs` for Sun–Sat.
- **Row totals and deltas:** Total column = sum of day columns 1–7; values are stripped of commas before summing. Delta uses Total and Target (also comma-stripped) and the &gt;/&lt; cell to decide direction and coloring.
- **Goals table cell IDs:** Built from goal name slug (lowercase, spaces → hyphens) plus suffix: date for days, `total`, `><`, `target`, `delta`. Duplicate slugs get a numeric suffix (e.g. `goal-2`).
- **Bootstrap/jQuery:** Modals are shown/hidden with `$('#modalId').modal('show')` / `$('#modalId').modal('hide')`. Assumes Bootstrap JS and jQuery are loaded.
- **Errors:** API errors are often handled with `console.error` and sometimes `alert`. Consider centralizing and optionally surfacing in `#tasks-error` or a global toast for a better UX.
