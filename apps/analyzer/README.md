# מערכת ניהול קידום אורגני — NINJA Analyzer

פלטפורמת אדמין פנימית של NINJA Digital לניהול לקוחות SEO.
מאוחסנת תחת `ninja-landing/apps/analyzer/` ונפרסת **בנפרד** ל-`seo.samp.ninja`.

מקור: הועתק מ-`C:\Users\sharon\projects\agency-tools\analyzer` ב-2026-05-12.
המקור נשאר ללא שינוי כגיבוי.

## הפעלה לוקאלית

```powershell
cd C:\Users\sharon\projects\ninja-landing\apps\analyzer
npm install
npx prisma generate
npm run dev
```

דפדפן: <http://localhost:3000>

הסשן הראשון דורש Auth דרך Supabase. הלוגין הוא דף `/login` עם אותם credentials של הפורטל (`/portal`).
המשתמש חייב להיות ב-`admin_users` ב-Supabase.

## משתני סביבה

ב-`apps/analyzer/.env` (כבר קיים, מועתק מ-`ninja-landing/.env`):

```bash
DATABASE_URL="file:./data/agency.db"

# Supabase — אותו פרויקט כמו הפורטל
PUBLIC_SUPABASE_URL=https://wgrtzrquymiwmflxaitj.supabase.co
PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...

# Google Search Console (Phase 2 — ראה HANDOFF המקורי)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_OAUTH_REDIRECT=http://localhost:3000/api/gsc/callback
```

## פריסה ל-Vercel ול-`seo.samp.ninja`

המדריך הזה מניח שניהו-לנדינג כבר מקושר ל-Vercel (פרויקט קיים).
האנלייזר ייפרס כ**פרויקט Vercel נפרד** באותו ריפו, עם Root Directory מותאם.

### 1. יצירת פרויקט Vercel חדש

ב-<https://vercel.com/new>:
1. **Import Git Repository** → בחר `sharon569/ninja-landing`.
2. **Project Name:** `ninja-analyzer`.
3. **Framework Preset:** Next.js (אוטומטי).
4. **Root Directory:** לחץ Edit → הזן `apps/analyzer`.
5. **Build Command:** השאר ברירת מחדל (`next build`).
6. **Install Command:** השאר ברירת מחדל (`npm install`).

### 2. משתני סביבה ב-Vercel

ב-Project Settings → Environment Variables, הוסף:

| שם | ערך | סוג |
|---|---|---|
| `PUBLIC_SUPABASE_URL` | `https://wgrtzrquymiwmflxaitj.supabase.co` | Production/Preview/Development |
| `PUBLIC_SUPABASE_ANON_KEY` | (מ-`ninja-landing/.env`) | Production/Preview/Development |
| `SUPABASE_SERVICE_ROLE_KEY` | (Sensitive) | Production/Preview/Development |
| `DATABASE_URL` | ⚠️ ראה למטה — Postgres חובה | Production/Preview |

> **⚠️ הערה קריטית — SQLite לא יעבוד ב-Vercel.**
>
> הפיתוח הנוכחי משתמש ב-`better-sqlite3` עם קובץ DB בדיסק. ב-Vercel (Fluid Compute) אין filesystem קבוע. לפני פריסת prod צריך להגר ל-Postgres:
> 1. Vercel Marketplace → Add Storage → **Neon Postgres** (חינם עד 0.5GB).
> 2. החלף את ה-DATABASE_URL ל-connection string של Neon.
> 3. החלף את ה-adapter ב-`src/lib/db.ts` מ-`@prisma/adapter-better-sqlite3` ל-`@prisma/adapter-neon`.
> 4. שנה את `provider` ב-`prisma/schema.prisma` מ-`sqlite` ל-`postgresql`.
> 5. הרץ `npx prisma migrate deploy` בסביבת prod.

### 3. חיבור הדומיין `seo.samp.ninja`

1. ב-Vercel project → **Settings → Domains** → **Add Domain** → `seo.samp.ninja`.
2. ב-DNS provider של `samp.ninja` (Cloudflare/וכו') הוסף רשומת CNAME:
   ```
   seo  CNAME  cname.vercel-dns.com
   ```
3. Vercel תקתקת SSL אוטומטית תוך כמה דקות.

### 4. הוספת המייל כ-admin ב-Supabase

ב-SQL Editor של Supabase (אם עוד לא בוצע):

```sql
insert into public.admin_users (user_id, email)
select id, email from auth.users where email = 'sharon@samp.ninja';
```

(אם כבר ביצעת את זה לפורטל — אין צורך, אותה טבלה.)

### 5. CI/CD

כל push ל-`main` יפרוס את שני הפרויקטים:
- `ninja-landing` (samp.ninja) — Astro
- `ninja-analyzer` (seo.samp.ninja) — Next.js

הכל ביחד באותו ריפו, שני פרויקטים נפרדים ב-Vercel.

## ארכיטקטורה — מה משותף ומה לא

| משאב | משותף עם הפורטל? |
|---|---|
| Supabase project | ✅ אותו פרויקט, אותם משתמשים |
| `admin_users` / `client_users` tables | ✅ אותם שורות |
| Auth cookies | ❌ קוקיז דומיין-בלעדיים. כניסה נפרדת לכל סאב-דומיין (`samp.ninja` ו-`seo.samp.ninja`). אופציה לעתיד: הגדרת `cookie domain=.samp.ninja` ל-SSO. |
| `analyzer` DB (clients/scans) | ❌ DB משלו (SQLite מקומית, Postgres ב-prod) |
| `analyzer` GSC tokens | ❌ שייכים לטבלת `GscConnection` של האנלייזר |

## רה-עיצוב 2026-05

עברה רה-עיצוב מלא לפי `samp.ninja/brand`:
- Dark theme עם Ninja Black + Blade Red + Shogun Gold.
- Rubik (display) + Heebo (body).
- שוריקן SVG בכל header.
- כל ה-`zinc-*` הוחלפו ב-`ninja-*` / `ink-*` / `blade` / `gold` tokens.

## רוצה להמשיך מאיפה שעצרנו?

ראה `C:\Users\sharon\projects\agency-tools\HANDOFF-analyzer.md` במקור — Phase 2-5 roadmap (GSC credentials, Keyword Bank, Article engine, Reports).
