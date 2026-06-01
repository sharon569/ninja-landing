# תוכנית מימוש: טופס אינטייק "האוזן"

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** דף-wizard פרטי ב-`samp.ninja/brief/haozen` שלקוח "האוזן" ממלא, והתשובות נשמרות ל-Supabase + נשלחת התראת מייל לשרון.

**Architecture:** דף Astro (`prerender=false`) עם wizard ב-vanilla JS וטיוטה ב-`localStorage`; שליחה ל-`POST /api/brief` שמוודא, כותב ל-`intake_briefs` עם service-role client, ושולח מייל דרך Resend. עוקב אחר הדפוסים של `contact.astro` / `api/lead.ts`.

**Tech Stack:** Astro 6, Supabase (`@supabase/supabase-js` + `@supabase/ssr` קיימים), Resend (REST), Vitest (חדש — לולידציה הטהורה בלבד), TypeScript, vanilla JS.

**הנחות מאושרות:** route = `/brief/haozen`; טיוטה ב-`localStorage`; השאלון לפי spec 2026-06-01. spec מקור: `docs/superpowers/specs/2026-06-01-haozen-intake-brief-design.md`.

---

### Task 1: הקמת Vitest לולידציה הטהורה

**Files:**
- Modify: `package.json` (script + devDependency)
- Create: `vitest.config.ts`

- [ ] **Step 1: התקנת vitest**

Run: `cd C:/Users/sharon/projects/ninja-landing && npm i -D vitest`
Expected: `vitest` מתווסף ל-`devDependencies`.

- [ ] **Step 2: הוספת script ל-`package.json`**

ב-`"scripts"` הוסף שורה:

```json
"test": "vitest run"
```

- [ ] **Step 3: יצירת `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
```

- [ ] **Step 4: ודא שהריצה עובדת (אין בדיקות עדיין)**

Run: `npm test`
Expected: יוצא בהצלחה עם "No test files found" (exit 0) או הודעה דומה — לא קריסה.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json vitest.config.ts
git commit -m "chore: add vitest for unit tests"
```

---

### Task 2: מודול ולידציה (`brief-validation.ts`) — TDD

**Files:**
- Create: `src/lib/brief-validation.ts`
- Test: `src/lib/brief-validation.test.ts`

מפתחות השדות (תואם spec §5). פרטי קשר חובה; שאר הסקציות נאספות גמיש ל-`answers`.

- [ ] **Step 1: כתיבת הבדיקות (נכשלות)**

```ts
// src/lib/brief-validation.test.ts
import { describe, it, expect } from 'vitest';
import { normalizePhone, isValidPhone, validateContact, buildAnswers } from './brief-validation';

describe('normalizePhone', () => {
  it('strips spaces and dashes', () => {
    expect(normalizePhone('050-123 4567')).toBe('0501234567');
  });
});

describe('isValidPhone', () => {
  it('accepts Israeli mobile/landline', () => {
    expect(isValidPhone('0501234567')).toBe(true);
    expect(isValidPhone('02-6236631')).toBe(true);
  });
  it('rejects junk', () => {
    expect(isValidPhone('123')).toBe(false);
    expect(isValidPhone('abc')).toBe(false);
  });
});

describe('validateContact', () => {
  it('passes with valid fields', () => {
    expect(validateContact({ business_name: 'האוזן', contact_name: 'דני', phone: '0501234567' }))
      .toEqual({ ok: true });
  });
  it('fails on short business name', () => {
    expect(validateContact({ business_name: 'א', contact_name: 'דני', phone: '0501234567' }).ok).toBe(false);
  });
  it('fails on bad phone', () => {
    expect(validateContact({ business_name: 'האוזן', contact_name: 'דני', phone: '123' }).ok).toBe(false);
  });
});

describe('buildAnswers', () => {
  it('collects non-contact fields into a flat object, skipping empties and honeypot', () => {
    const form = new FormData();
    form.set('business_name', 'האוזן');   // contact — excluded
    form.set('_honey', '');                 // honeypot — excluded
    form.set('domain_structure', 'separate');
    form.set('inear_brand', 'מותג נפרד');
    form.set('empty_field', '');            // excluded (empty)
    expect(buildAnswers(form)).toEqual({
      domain_structure: 'separate',
      inear_brand: 'מותג נפרד',
    });
  });
  it('groups repeated checkbox values into arrays', () => {
    const form = new FormData();
    form.append('inear_brands', 'UE');
    form.append('inear_brands', '64 Audio');
    expect(buildAnswers(form).inear_brands).toEqual(['UE', '64 Audio']);
  });
});
```

- [ ] **Step 2: הרצה לוודא כשל**

Run: `npm test`
Expected: FAIL — "Cannot find module './brief-validation'".

- [ ] **Step 3: מימוש המודול**

```ts
// src/lib/brief-validation.ts

