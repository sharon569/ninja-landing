# מערכת ניהול קידום אורגני · v0.1 — STATUS

_עודכן: 2026-05-12_

מסמך פעיל. שני חלקים: מה המערכת מסוגלת לעשות עכשיו, ומה עשינו בסשן ההקמה.

---

## חלק 1 — מה המערכת מסוגלת לעשות

### גישה ופריסה
- חי באוויר ב-<https://seo.samp.ninja>
- פרויקט Vercel נפרד (`ninja-analyzer`), root directory `apps/analyzer/`
- כל push ל-branch `analyzer-deploy` ב-GitHub מפעיל פריסה (manual trigger בינתיים — productionBranch עדיין `main`)
- TLS אוטומטית מ-Vercel

### כניסה (Auth)
- דף `/login` עם שוריקן + מיתוג מלא
- כניסה דרך Supabase Auth (email + password) — אותו פרויקט Supabase של הפורטל ב-samp.ninja
- שיתוף של `auth.users` ו-`admin_users` עם הפורטל. רק משתמש שמופיע ב-`admin_users` יכול להיכנס
- `proxy.ts` חוסם את כל הנתיבים פרט ל-`/login` ו-`/auth/*`
- Logout דרך כפתור ב-header → `/auth/signout`

### לקוחות
- `/` — רשימת כל הלקוחות עם פס צד צבעוני (אדום / זהב / ירוק לפי כמות ממצאים)
- `/clients/new` — טופס הוספת לקוח: שם, baseUrl של פלאגאין, token. הטופס מאמת קריאת `/info` לפלאגאין לפני שמירה
- `/clients/[id]` — ראש לקוח עם 5 לשוניות:
  - **סקירה** — מטא חיבור (WP/Yoast/Woo), כרטיס סריקה אחרונה, top 3 ממצאים, כפתור הרצת סריקה
  - **אודיט** — כל הממצאים מקובצים ב-8 קטגוריות (01-08)
  - **Search Console** — נתוני GSC לפי property משויך
  - **דוח** — דוח ללקוח (Hebrew, ready to print)
  - **הגדרות** — פרטי חיבור + מחיקת לקוח

### סריקות (Scans)
- "הרצת סריקה" שולפת את כל הדפים מאתר וורדפרס דרך REST של הפלאגאין `agency-seo-scanner`
- ה-payload המלא נשמר ב-Vercel Blob (`ninja-scans`, private store)
- כל סריקה רצה את 21 כללי האודיט ומסכמת ל-`Finding` rows
- מטא של סריקה נשמר ב-`Scan` (כולל duration, sizeBytes, summary JSON)
- **לקוחות שמותקנים:** Levizon Market (2 סריקות היסטוריות, 16 ממצאים)

### Audit Engine
21 כללים ב-8 קטגוריות:
- **אינדוקס וזחילה** (3): noindex, canonical external, canonical mismatch
- **מטא בעמוד** (7): missing title/description/focus keyword, title/description length
- **מבנה HTML** (3): missing H1, multiple H1, hierarchy skip
- **איכות תוכן** (1): thin content
- **תמונות** (3): filename alt, featured image missing alt, body images missing alt
- **קישוריות פנימית** (2): orphan page, no internal links out
- **סכמה** (2): missing schema type, product missing schema
- **קניבליזציה** (2): cannibal focus keyword, duplicate title

### Issue drill-down
- `/clients/[id]/issues/[fid]` — דף ייעודי לכל ממצא: חומרה, תיאור, fix hint, רשימת דפים מושפעים (עד 500), לינק לפתיחת כל דף ב-tab חדש

### Search Console
- חשבון Google מרכזי אחד לכל הסוכנות (`GscAccount` singleton)
- עמוד `/integrations` — חיבור Google (OAuth offline access + webmasters.readonly), רשימת כל ה-properties שיש לך גישה, שיוך property→לקוח עם המלצה אוטומטית לפי דומיין
- כפתור "סנכרון" פר-לקוח שואב את 28 הימים האחרונים
- כפתור "סנכרון כל הלקוחות" ב-/integrations
- נתונים נשמרים ב-`GscDailyRow` (per-day-per-query) → מצטברים לטבלת top queries בלקוח

### Hebrew / RTL
- כל ה-UI הפונה ללקוח הסופי בעברית עם RTL מלא
- פונטים: Rubik (display) + Heebo (body), Google Fonts
- צבעי מותג מ-samp.ninja/brand: Ninja Black, Blade Red, Shogun Gold, Success Green
- Time formatters: "ממש עכשיו", "לפני 27 דק׳", "לפני 3 ימים"
- Severity labels: קריטי / חשוב / מינורי / מידע

