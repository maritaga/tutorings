# tutorings · with Marita

A minimal app for students to book tutorings with Marita.

- **Students** (`/`) pick a day, a length (1 h to 3.5 h) and a start time. They only see times that fit around classes, blocked times, other tutorings and Google Calendar. They register with their name, email and a 4-digit PIN.
- **Check my tutorings**: students type their name and PIN to see their tutorings and change or cancel them right away, no approval needed. If the new time is blocked, the app tells them.
- **Admin** (`/admin`, password protected): see and cancel tutorings, block one-off times, edit weekly blocked times and tutoring hours, and connect Google Calendar.
- **Google Calendar**: your busy events block times, and every tutoring is added to your calendar with the student invited by email. Changes and cancellations update the event automatically.

All times are Mexico City time.

---

## Setup, step by step

You'll create three free accounts: **Supabase** (database), **Vercel** (hosting) and **Google Cloud** (calendar connection). It takes about 30 minutes.

> ⚠️ Never paste keys or passwords into GitHub or a chat. They only go into Vercel's "Environment Variables".

### 1. Supabase (the database)

1. Go to [supabase.com](https://supabase.com), sign up and click **New project**.
   - Name: `tutorings`. Choose a database password (save it somewhere). Region: **East US** or the closest one to Mexico.
2. When the project is ready, open **SQL Editor** in the left menu, then **New query**.
3. Open the file [`supabase/schema.sql`](supabase/schema.sql) in this repo, copy everything, paste it in the editor and click **Run**. You should see "Success". This creates the tables and loads your weekly blocked times and hours.
4. Go to **Project Settings → Data API** (or click **Connect** at the top) and copy the **Project URL**. That's your `SUPABASE_URL`.
5. Go to **Project Settings → API Keys** and copy the **secret** key (starts with `sb_secret_`). That's your `SUPABASE_SECRET_KEY`. If you only see "legacy" keys, the **service_role** key works too.

> Note: free Supabase projects pause after a week with no activity. If that happens, open Supabase and click **Restore**.

### 2. Vercel (put the app online)

1. Go to [vercel.com](https://vercel.com) and sign up **with your GitHub account**.
2. Click **Add New… → Project**, find `tutorings` and click **Import**.
3. Open **Environment Variables** and add:

   | Name | Value |
   |---|---|
   | `SUPABASE_URL` | from Supabase step 4 |
   | `SUPABASE_SECRET_KEY` | from Supabase step 5 |
   | `ADMIN_PASSWORD` | a password you choose for `/admin` |

4. Click **Deploy**. After a minute you'll get a link like `https://tutorings-xxxx.vercel.app`.
5. Open the link to check the student page, then open `/admin` and log in with your password.

Your app's address is `https://<your-app>.vercel.app`. You can rename it in Vercel → Project → Settings → Domains.

### 3. Google Calendar

**a. Create the Google project**

1. Go to [console.cloud.google.com](https://console.cloud.google.com) with the Google account whose calendar you use.
2. At the top, click the project picker → **New project** → name it `tutorings` → **Create**. Make sure it's selected.
3. Search for **Google Calendar API** in the top search bar, open it and click **Enable**.

**b. Set up the consent screen** (the "allow access" page you'll see once)

1. Go to **APIs & Services → OAuth consent screen** (it may be called **Google Auth Platform**) and click **Get started**.
2. App name: `tutorings`. Support email: your email. Audience: **External**. Contact email: your email. Accept and **Create**.
3. Go to **Data Access → Add or remove scopes**. Search for `calendar.events`, tick `.../auth/calendar.events` and click **Update**, then **Save**.
4. Go to **Audience** and click **Publish app** → **Confirm**, so it says "In production".
   *This matters: in "Testing" mode Google disconnects the app every 7 days.*

**c. Create the keys**

1. Go to **Clients** (or **Credentials → Create credentials → OAuth client ID**).
2. Application type: **Web application**. Name: `tutorings`.
3. Under **Authorized redirect URIs**, click **Add URI** and paste:
   `https://<your-app>.vercel.app/api/google/callback`
   (use your real Vercel address).
4. Click **Create** and copy the **Client ID** and **Client secret**.

**d. Add them to Vercel**

1. In Vercel → your project → **Settings → Environment Variables**, add:

   | Name | Value |
   |---|---|
   | `GOOGLE_CLIENT_ID` | the Client ID |
   | `GOOGLE_CLIENT_SECRET` | the Client secret |

2. Go to **Deployments**, click **⋯** on the latest one, then **Redeploy**. New variables only work after a redeploy.

**e. Connect**

1. Open `https://<your-app>.vercel.app/admin` and click **Connect Google Calendar**.
2. Choose your account. Google will say **"Google hasn't verified this app"**. That's normal because the app is yours. Click **Advanced → Go to tutorings (unsafe)**, then **Continue**.
3. You'll land back on the admin page with "Google Calendar connected".

From then on:
- Events marked **Busy** in your calendar block those times for students. Events marked **Free** and all-day events (which are Free by default) don't block anything.
- New tutorings appear in your calendar, and the student gets an email invite.

---

## Changing things later

- **Weekly blocked times and hours**: edit them on `/admin`. No code needed.
- **Code changes**: every push to the `main` branch on GitHub redeploys automatically on Vercel.

## Running it on your computer (optional)

```bash
npm install
cp .env.example .env.local   # then fill in the values
npm run dev                  # open http://localhost:3000
```

For Google Calendar to work locally, also add `http://localhost:3000/api/google/callback` as a redirect URI.

## How it's built

- [Next.js](https://nextjs.org) (pages in `app/`, API in `app/api/`)
- Supabase Postgres (`supabase/schema.sql`). The database itself refuses two overlapping tutorings.
- Google Calendar REST API (`lib/google.ts`)
- PINs are stored hashed. After 8 wrong PINs for a name, that name is locked for 15 minutes.