// שדות פרטי קשר — לא נכנסים ל-answers, חלקם חובה.
const CONTACT_FIELDS = new Set(['business_name', 'contact_name', 'phone', 'email']);
const META_FIELDS = new Set(['_honey']);

export function normalizePhone(raw: string): string {
  return raw.replace(/[\s\-]/g, '');
}

export function isValidPhone(raw: string): boolean {
  return /^0\d{8,9}$/.test(normalizePhone(raw));
}

export interface ContactInput {
  business_name: string;
  contact_name: string;
  phone: string;
  email?: string;
}

export function validateContact(c: ContactInput): { ok: boolean; error?: string } {
  if ((c.business_name ?? '').trim().length < 2) return { ok: false, error: 'invalid_business' };
  if ((c.contact_name ?? '').trim().length < 2) return { ok: false, error: 'invalid_contact' };
  if (!isValidPhone(c.phone ?? '')) return { ok: false, error: 'invalid_phone' };
  return { ok: true };
}

/** אוסף את כל שדות השאלון (פרט לפרטי קשר ו-meta) ל-object גמיש; ערכים חוזרים → מערך. */
export function buildAnswers(form: FormData): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const key of new Set(form.keys())) {
    if (CONTACT_FIELDS.has(key) || META_FIELDS.has(key)) continue;
    const values = form.getAll(key).map((v) => v.toString().trim()).filter(Boolean);
    if (values.length === 0) continue;
    out[key] = values.length === 1 ? values[0] : values;
  }
  return out;
}
```

- [ ] **Step 4: הרצה לוודא הצלחה**

Run: `npm test`
Expected: PASS — כל הבדיקות עוברות.

- [ ] **Step 5: Commit**

```bash
git add src/lib/brief-validation.ts src/lib/brief-validation.test.ts
git commit -m "feat: brief intake validation module + tests"
```

---

### Task 3: service-role + Resend helpers

**Files:**
- Modify: `src/lib/supabase.ts` (הוספת פונקציה בסוף)
- Create: `src/lib/resend.ts`

- [ ] **Step 1: הוספת `createSupabaseServiceClient` ל-`src/lib/supabase.ts`**

הוסף בראש הקובץ ליד שאר ה-import:

```ts
import { createClient } from '@supabase/supabase-js';
```

הוסף בסוף הקובץ:

```ts
/**
 * Service-role client — bypasses RLS. Server-only (API routes).
 * NEVER import into client-side code.
 */
export function createSupabaseServiceClient() {
  const key = import.meta.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY');
  return createClient(SUPABASE_URL, key, { auth: { persistSession: false } });
}
```

- [ ] **Step 2: יצירת `src/lib/resend.ts`**

```ts
// Minimal Resend REST helper (shared by lead + brief endpoints).
const FROM_EMAIL = process.env.LEAD_FROM_EMAIL ?? 'NINJA Digital <hello@send.samp.ninja>';

export async function sendEmail(payload: {
  to: string[];
  reply_to?: string;
  subject: string;
  html: string;
}): Promise<{ ok: boolean }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.log('[email] no RESEND_API_KEY — logged only:', payload.subject);
    return { ok: true };
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM_EMAIL, ...payload }),
  });
  if (!res.ok) {
    console.error('[email] resend rejected', res.status, (await res.text().catch(() => '')).slice(0, 200));
  }
  return { ok: res.ok };
}
```

- [ ] **Step 3: type-check**

Run: `npx astro check`
Expected: אין שגיאות חדשות בקבצים שנגעת בהם.

- [ ] **Step 4: Commit**

```bash
git add src/lib/supabase.ts src/lib/resend.ts
git commit -m "feat: service-role supabase client + shared resend helper"
```

---

### Task 4: Migration — טבלת `intake_briefs`

**Files:**
- Create: `supabase/migration_004_intake_briefs.sql`

- [ ] **Step 1: כתיבת ה-migration**

```sql
-- Migration 004: intake_briefs
-- Stores the "האוזן" website intake brief submitted at /brief/haozen.
-- Run in Supabase SQL editor.

create table if not exists public.intake_briefs (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  business_name text not null,
  contact_name  text not null,
  phone         text not null,
  email         text,
  answers       jsonb not null default '{}'::jsonb,
  source        text default 'brief/haozen',
  ip            text,
  status        text default 'new'   -- new | reviewed | in_progress | done
);

