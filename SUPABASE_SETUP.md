# Setting up habits on Supabase

Supabase is a hosted PostgreSQL database. Use it in production so habits persist when your app is deployed (e.g. on Railway, Render, or Heroku).

## 1. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and sign in (or create an account).
2. Click **New project**.
3. Choose an organization, name the project (e.g. `upriseu-habits`), set a database password, and pick a region. Click **Create new project**.

## 2. Create the `habits` table

1. In the Supabase dashboard, open your project.
2. Go to **SQL Editor** in the left sidebar.
3. Click **New query** and run this SQL:

```sql
create table if not exists habits (
  id bigserial primary key,
  task text not null,
  event_date date,
  user_id text
);
```
4. Click **Run**. You should see “Success. No rows returned.”

create goals table

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
```

create goals_values table (for yellow-box cell submissions)

```sql
create table if not exists goals_values (
  id bigserial primary key,
  user_id text not null,
  goal_name text not null,
  value text,
  date date
);
```


## 3. Get your API credentials

1. In the dashboard, go to **Project Settings** (gear icon) → **API**.
2. Note:
   - **Project URL** (e.g. `https://xxxxx.supabase.co`)
   - **service_role** key under “Project API keys” (secret; use only on the server)

## 4. Configure your app

Set these environment variables where your app runs (local `.env` or your host’s env vars):

```bash
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
```

- **Local:** create a `.env` file in the project root (add `.env` to `.gitignore` if it isn’t already) and add the two lines above. Use something like `dotenv` in `server.js` to load them, or set them in your shell.
- **Production:** in your host’s dashboard (Railway, Render, Heroku, etc.), add the same two variables.

Restart the server. If both variables are set, the app will use Supabase for habits instead of the local `habits.db` file.

## 5. Optional: use `.env` locally

1. Install dotenv: `npm install dotenv`
2. At the top of `server.js` (before other requires), add: `require('dotenv').config();`
3. Add to `.gitignore`: `.env`

Then you can keep `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `.env` and not commit them.