---

## חלק 2 — מה עשינו ב-2026-05-12

### העברה
1. העתקת `agency-tools/analyzer/` → `ninja-landing/apps/analyzer/` (המקור נשמר ב-`C:\Users\sharon\projects\agency-tools\` כגיבוי)
2. ניקוי קוננים: הסרת `.git` מקונן, `.next`, `node_modules`

### רה-עיצוב לפי הברנד
- כתיבה מחדש של `globals.css` עם טוקנים של המותג (Tailwind 4 + @theme inline)
- בניית קומפוננטות `Logo.tsx` (שוריקן SVG + NINJA wordmark) ו-`LogoutButton.tsx`
- עיצוב מחדש של ה-layout, header, ועמוד הלקוחות הראשי
- bulk replace של כל `zinc-*`, `emerald-*`, `amber-*`, `red-500` ל-tokens של המותג בכל עמודי המשנה
- SubNav חדש עם פס gradient של אדום-זהב

### Auth
- שילוב Supabase Auth: `src/lib/supabase.ts` עם server client + middleware client
- בניית `src/proxy.ts` (Next.js 16 — middleware.ts יצא מאופנה) שחוסם את הכל ל-`admin_users` בלבד
- `/login` עם UseActionState pattern, כולל כנפרי 忍 ברקע
- `/auth/signout` route handler

### Database — Postgres
1. שינוי `prisma/schema.prisma` מ-sqlite ל-postgresql עם schema `analyzer` ייעודי
2. החלפת `@prisma/adapter-better-sqlite3` ב-`@prisma/adapter-pg`
3. עדכון `prisma.config.ts` להוסיף `DIRECT_URL` לעבודה עם Supabase pooler
4. מיגרציות ראשוניות: `init` + `gsc_central_account`
5. מיגרציית נתונים: סקריפט `scripts/migrate-from-sqlite.mjs` שהעביר את Levizon, 2 סריקות ו-16 ממצאים מה-SQLite הישן

### Storage — Vercel Blob
- יצירת blob store `ninja-scans` (private, region iad1)
- החלפת `fs.writeFile` ב-`@vercel/blob put()` בפעולת `runScan`
- כל סריקה חדשה תישמר אוטומטית ב-Blob — עובד גם לוקאלית וגם ב-Vercel

### Vercel
- יצירת פרויקט `ninja-analyzer` דרך REST API
- הגדרת 8 env vars: `DATABASE_URL`, `DIRECT_URL`, `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT`
- חיבור הדומיין `seo.samp.ninja`
- 4 פריסות שונות במהלך הסשן (כל פעם תקלה נפתרה: prisma generate, blob storage, GSC refactor)

### Google Search Console
- רה-עיצוב מודל ה-GSC מ-per-client ל-singleton account
- מחיקת `GscConnection`, יצירת `GscAccount`
- הוספת `Client.gscPropertyUrl` ו-`Client.gscLastSyncAt`
- עמוד `/integrations` חדש עם שיוך property↔לקוח אוטומטי לפי דומיין
- עדכון כל ה-server actions ב-`actions-gsc.ts`

### Next.js 16 specific
- `middleware.ts` → `proxy.ts` (השם השתנה ב-16)
- React 19 `useActionState` ב-LoginForm
- `params` & `searchParams` כ-Promise (חדש ב-16)

### העברת אזור (2026-05-12, מאוחר)
1. הפקת Supabase Management Access Token (פרטי, נמחק אחרי הסשן)
2. יצירת פרויקט Supabase חדש ב-`eu-central-1` (`ninja-eu`, ref `jcpydyoewnzandqsmisj`)
3. סקריפט `scripts/migrate-to-eu.py` (Management API + raw SQL):
   - החלת schemas (portal + analyzer migrations)
   - מיגרציית נתונים פוקוסת: `auth.users` (עם hashes), `public.admin_users`, ו-5 הטבלאות של `analyzer.*`
   - גודלי batch מותאמים לעמודות JSON גדולות (Finding: 1 שורה לבקשה)
   - אימות count פר-טבלה בסוף
4. עדכון 5 env vars ב-`ninja-analyzer` ב-Vercel (`PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, `DIRECT_URL`)
5. PATCH של הפרויקט: `serverlessFunctionRegion: "fra1"` + `functionDefaultRegions: ["fra1"]`
6. Redeploy → `x-vercel-id: fra1::fra1` ✓
7. TTFB ירד מ-~900ms ל-~250-450ms (שיפור פי 2-3)

