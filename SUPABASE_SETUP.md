# Supabase database setup (Habit Stacker)

Use a **new** Supabase project for Habit Stacker (not the old Uprise University project).

Auth setup (email login, Site URL, redirect URLs) is documented in **[README_SETUP.md](./README_SETUP.md)**. This file is only the SQL for tables.

## 1. Create the project

1. [supabase.com](https://supabase.com) → **New project**.
2. Name it e.g. `habit-stacker`, set a DB password, pick a region.
3. Wait until the project is healthy.

## 2. Create tables (SQL Editor)

### Required for launch — `habits`

```sql
create table if not exists habits (
  id bigserial primary key,
  task text not null,
  event_date date,
  user_id text
);
```

`user_id` stores the signed-in user’s **email** (same value Supabase Auth uses).

### Optional — only if you still use these APIs

```sql
create table if not exists goals_list (
  id bigserial primary key,
  goal1 text,
  goal2 text,
  goal3 text,
  goal4 text,
  goal5 text,
  goal6 text,
  goal7 text,
  goal8 text,
  user_id text
);

create table if not exists goals_values (
  id bigserial primary key,
  user_id text not null,
  goal_name text not null,
  value text,
  date date
);

create table if not exists feedback (
  id bigserial primary key,
  created_at timestamptz default now(),
  details text,
  rating double precision
);

create table if not exists temporary_variables (
  id bigserial primary key,
  user_id text,
  temporary_table_key text,
  temporary_table_value text
);
```

## 3. API keys

**Project Settings → API:**

| Key | Where it goes |
|-----|----------------|
| Project URL | `.env` → `SUPABASE_URL` **and** `src/js/supabase-config.js` → `url` |
| `anon` `public` | `src/js/supabase-config.js` → `anonKey` |
| `service_role` | `.env` → `SUPABASE_SERVICE_ROLE_KEY` only |

See **README_SETUP.md** for the full checklist.

## 4. How the app uses Supabase

1. Browser signs in with the **anon** key (`supabase-auth.js`).
2. Habits API calls send `Authorization: Bearer <access_token>`.
3. Express verifies the token with the **service role** client (`supabase-auth-server.js`) and scopes rows to `req.user.email`.
4. Habit rows are read/written via `supabase-habits.js`.

Locally, if `.env` is missing, habits fall back to SQLite (`habits.db`) and API auth is relaxed — production should always have Supabase configured.