create index if not exists intake_briefs_created_idx
  on public.intake_briefs (created_at desc);

alter table public.intake_briefs enable row level security;

-- Reads: admins only. Writes: via service-role only (bypasses RLS), so no insert policy.
create policy intake_briefs_admin_select on public.intake_briefs for select
  using (public.is_admin());
```

- [ ] **Step 2: הרצה ב-Supabase**

ב-Supabase Dashboard → SQL Editor → New query → הדבק → Run.
Expected: "Success. No rows returned". ודא ב-Table Editor שהטבלה `intake_briefs` קיימת.

> אם `public.is_admin()` לא קיים בפרויקט — בדוק ב-`supabase/schema.sql`; היא משמשת כבר ב-migration_003.

- [ ] **Step 3: Commit**

```bash
git add supabase/migration_004_intake_briefs.sql
git commit -m "feat: intake_briefs table migration"
```

---

### Task 5: API route — `POST /api/brief`

**Files:**
- Create: `src/pages/api/brief.ts`

- [ ] **Step 1: כתיבת ה-endpoint**

```ts
import type { APIRoute } from 'astro';
import { validateContact, buildAnswers, normalizePhone } from '../../lib/brief-validation';
import { createSupabaseServiceClient } from '../../lib/supabase';
import { sendEmail } from '../../lib/resend';

export const prerender = false;

const ADMIN_EMAIL = 'sharon@samp.ninja';

export const POST: APIRoute = async ({ request }) => {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json({ success: false, error: 'invalid_form' }, 400);
  }

  // honeypot
  if ((form.get('_honey') ?? '').toString().trim()) return json({ success: true });

  const contact = {
    business_name: (form.get('business_name') ?? '').toString().trim(),
    contact_name: (form.get('contact_name') ?? '').toString().trim(),
    phone: (form.get('phone') ?? '').toString().trim(),
    email: (form.get('email') ?? '').toString().trim(),
  };

  const v = validateContact(contact);
  if (!v.ok) return json({ success: false, error: v.error }, 400);

  const answers = buildAnswers(form);
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown';

  // persist
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from('intake_briefs')
    .insert({
      business_name: contact.business_name,
      contact_name: contact.contact_name,
      phone: normalizePhone(contact.phone),
      email: contact.email || null,
      answers,
      ip,
    })
    .select('id')
    .single();

  if (error) {
    console.error('[brief] insert failed', error.message);
    return json({ success: false, error: 'save_failed' }, 502);
  }

  // notify admin (non-fatal)
  await sendEmail({
    to: [ADMIN_EMAIL],
    reply_to: contact.email || undefined,
    subject: `אפיון חדש: ${contact.business_name}`,
    html: renderAdmin(contact, answers, data!.id),
  });

  return json({ success: true });
};

