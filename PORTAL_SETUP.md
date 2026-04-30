# Client Portal — Setup Checklist

This is the one-time setup for the NINJA Digital client portal.
After these steps, the portal lives at `samp.ninja/portal`.

---

## 1. Install dependencies

```bash
cd C:/Users/sharon/Projects/ninja-landing
npm install
```

This pulls in `@astrojs/vercel`, `@supabase/supabase-js`, `@supabase/ssr`.

## 2. Create a Supabase project

1. Go to https://app.supabase.com → **New project**
2. Name: `ninja-portal` (or whatever)
3. Region: closest to your clients (US East / EU)
4. Database password: **save in 1Password** — needed for direct DB access
5. Wait ~2 minutes for provisioning

## 3. Run the schema

1. In Supabase dashboard → **SQL Editor** → **New query**
2. Open `supabase/schema.sql` in this repo
3. Copy entire content → paste → **Run**
4. Verify in **Table Editor** that you see: `clients`, `admin_users`, `client_users`, `strategies`, `reports`, `change_log`, `search_terms_snapshot`, `kpi_snapshots`

## 4. Configure email provider (for magic links)

1. Supabase → **Authentication** → **Providers** → **Email**
2. Enable **"Enable Email Provider"**
3. **Disable** "Confirm email" (we use magic-link OTP, not email confirmation)
4. Set **Site URL**: `https://www.samp.ninja` (production) or `http://localhost:4321` (dev)
5. **Redirect URLs** — add ALL of these:
   - `https://www.samp.ninja/portal/auth/callback`
   - `http://localhost:4321/portal/auth/callback`

For production-grade email delivery, configure SMTP in **Project Settings → Auth**:
- Recommended provider: **Resend** ($0/month for 3K emails) or **Postmark**
- Set sender: `noreply@samp.ninja`
- Set sender name: `NINJA Digital`

Without custom SMTP, Supabase uses their default (limited to 4 emails/hour — fine for testing only).

## 5. Get your API keys

1. Supabase → **Settings** → **API**
2. Copy:
   - **Project URL** → `PUBLIC_SUPABASE_URL`
   - **anon / public key** → `PUBLIC_SUPABASE_ANON_KEY`
   - **service_role / secret key** → `SUPABASE_SERVICE_ROLE_KEY` (keep secret!)

## 6. Set environment variables

### Local dev (`.env` file at project root)

```bash
cp .env.example .env
# Edit .env, paste the 3 values from step 5
```

### Production (Vercel)

1. Vercel project → **Settings** → **Environment Variables**
2. Add all 3 vars (mark `SUPABASE_SERVICE_ROLE_KEY` as "Sensitive")
3. Deploy

## 7. Bootstrap yourself as the first admin

1. Run dev: `npm run dev`
2. Go to http://localhost:4321/portal/login
3. Sign in with `sharon@samp.ninja` (request magic link → check inbox)
4. Click the magic link — you'll see "no_client_assigned" error (expected)
5. **In Supabase SQL editor**, run:

```sql
insert into public.admin_users (user_id, email)
select id, email from auth.users where email = 'sharon@samp.ninja';
```

6. Refresh `/portal/login` — you'll be auto-routed to `/portal/admin` (when that page is built — coming next iteration)

## 8. Add your first client (manually for now)

In Supabase SQL editor:

```sql
-- 1. Insert the client record
insert into public.clients (google_ads_customer_id, business_name, vertical, primary_contact_email)
values ('1230389197', 'West Coast Carpet Pros', 'service', 'their_email@example.com');

-- 2. The client logs in via /portal/login with their_email@example.com
--    (they'll get magic link, click it, end up on /portal/login with "no_client_assigned" error)

-- 3. After they've signed in once, run this to link them:
insert into public.client_users (user_id, client_id, role)
select
  (select id from auth.users where email = 'their_email@example.com'),
  (select id from public.clients where google_ads_customer_id = '1230389197'),
  'viewer';
```

This whole flow will move into the portal admin UI in the next iteration.

---

## What's working after this setup

- ✅ `/portal/login` — magic link request screen (NINJA-branded)
- ✅ Magic link callback → session cookie
- ✅ Auth middleware gates `/portal/*`
- ✅ `/portal/dashboard` — client sees KPIs + latest reports + latest changes
- ✅ Sign out

## What's coming next iteration

- `/portal/strategy` — view current strategy doc
- `/portal/reports/[id]` — read individual report
- `/portal/changes` — full timeline
- `/portal/search-terms` — explorer
- `/portal/admin` — Sharon manages clients, posts strategies/reports/changes
- A `push_to_portal` skill for the Google Ads tools that auto-uploads reports to Supabase

## Known follow-ups

- The static pages (homepage, about, etc.) currently render via SSR because of `output: 'server'`. To bring back static rendering for performance, add `export const prerender = true;` to each page's frontmatter. Not urgent — Vercel SSR is plenty fast for landing pages.
- Custom SMTP (step 4) is optional for testing; required before sending magic links to real clients (Supabase default limits to 4/hour).

## Troubleshooting

**"Missing PUBLIC_SUPABASE_URL or PUBLIC_SUPABASE_ANON_KEY"**
→ `.env` not present or values not filled in.

**Magic link email never arrives**
→ Check spam. If still missing, verify Supabase email provider is enabled (step 4) and not over rate limit.

**"AuthApiError: Invalid login credentials"**
→ The user email isn't in `auth.users` yet. Magic link with `shouldCreateUser: false` rejects unknown emails. Either:
- Set `shouldCreateUser: true` in `login.astro` (lets anyone request a link), OR
- Pre-create the user via Supabase dashboard before they try to log in (recommended for client portals)

**"no_client_assigned" loop**
→ User signed in but no `client_users` row exists. Run the SQL in step 8.

**Local dev RLS denies queries**
→ Make sure you're signed in as a user that has either an `admin_users` row OR a `client_users` row linking to a real client.
