# Life Tracker

Personal, mobile-responsive web app: to-dos, monthly money (income/expenses), body (gym, rounds, weight), and challenges with streaks.

**Stack:** React + TypeScript + Vite · Fastify + Node.js · Prisma ORM · PostgreSQL

## Run it

```bash
npm install
cp server/.env.example server/.env   # set DATABASE_URL (PostgreSQL, port 5000) and JWT_SECRET
npm run db:push                      # creates the "lifetracker" database + tables
npm run dev                          # API on :4000, web on :5173
```

Open http://localhost:5173. The first account you create becomes the owner; after that sign-up is closed
unless you set `ALLOW_SIGNUP=true` in `server/.env`. Set a long random `JWT_SECRET` there too. On your phone (same Wi-Fi) use `http://<your-pc-ip>:5173`.

## Features

**Character** (pick the good qualities you want to grow, tick them off daily with an optional note, write a daily reflection, and level up with streaks) · **Career** (study log, topics covered, daily study goal, and career tasks for today / this week / this month) · **Dashboard with today rings, one summary card per area (running, body, food, money, books, career, character, diary, temple, screen time, movies, challenges), a consistency heatmap (temple, screen time and movies count too), sparklines and a stats section with charts for every area, including temple, screen time and movies** · To-do (with overdue/due-today alerts + browser reminders) · Money (with charts) · Body (gym, running, weight trend, **food log** — meals + snacks, home or outside, calories vs your daily goal) · **Books** (reading list, progress, and the moral you took from each) · **Diary** (one entry per day, mood, search, streak) ·
Challenges (streaks) · **Temple** (log each day you went and to which temple, see how many days you have been, streaks and a month calendar, and get a daily reminder until you have gone) · **Screen time** (minutes per day on Instagram, YouTube, games and movies, a 14-day chart, week vs last week and an optional daily limit) · **Movies** (movies and series you are watching, have watched or want to watch, with loved / okay / hated, favorites, a star rating and your own review) · light/dark theme toggle · animations that respect the OS "reduce motion" setting.

## On your phone

Open `http://<your-pc-ip>:5173` on the same Wi-Fi, then use the browser menu → **Add to Home Screen**
(iPhone: Share → Add to Home Screen). The app has a manifest and icons (`client/public/`).
Chrome only offers a full "Install app" on HTTPS, so over plain LAN HTTP you get a home-screen shortcut.

The API port comes from `PORT` in `server/.env`; the dev web server reads it too, so they always match.

## Layout

- `server/prisma/schema.prisma` — data model
- `server/src/routes/` — API (`todos`, `transactions`, `fitness`, `challenges`, `dashboard`)
- `client/src/pages/` — one page per section

## Changing the font

The app font is **Plus Jakarta Sans**, bundled from `@fontsource-variable/plus-jakarta-sans` (works offline). To try another:
install one (e.g. `npm i @fontsource-variable/manrope -w client`), change the import in `client/src/main.tsx`, and change
`--font` at the top of `client/src/styles.css`. Manrope, Outfit and Sora all support tabular numbers, which keeps the counting-up figures steady.

## Database (PostgreSQL)

The app uses **PostgreSQL on `localhost:5000`**, database `lifetracker`. Connect with pgAdmin or `psql -h localhost -p 5000 -U postgres -d lifetracker`.
Table and column names are case-sensitive in PostgreSQL, so quote them in SQL: `SELECT * FROM "Todo" WHERE "userId" = 3;`.

- `server/prisma/create-database.sql` creates every table from scratch.
- `server/prisma/insert-examples.sql` has example inserts for each table (your `"userId"` is 3).
- The app used SQL Server before; that old database was left untouched as a backup.

## Profile

Open **Profile** from the round picture at the bottom of the sidebar (top bar on a phone). Set your name, an optional **phone number**, and a
profile picture: four built-in Spider-Man-style pictures (original artwork), your own uploaded photo (cropped to a square and shrunk before it is
saved), or your initials. The theme picker lives there too.

## Themes

Four looks, switched with the button in the top bar (phone) / bottom of the sidebar (desktop), or from the Profile page: **Spider-Man** (default:
midnight navy, Spidey red, comic panels, webs, a spider on a thread), **The Amazing Spider-Man** (cinematic near-black blue, glossy glass panels,
tall Bebas Neue lettering, red glow and blue webs), **Light** and **Dark**. The choice is remembered per browser. Each Spider-Man look is one block at
the end of `client/src/styles.css` (`html[data-theme='spidey']` / `'amazing'`) and uses original CSS/SVG art (no official logos).

## Deploy (Render + Neon database)

The app runs on Render (`render.yaml`: one web service serving the API **and** the built app). The database lives on [Neon](https://neon.tech), whose free PostgreSQL is not deleted after 30 days.

1. **Neon:** sign up, create a project (any name, region near you), then click **Connect** and copy the connection string. Turn **off** "Connection pooling" so the host has no `-pooler` in it, and add `&connect_timeout=15` at the end. It looks like
   `postgresql://user:password@ep-xxxx.region.aws.neon.tech/neondb?sslmode=require&connect_timeout=15`
2. Put the project on GitHub (private repo is fine). `server/.env` is git-ignored, so your local password never leaves your PC.
3. **Render:** New → Blueprint → pick the repo. When it asks for `DATABASE_URL`, paste the Neon string. `JWT_SECRET` is generated for you. It builds, creates the tables in Neon (`prisma db push`) and starts the app.
4. Open the `https://life-tracker-xxxx.onrender.com` URL and **create your account straight away**. Sign-up is open only while no user exists, so the first person to register owns the app; after that it closes. Use a real password (not the 4-character one used locally).
5. On your phone open the URL and use *Add to Home screen* to install it.

Good to know: on Render's free plan the service sleeps after 15 minutes idle (the next visit takes ~30 s), and Neon's free database also pauses when idle and wakes in about a second, so the first request after a break can be slow.
Environment variables: `DATABASE_URL`, `JWT_SECRET` (32+ chars), `ALLOW_SIGNUP` (`false`), `TRUST_PROXY` (`true` behind a host's proxy), optional `PORT`.