**מה לא הועבר:** הפורטל (`public.*` של ניהול לקוחות, ~30 טבלאות עם types מורכבים — arrays, jsonb עם schema drift) — נשאר ב-Singapore עד מיגרציה ייעודית.

---

## חלק 3 — מה חסר / יעדים הבאים

| משימה | חשיבות | מאמץ |
|---|---|---|
| **~~העברה לאזור EU~~** (אנלייזר רץ ב-`fra1` עם Postgres ב-`eu-central-1`) | ✅ בוצע 2026-05-12 | — |
| **העברת הפורטל ל-EU** (`samp.ninja/portal/*` עדיין בסינגפור — 30+ טבלאות) | גבוהה — שיפור מהירות לפורטל | 1-2 שעות |
| מחיקת פרויקט Supabase הישן (Singapore) — רק אחרי שגם הפורטל יועבר | אסטטיקה | 5 דק |
| העברת Vercel Blob ל-`fra1` (כרגע ב-`iad1`) — אופציונלי | נמוך | 20 דק |
| הגדרת `productionBranch=analyzer-deploy` או מיזוג ל-main | בינונית — לזמין auto-deploy | 5 דק |
| ניקוי טוקנים זמניים מ-`.env` (`VERCEL_TOKEN`, `SUPABASE_ACCESS_TOKEN`, `NEW_DB_PASS`) | בטיחות | 2 דק |
| Phase 3: Keyword Bank — מילות מפתח יעד פר-לקוח, השוואה לנתוני GSC | בינונית | 2-3 ימים |
| Phase 4: Articles / Content Engine | נמוך | 3-4 ימים |
| Phase 5: סנכרון אוטומטי GSC כ-cron (Vercel Cron) | בינוני | 30 דק |
| הוספת קליינטים נוספים (meat-shop, נוספים) | תלוי לקוח | 5 דק להוספה |

---

## פרטים טכניים שחשובים לזכור

### גישות וזהויות (אחרי העברת EU)
- **Supabase project (האנלייזר):** `https://jcpydyoewnzandqsmisj.supabase.co` (name: `ninja-eu`)
- **DB region:** `eu-central-1` (Frankfurt) ✓
- **Schema:** `analyzer.*` (לא `public.*`)
- **Supabase project (הפורטל, עדיין):** `https://wgrtzrquymiwmflxaitj.supabase.co` (name: `ninja`, region: `ap-southeast-1` — יועבר בנפרד)
- **Vercel team:** `team_pAt1ZaPv71a4suNvotjIcf73` (`sharon's projects`)
- **Vercel project:** `prj_SiYP0DcxyBoAIfIddwsXKUo2NbIG` (`ninja-analyzer`) — function region `fra1` ✓
- **Domain:** `seo.samp.ninja` → CNAME → Vercel
- **Repo branch:** `analyzer-deploy` (אחרי merge ל-main, ה-branch ייעלם)
- **Blob store:** `store_gmTS8iJFffVTdIQd` (private, `ninja-scans`, region `iad1` — אפשר להעביר ל-`fra1` בעתיד)

### מקור הקוד המקורי
`C:\Users\sharon\projects\agency-tools\analyzer\` — לא נגענו, נשאר כגיבוי. כל פיתוח חדש קורה ב-`apps/analyzer/`.

### תלויות עיקריות (נכון להיום)
- `next@16.2.6` (App Router, Turbopack, proxy.ts pattern)
- `react@19.2.4` + `react-dom@19.2.4`
- `@prisma/client@7.8.0` + `@prisma/adapter-pg@7.8.0`
- `@supabase/ssr@0.6.1` + `@supabase/supabase-js@2.50.0`
- `@vercel/blob@2.0.1`
- `tailwindcss@4` (CSS-first config via `@theme inline`)

### env vars חשובים
- כולם ב-`apps/analyzer/.env` (local) וב-Vercel project settings (production)
- `VERCEL_TOKEN` נוצר חד-פעמית להקמת הפרויקט — לא צריך אותו יותר, אפשר למחוק

---

## איך להריץ לוקאלית

```powershell
cd C:\Users\sharon\projects\ninja-landing\apps\analyzer
npm install
npm run dev
```

→ <http://localhost:3000> → לוגין → אותו דבר כמו ב-production.

DB ו-Auth ב-cloud, אז התחלת dev server לא צריכה הקמה מקומית של כלום.