function renderAdmin(
  c: { business_name: string; contact_name: string; phone: string; email: string },
  answers: Record<string, unknown>,
  id: string,
) {
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const rows = Object.entries(answers)
    .map(
      ([k, val]) =>
        `<tr><td style="padding:6px 10px;border-bottom:1px solid #eee;"><strong>${esc(k)}</strong></td><td style="padding:6px 10px;border-bottom:1px solid #eee;">${esc(Array.isArray(val) ? val.join(', ') : String(val))}</td></tr>`,
    )
    .join('');
  return `
    <div style="font-family:'Heebo',system-ui,sans-serif;max-width:680px;margin:0 auto;color:#0a0a0a;direction:rtl;">
      <h2>אפיון חדש — ${esc(c.business_name)}</h2>
      <p>איש קשר: ${esc(c.contact_name)} · ${esc(c.phone)} · ${esc(c.email || '—')}</p>
      <p>מזהה רשומה: <code>${esc(id)}</code></p>
      <table style="border-collapse:collapse;width:100%;margin-top:14px;">${rows}</table>
    </div>`;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
```

- [ ] **Step 2: type-check**

Run: `npx astro check`
Expected: אין שגיאות בקובץ.

- [ ] **Step 3: Commit**

```bash
git add src/pages/api/brief.ts
git commit -m "feat: /api/brief endpoint — persist + notify"
```

---

### Task 6: דף ה-wizard — מבנה ושדות

**Files:**
- Create: `src/pages/brief/haozen.astro`

הסקציות והשדות לפי spec §5. כל שדה: `name` = מפתח snake_case; checkbox = אותו `name` חוזר. דפוס סקציה אחיד.

- [ ] **Step 1: יצירת הדף עם כל הסקציות**

```astro
---
import Layout from '../../layouts/Layout.astro';
---
<Layout
  title="אפיון אתר — האוזן | NINJA Digital"
  description="טופס אפיון פנימי"
  noindex={true}
  hideNav={true}
  hideFloatWA={true}
>
<main class="brief" dir="rtl">
  <div class="brief-card">
    <header class="brief-head">
      <div class="brief-eyebrow">NINJA DIGITAL · אפיון</div>
      <div class="brief-progress"><span id="bar"></span></div>
      <div class="brief-step" id="stepLabel">שלב 1 מתוך 8</div>
    </header>

    <form id="briefForm" action="/api/brief" method="POST" novalidate>
      <input type="text" name="_honey" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px" />

      <!-- ס׳1: פרטי קשר (חובה) -->
      <fieldset class="brief-section" data-step="1">
        <h2>פרטי קשר</h2>
        <label>שם העסק<input name="business_name" required /></label>
        <label>איש קשר<input name="contact_name" required /></label>
        <label>טלפון<input name="phone" type="tel" required placeholder="050-0000000" /></label>
        <label>דוא״ל<input name="email" type="email" placeholder="name@business.co.il" /></label>
      </fieldset>

      <!-- ס׳2: תמונה כללית והפרדה -->
      <fieldset class="brief-section" data-step="2" hidden>
        <h2>תמונה כללית והפרדה</h2>
        <p class="q">מבנה הדומיינים</p>
        <label class="opt"><input type="radio" name="domain_structure" value="שני דומיינים נפרדים" /> שני דומיינים נפרדים</label>
        <label class="opt"><input type="radio" name="domain_structure" value="תת-דומיין" /> תת-דומיין</label>
        <label class="opt"><input type="radio" name="domain_structure" value="תיקייה תחת אותו אתר" /> תיקייה תחת אותו אתר</label>
        <label>פרטים נוספים<textarea name="domain_notes" rows="2"></textarea></label>
        <p class="q">המותג של אתר ה-in-ear</p>
        <label class="opt"><input type="radio" name="inear_brand_mode" value="ממשיך כהאוזן" /> ממשיך כ"האוזן"</label>
        <label class="opt"><input type="radio" name="inear_brand_mode" value="מותג נפרד" /> מותג נפרד</label>
        <label>שם המותג אם יש<input name="inear_brand_name" /></label>
        <p class="q">הקישור בין האתרים</p>
        <label class="opt"><input type="checkbox" name="link_style" value="תפריט" /> כפתור בתפריט</label>
        <label class="opt"><input type="checkbox" name="link_style" value="באנר" /> באנר עליון</label>
        <label class="opt"><input type="checkbox" name="link_style" value="דו-כיווני" /> קישור דו-כיווני</label>
        <label>הסיבה העיקרית להפרדה<textarea name="separation_reason" rows="2"></textarea></label>
      </fieldset>

      <!-- ס׳3: אתר האוזן -->
      <fieldset class="brief-section" data-step="3" hidden>
        <h2>אתר האוזן (מכשירי שמיעה)</h2>
        <label class="opt"><input type="radio" name="haozen_type" value="תדמיתי" /> תדמיתי — לידים בלבד</label>
        <label class="opt"><input type="radio" name="haozen_type" value="גם חנות אביזרים" /> גם חנות אביזרים</label>
        <label>מכשירי שמיעה — ליד בלבד? הערות<textarea name="hearing_aids_mode" rows="2"></textarea></label>
        <p class="q">מותגי מכשירים</p>
        <label class="opt"><input type="checkbox" name="aid_brands" value="Phonak" /> Phonak</label>
        <label class="opt"><input type="checkbox" name="aid_brands" value="ReSound" /> ReSound</label>
        <label class="opt"><input type="checkbox" name="aid_brands" value="Starkey" /> Starkey</label>
        <label class="opt"><input type="checkbox" name="aid_brands" value="Bernafon" /> Bernafon</label>
        <label>יבואן רשמי של מי?<input name="aid_importer" /></label>
        <label>קופות חולים בהסדר<textarea name="health_funds" rows="2"></textarea></label>
      </fieldset>

      <!-- ס׳4: אתר ה-in-ear -->
      <fieldset class="brief-section" data-step="4" hidden>
        <h2>אתר ה-in-ear / מוזיקאים</h2>
        <p class="q">יבואן רשמי של in-ear?</p>
        <label class="opt"><input type="radio" name="inear_importer" value="יבואן בלעדי" /> כן, יבואן בלעדי</label>
        <label class="opt"><input type="radio" name="inear_importer" value="נקודת מכירה" /> נקודת מכירה</label>
        <p class="q">מותגים</p>
        <label class="opt"><input type="checkbox" name="inear_brands" value="UE" /> Ultimate Ears</label>
        <label class="opt"><input type="checkbox" name="inear_brands" value="64 Audio" /> 64 Audio</label>
        <label class="opt"><input type="checkbox" name="inear_brands" value="Westone" /> Westone</label>
        <label class="opt"><input type="checkbox" name="inear_brands" value="Shure" /> Shure</label>
        <label class="opt"><input type="checkbox" name="inear_brands" value="qdc" /> qdc</label>
        <label>מותגים נוספים<input name="inear_brands_other" /></label>
        <p class="q">מודל מכירה</p>
        <label class="opt"><input type="radio" name="inear_commerce" value="חנות מלאה" /> חנות מלאה (checkout)</label>
        <label class="opt"><input type="radio" name="inear_commerce" value="קטלוג + פנייה" /> קטלוג + פנייה</label>
        <label>מה נמכר ישירות בעגלה<textarea name="inear_direct_sale" rows="2"></textarea></label>
        <label>תהליך הזמנת מוניטור אישי<textarea name="inear_order_flow" rows="3"></textarea></label>
        <p class="q">קהל יעד</p>
        <label class="opt"><input type="checkbox" name="inear_audience" value="מקצוענים" /> מקצוענים על במה</label>
        <label class="opt"><input type="checkbox" name="inear_audience" value="חובבים" /> חובבים</label>
        <label class="opt"><input type="checkbox" name="inear_audience" value="אולפן" /> אנשי אולפן/סאונד</label>
        <label class="opt"><input type="checkbox" name="inear_audience" value="ספורט" /> ספורט</label>
      </fieldset>

      <!-- ס׳5: מסחר -->
      <fieldset class="brief-section" data-step="5" hidden>
        <h2>מסחר, תשלומים, לוגיסטיקה</h2>
        <label>ספק סליקה<input name="payment_provider" placeholder="Tranzila / iCredit / Cardcom / PayPlus / משולם / עדיין אין" /></label>
        <label class="opt"><input type="checkbox" name="payment_wallets" value="Bit" /> Bit</label>
        <label class="opt"><input type="checkbox" name="payment_wallets" value="Apple Pay" /> Apple Pay</label>
        <p class="q">משלוחים</p>
        <label class="opt"><input type="checkbox" name="shipping" value="חברת שילוח" /> חברת שילוח</label>
        <label class="opt"><input type="checkbox" name="shipping" value="דואר" /> דואר</label>
        <label class="opt"><input type="checkbox" name="shipping" value="איסוף בסניף" /> איסוף עצמי בסניף</label>
        <label>משלוח חינם מעל סכום<input name="free_shipping_threshold" /></label>
        <label>מערכת חשבוניות<input name="invoicing" /></label>
        <label>מי מעדכן מלאי/מחירים + צורך ב-CMS<textarea name="inventory_management" rows="2"></textarea></label>
      </fieldset>

      <!-- ס׳6: לידים -->
      <fieldset class="brief-section" data-step="6" hidden>
        <h2>לידים, תורים, CRM</h2>
        <p class="q">קביעת בדיקה</p>
        <label class="opt"><input type="checkbox" name="booking_channels" value="טופס" /> טופס פנייה</label>
        <label class="opt"><input type="checkbox" name="booking_channels" value="וואטסאפ" /> וואטסאפ</label>
        <label class="opt"><input type="checkbox" name="booking_channels" value="טלפון" /> טלפון</label>
        <label class="opt"><input type="checkbox" name="booking_channels" value="תור אונליין" /> קביעת תור אונליין</label>
        <label class="opt"><input type="radio" name="booking_per_branch" value="כן" /> תור לפי סניף (ירושלים/מבשרת)</label>
        <label class="opt"><input type="radio" name="booking_per_branch" value="לא" /> ללא הפרדת סניפים</label>
        <label>לאן הליד מגיע (מייל/וואטסאפ/CRM)<textarea name="lead_destination" rows="2"></textarea></label>
        <label>וואטסאפ — כפתור צף, מספר לכל אתר<textarea name="whatsapp_notes" rows="2"></textarea></label>
      </fieldset>

      <!-- ס׳7: תוכן ועיצוב -->
      <fieldset class="brief-section" data-step="7" hidden>
        <h2>תוכן, מותג, עיצוב</h2>
        <p class="q">נכסים קיימים</p>
        <label class="opt"><input type="checkbox" name="assets" value="לוגו" /> לוגו</label>
        <label class="opt"><input type="checkbox" name="assets" value="תמונות" /> תמונות מקצועיות</label>
        <label class="opt"><input type="checkbox" name="assets" value="קטלוג" /> קטלוג מוצרים</label>
        <label class="opt"><input type="checkbox" name="assets" value="טקסטים" /> טקסטים</label>
        <label>פירוט נכסים<textarea name="assets_notes" rows="2"></textarea></label>
        <label class="opt"><input type="radio" name="languages" value="עברית בלבד" /> עברית בלבד</label>
        <label class="opt"><input type="radio" name="languages" value="עברית + אנגלית למוזיקאים" /> עברית + אנגלית לאזור המוזיקאים</label>
        <label>רפרנסים / אתרים אהובים<textarea name="references" rows="2"></textarea></label>
        <label class="opt"><input type="radio" name="blog" value="כן" /> רוצים בלוג/תוכן SEO</label>
        <label class="opt"><input type="radio" name="blog" value="לא" /> לא בשלב זה</label>
      </fieldset>

      <!-- ס׳8: טכני ותפעול -->
      <fieldset class="brief-section" data-step="8" hidden>
        <h2>טכני, נגישות, תפעול</h2>
        <label>מצב קיים (Wix? דומיין? מי מחזיק)<textarea name="current_state" rows="2"></textarea></label>
        <label class="opt"><input type="radio" name="seo_migration" value="כן" /> יש כתובות מדורגות לשמר</label>
        <label class="opt"><input type="radio" name="seo_migration" value="לא" /> אין / לא ידוע</label>
        <label>פירוט מיגרציה/SEO<textarea name="seo_notes" rows="2"></textarea></label>
        <p class="q">מדידה</p>
        <label class="opt"><input type="checkbox" name="analytics" value="GA" /> Google Analytics</label>
        <label class="opt"><input type="checkbox" name="analytics" value="פיקסל" /> פיקסל פייסבוק</label>
        <label class="opt"><input type="checkbox" name="analytics" value="Ads" /> Google Ads</label>
        <label class="opt"><input type="checkbox" name="analytics" value="Search Console" /> Search Console</label>
        <label class="opt"><input type="radio" name="legal_docs" value="קיים" /> מסמכים משפטיים קיימים</label>
        <label class="opt"><input type="radio" name="legal_docs" value="צריך" /> צריך לנסח</label>
        <label>לוחות זמנים, תקציב, סדר עדיפות<textarea name="timeline_budget" rows="3"></textarea></label>
        <label>מי מתחזק אחרי השקה + הדרכה<textarea name="maintenance" rows="2"></textarea></label>
      </fieldset>

      <nav class="brief-nav">
        <button type="button" id="prevBtn" class="btn" hidden>הקודם</button>
        <button type="button" id="nextBtn" class="btn btn-primary">הבא »</button>
        <button type="submit" id="submitBtn" class="btn btn-primary" hidden>שליחת האפיון</button>
      </nav>
      <div class="form-status" id="status" role="status" aria-live="polite"></div>
    </form>

    <div class="brief-done" id="done" hidden>
      <h2>קיבלנו את האפיון 🥷</h2>
      <p>תודה. נעבור על הפרטים ונחזור אליכם עם הצעדים הבאים.</p>
    </div>
  </div>
</main>
</Layout>
```

- [ ] **Step 2: type-check + build**

Run: `npx astro check`
Expected: אין שגיאות. (ה-wizard עוד לא אינטראקטיבי — זה Task 7.)

- [ ] **Step 3: Commit**

```bash
git add src/pages/brief/haozen.astro
git commit -m "feat: brief wizard page structure (8 sections)"
```

---

### Task 7: לוגיקת ה-wizard — ניווט, טיוטה, שליחה

**Files:**
- Modify: `src/pages/brief/haozen.astro` (הוספת בלוק `<script>` לפני `</Layout>`)

- [ ] **Step 1: הוספת ה-script**

```astro
<script>
  const TOTAL = 8;
  const form = document.getElementById('briefForm') as HTMLFormElement;
  const sections = Array.from(document.querySelectorAll<HTMLElement>('.brief-section'));
  const bar = document.getElementById('bar')!;
  const stepLabel = document.getElementById('stepLabel')!;
  const prevBtn = document.getElementById('prevBtn') as HTMLButtonElement;
  const nextBtn = document.getElementById('nextBtn') as HTMLButtonElement;
  const submitBtn = document.getElementById('submitBtn') as HTMLButtonElement;
  const statusEl = document.getElementById('status')!;
  const doneEl = document.getElementById('done')!;
  const KEY = 'haozen_brief_draft';
  let step = 1;

  function render() {
    sections.forEach((s) => (s.hidden = Number(s.dataset.step) !== step));
    bar.style.width = `${(step / TOTAL) * 100}%`;
    stepLabel.textContent = `שלב ${step} מתוך ${TOTAL}`;
    prevBtn.hidden = step === 1;
    nextBtn.hidden = step === TOTAL;
    submitBtn.hidden = step !== TOTAL;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ולידציה לשלב 1 בלבד (פרטי קשר חובה)
  function validateStep1(): boolean {
    if (step !== 1) return true;
    const reqs = sections[0].querySelectorAll<HTMLInputElement>('[required]');
    for (const el of reqs) {
      if (!el.value.trim()) { el.focus(); statusEl.textContent = 'נא למלא שם עסק, איש קשר וטלפון.'; return false; }
    }
    statusEl.textContent = '';
    return true;
  }

  nextBtn.addEventListener('click', () => { if (validateStep1() && step < TOTAL) { step++; render(); saveDraft(); } });
  prevBtn.addEventListener('click', () => { if (step > 1) { step--; render(); } });

  // טיוטה ב-localStorage
  function saveDraft() {
    const data: Record<string, string[]> = {};
    new FormData(form).forEach((v, k) => {
      if (k === '_honey') return;
      (data[k] ??= []).push(v.toString());
    });
    localStorage.setItem(KEY, JSON.stringify(data));
  }
  function restoreDraft() {
    const raw = localStorage.getItem(KEY);
    if (!raw) return;
    try {
      const data = JSON.parse(raw) as Record<string, string[]>;
      for (const [k, vals] of Object.entries(data)) {
        const fields = form.querySelectorAll<HTMLInputElement>(`[name="${CSS.escape(k)}"]`);
        fields.forEach((f) => {
          if (f.type === 'checkbox' || f.type === 'radio') f.checked = vals.includes(f.value);
          else f.value = vals[0] ?? '';
        });
      }
    } catch { /* ignore corrupt draft */ }
  }
  form.addEventListener('input', saveDraft);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!validateStep1()) { step = 1; render(); return; }
    submitBtn.disabled = true;
    statusEl.textContent = 'שולח…';
    try {
      const res = await fetch('/api/brief', { method: 'POST', body: new FormData(form) });
      const out = await res.json();
      if (out.success) {
        localStorage.removeItem(KEY);
        form.hidden = true;
        document.querySelector('.brief-head')!.setAttribute('hidden', '');
        doneEl.hidden = false;
      } else {
        statusEl.textContent = 'שגיאה בשליחה. בדקו את פרטי הקשר ונסו שוב.';
        submitBtn.disabled = false;
      }
    } catch {
      statusEl.textContent = 'תקלת רשת. נסו שוב.';
      submitBtn.disabled = false;
    }
  });

  restoreDraft();
  render();
</script>
```

- [ ] **Step 2: build**

Run: `npx astro check && npm run build`
Expected: build מצליח ללא שגיאות TypeScript.

- [ ] **Step 3: Commit**

```bash
git add src/pages/brief/haozen.astro
git commit -m "feat: brief wizard interactivity — nav, draft, submit"
```

---

### Task 8: עיצוב ברנד נינג'ה

**Files:**
- Modify: `src/pages/brief/haozen.astro` (הוספת `<style>` scoped)

- [ ] **Step 1: הוספת הסגנונות**

```astro
<style>
  .brief { min-height: 100vh; background: #08090c; color: #f5f5f7; padding: 48px 16px; display: flex; justify-content: center; }
  .brief-card { width: 100%; max-width: 640px; }
  .brief-eyebrow { font-family: 'Rubik', sans-serif; font-weight: 900; letter-spacing: 0.22em; font-size: 12px; color: #ffd166; }
  .brief-progress { height: 6px; background: #1c1d22; border-radius: 999px; margin: 14px 0 6px; overflow: hidden; }
  .brief-progress span { display: block; height: 100%; width: 12.5%; background: linear-gradient(90deg, #b3001b, #ff2a3c); transition: width .3s ease; }
  .brief-step { font-size: 13px; color: #a8acb6; }
  .brief-section h2 { font-family: 'Rubik', sans-serif; font-weight: 800; font-size: 24px; margin: 28px 0 18px; }
  .brief-section .q { font-weight: 700; margin: 18px 0 8px; color: #f5f5f7; }
  .brief-section label { display: block; margin-bottom: 12px; font-size: 15px; color: #f5f5f7; }
  .brief-section label.opt { display: flex; align-items: center; gap: 10px; padding: 10px 14px; background: #141518; border: 1px solid #26272d; border-radius: 10px; cursor: pointer; }
  .brief-section label.opt:hover { border-color: #ff2a3c; }
  .brief-section input[type="text"], .brief-section input[type="tel"], .brief-section input[type="email"], .brief-section input:not([type]), .brief-section textarea {
    display: block; width: 100%; margin-top: 6px; padding: 12px 14px; background: #141518; border: 1px solid #26272d; border-radius: 10px; color: #f5f5f7; font: inherit;
  }
  .brief-section input:focus, .brief-section textarea:focus { outline: 2px solid #ff2a3c; outline-offset: 1px; border-color: #ff2a3c; }
  .brief-nav { display: flex; gap: 12px; justify-content: space-between; margin-top: 28px; }
  .brief .btn { padding: 12px 22px; border-radius: 999px; font-weight: 700; border: 1px solid #26272d; background: transparent; color: #f5f5f7; cursor: pointer; }
  .brief .btn-primary { background: #ff2a3c; border-color: #ff2a3c; color: #fff; }
  .brief .btn-primary:disabled { opacity: .5; cursor: default; }
  .form-status { margin-top: 14px; min-height: 20px; color: #ffd166; font-size: 14px; }
  .brief-done { text-align: center; padding: 60px 0; }
  .brief-done h2 { font-family: 'Rubik', sans-serif; font-weight: 900; font-size: 28px; }
  @media (prefers-reduced-motion: reduce) { .brief-progress span { transition: none; } }
</style>
```

- [ ] **Step 2: בדיקה ויזואלית ב-dev**

Run: `npm run dev` ואז פתח `http://localhost:4321/brief/haozen`
Expected: כרטיס כהה, פס-התקדמות אדום-זהב, ניווט בין 8 סקציות עובד, focus נראה.

- [ ] **Step 3: Commit**

```bash
git add src/pages/brief/haozen.astro
git commit -m "style: ninja-branded wizard styling"
```

---

### Task 9: עדכון `.env.example` + אימות end-to-end

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: הוספת משתני Resend ל-`.env.example`**

הוסף בסוף:

```bash
# === Email (Resend) — for /api/lead and /api/brief notifications ===
RESEND_API_KEY=re_...your-key
LEAD_FROM_EMAIL=NINJA Digital <hello@send.samp.ninja>
```

- [ ] **Step 2: אימות מלא מקצה לקצה (ידני)**

ודא ש-`.env` המקומי כולל `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.

Run: `npm run dev`
1. פתח `http://localhost:4321/brief/haozen`.
2. מלא פרטי קשר + כמה שדות, עבור בין כל הסקציות, שלח.
3. Expected: מסך "קיבלנו את האפיון".
4. ב-Supabase → Table Editor → `intake_briefs`: שורה חדשה עם `answers` JSONB מאוכלס נכון.
5. בדוק שטיוטה נשמרת: רענן באמצע מילוי → הערכים חוזרים.
6. (אם `RESEND_API_KEY` מוגדר) ודא שמייל הגיע ל-sharon@samp.ninja; אחרת בדוק שב-console מופיע `[email] ... logged only`.

- [ ] **Step 3: Commit**

```bash
git add .env.example
git commit -m "docs: document Resend env vars"
```

---

## כיסוי spec (self-review)

| דרישת spec | משימה |
|---|---|
| דף `/brief/haozen` פרטי, ברנד נינג'ה | Task 6, 8 (`noindex/hideNav`, פלטה) |
| Wizard 8 סקציות + progress + טיוטה | Task 6, 7 |
| כל שאלות §5 | Task 6 (כל הסקציות ממופות לשדות) |
| שמירה ל-Supabase `intake_briefs` | Task 4, 5 |
| מייל התראה לשרון | Task 5 (`renderAdmin` + `sendEmail`) |
| ולידציה + honeypot + service-role/RLS | Task 2, 3, 4, 5 |
| נגישות (labels/focus/aria-live/RTL) | Task 6, 8 |

**הערות:** מייל תודה ללקוח (spec §8) — לא נכלל בתוכנית הראשונית (YAGNI לסבב פנימי; קל להוסיף ב-`api/brief.ts` עם `renderCustomer` כמו ב-`lead.ts` אם תרצה). שמירת טיוטה = `localStorage` בלבד, כמאושר.
