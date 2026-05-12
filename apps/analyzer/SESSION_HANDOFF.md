# Session Handoff — 2026-05-12

**Last commit**: `cf5b970` — Phase 15D.-1 (Keyword Bank as North Star + Master Page Engine)
**Production**: `seo.samp.ninja` (Frankfurt) — `dpl_*` ID will refresh on next push
**Repo**: `apps/analyzer` is the active codebase

---

## איפה אנחנו עכשיו

המערכת **מוכנה לpilot E2E רביעי**, אבל יש 3 דברים שמחכים לאישור שלך לפני שאני מתחיל לפעול:

### 1. האם להריץ "רענן הכל" על Levizon אחרי deploy של 15D.-1?
ה-refresh button עכשיו כולל גם `master_page_resolve`. אם תלחץ — כל 4 ה-strategies של Levizon יקבלו את ה-Master Page info מחדש, ו-Briefs חדשים שייווצרו יקבלו title style נכון לפי page type. **~6 שניות**.

### 2. האם להריץ pilot E2E חמישי?
Pre-bundle 15D.-1 ה-pilot נחסם כי title category-style נופל על דף מוצר. עכשיו זה מתוקן. ה-flow המלא:
- רענן הכל → /work-plan → אשר Safe Meta → /briefs (Title יותר מתאים) → human review approved_for_execution → הכן Execution → Dry Run ידני → עצור לדוח שלי

### 3. החלטה האם לבצע Execute חי בכלל
לא בוצע Execute ב-pilot אף פעם. השאלה האם השלב הזה רלוונטי אחרי כל התיקונים, או שעדיין יש בעיות עריכתיות שצריך לפתור קודם.

---

## מה הסטטוס של כל הקבצים בpr-ים האחרונים

| Phase | Commit | מה זה עושה |
|---|---|---|
| 15C — Pilot Polish | `60d7bae` | UI preload existing briefs + Hebrew-aware title template |
| 15C.2 — SEO Crawl Scope | `6c784c8` | `lib/page-scope.ts` + utility/legal/system blocking |
| 15C.3 — Scope Visibility | `b5686d8` | ScopeBadge + ScopeExplainer + Strategy rebuild script |
| 15D — Brief→Execution | `5ae9e6c` | createExecutionActionFromBrief + Human Review modal |
| 15D.0 — Work Plan | `65ce463` | SeoWorkPlan + SeoWorkPlanItem + classifier |
| Bundle B/C/D | `2d82ce0` | Refresh button + safe_meta opp fix + brief humanReviewedAt |
| 15E.2 propagation fix | `53106e1` | Brief humanReview propagates to Opportunity |
| **15D.-1 (latest)** | **`cf5b970`** | **Master Page Engine + page-type guards** |

---

## מצב Levizon כרגע (אחרי 15D.-1)

```
Active TargetKeywords: 4
GSC rows: 12,616 (כולן עם page dim ✓)
Opportunities: 31
Strategies: 4 (כל ה-rankingPage תקין)
Briefs: ~11 (8 חדשים מ-Bundle B + 3 ישנים)
ExecutionActions: 9 (היסטוריה מ-pilot 14A; כעת status=rollback_available הישן הוא הdetail)
Work Plan: cmp2wny27 — סופרסדנו פעם, צריך rebuild
```

**שים לב**: ה-master_page_resolve טרם רץ ב-DB דרך ה-refresh button — הרצתי אותו מ-tsx ב-QA. כש-תרענן יומחק/יתעדכן. הערכים אצלי בdb הם:

| Keyword | masterPage | type | confidence | action |
|---|---|---|---|---|
| פח אשפה ברבנטיה | `/dustbins/brabantia` | category | high | improve_category_page |
| אביזרים לאמבטיה | `/bath-accessories` | category | high (GSC) | improve_category_page |
| מסננת לכיור | `/kitchen-gadgets/oxo/...oxo` | product | high (scan) | improve_product_page |
| משקל דיגיטלי למטבח | `/kitchen-weights/...2kg/free` | product | high (GSC) | improve_product_page |

---

## בעיות פתוחות שצריך לפתור בהמשך

### 1. Brabantia ExecutionAction ב-`rollback_available` מ-pilot 14A
- ID: `cmp2nnoyf000204l7dlamhnz7`
- בוצע 2026-05-12 13:17 ע"י pilot 14A
- ה-title החי כרגע: `"פח אשפה ברבנטיה (Brabantia) - דגמים, צבעים ומחירים | לויזון מרקט"`
- אם נריץ Brief החדש: יחליף ל-`"פח אשפה ברבנטיה - דגמים, צבעים ומחירים"` (template חדש מ-15C)
- **החלטה ערוכתית**: האם ה-template החדש עדיף? לא ברור.

### 2. 3 TargetKeywords ללא operator targetUrl
מסננת לכיור / משקל דיגיטלי למטבח / אביזרים לאמבטיה — ה-resolver מצא masterPage אוטומטית, אבל יותר נכון שתעדכן ידנית ב-UI ל-targetUrl המועדף שלך. זה ייתן confidence=high מאופרטור.

### 3. כפילויות Briefs מ-safe_meta approve
ה-`prepareOpportunityItem` החדש יוצר Brief פר Opportunity. אם יש 8 opps על אותה keyword (כי opp.id שונה), נוצרים 8 Briefs. צריך dedupe ברמה הבאה: (clientId, targetKeyword, briefType) אם source=opportunity. **קל לתקן ב-pr נפרד**.

### 4. Work Plan keyword-led summary (deferred ב-15D.-1)
Sharon אישר "אפשר להשאיר את הקבוצות הקיימות, אבל להוסיף keyword-led view". לא נבנה — דחיתי כadditive. אם תרצה — phase קטן (15D.-1.5 או 15D.2).

### 5. imagePlan + supportingArticleNote ב-briefs (deferred)
Policy "no random web images" כבר נאכף (generator לא יוצר תמונות בכלל). שדה מובנה לתאר את ה-imagePlan ב-brief הוא nice-to-have.

### 6. Reset Human Review אחרי עריכת Brief
אם ה-recommendedTitle משתנה אחרי שה-brief קיבל `humanReviewedAt`, ה-override נשאר. צריך לאפס או להציג warning. **שלב הבא**.

### 7. Workflow Center "Ready for Execution" badge לא מתעדכן אחרי human review
לא קריטי — ה-badge בדף ה-Brief כן מתעדכן. follow-up קטן.

### 8. Failed/stale ExecutionActions cleanup
2 פעולות failed/stale ב-DB של Levizon. לא חוסם. cron יומי אופציה לעתיד.

---

## מבנה הקוד החשוב

```
apps/analyzer/src/lib/
├── master-page.ts                 ← types + labels + page-type heuristics
├── master-page-server.ts          ← resolveMasterPage cascade
├── page-scope.ts                  ← scope classification (utility/legal/etc)
├── brief-execution-server.ts      ← computeBriefExecutionReadiness + createExecActionFromBrief
├── briefs-server.ts               ← title/meta/outline templates (now page-type aware)
├── refresh-server.ts              ← refreshClient public entry
├── work-plan-server.ts            ← buildSeoWorkPlan + approveWorkPlanGroup
├── work-plan.ts                   ← work-plan client-safe types
├── strategy-server.ts             ← computeKeywordStrategy
├── decision-server.ts             ← Phase 14C Decision Guard
└── execution-server.ts            ← Phase 11/12 execution engine

apps/analyzer/src/app/clients/[id]/
├── layout.tsx                     ← header with RefreshAllButton + SubNav
├── work-plan/                     ← Work Plan page + ApproveGroupButton
├── briefs/                        ← Brief list + HumanReviewModal + PrepareBriefExecutionModal
├── keywords/                      ← Keyword Bank (now with Master Page Status section)
├── execution/                     ← Manual Dry Run + Execute UI
└── settings/                      ← SEO Crawl Scope + Execution Settings

apps/analyzer/scripts/
├── audit-system.ts                ← DB-wide duplicate/health audit
├── pilot-15e2-run.ts              ← E2E pilot (will need re-run for 15D.-1)
├── pilot-15e2-resume.ts           ← resume from Brief override + Dry Run
├── qa-15d-master-page.ts          ← resolve master pages on Levizon
├── test-page-scope.ts             ← scope classifier tests (22/22)
└── refresh-* / rebuild-* / pilot-* ← various ops scripts
```

---

## גיידלריילס שאסור לשבור

- ❌ אין Plugin v0.4
- ❌ אין post_content writes
- ❌ אין DOMDocument
- ❌ אין live Execute בלי אישור מפורש של Sharon
- ❌ אין Dry Run אוטומטי על group
- ❌ אין bulk/cron/agency execute
- ❌ אין Decision Guard bypass בלי humanReviewedAt
- ❌ אין `--no-verify` בcommits
- ❌ אין force push ל-main
- ✅ ה-flow הוא: Strategy → Brief → Human Review → Approved → Prepare → Dry Run → Diff → **Sharon לוחץ Execute ידנית**

---

## פעולות מהירות לתחילת מחר

```bash
# מצב deploy
cd C:/Users/sharon/projects/ninja-landing
git log --oneline -5

# הרצה מקומית
cd apps/analyzer
npm run dev   # localhost:3000
# או build:
npx tsc --noEmit && npx next build

# QA scripts
npx tsx scripts/test-page-scope.ts        # 22/22
npx tsx scripts/audit-system.ts           # DB health
npx tsx scripts/qa-15d-master-page.ts     # resolve Levizon master pages
```

---

## שאלות פתוחות ממך שלא קיבלו תשובה

1. **האם להריץ Pilot E2E חמישי** אחרי deploy של 15D.-1?
2. **האם להעלות את Sharon's editorial concern** מ-15E.2 — האם Title חדש עדיף על ה-title שכבר חי מ-14A על Brabantia?
3. **15D.-1.5 / 15D.2**: לבנות את ה-Work Plan keyword-led summary + imagePlan ב-briefs?
4. **Brief edit invalidates Human Review** — לפתור בעתיד הקרוב?

---

## מילון מהיר של מושגים שצברנו בsessions האחרונים

- **Master Page** — ה-URL המרכזי לקידום של keyword (Phase 15D.-1)
- **Page Scope** — סיווג עמודים כ-eligible / utility / legal / system (Phase 15C.2)
- **Decision Guard** — מנגנון "אם המערכת לא יודעת להסביר → לא ממליצה" (Phase 14C)
- **Work Plan** — תכנון אחיד של כל הפריטים בקבוצות בטוחות (Phase 15D.0)
- **Refresh Everything** — GSC sync → tech audit → opps → strategies → master pages → work plan
- **Human Review Override** — operator approval שעוקף `requiresHumanReview` ברמת brief
- **Page Type Mismatch Guard** — מונע category-style title על product page (Phase 15D.-1)
- **Pilot Mode** — flag על client שמאלץ banner צהוב ב-Execution page

---

נשמר ב-`apps/analyzer/SESSION_HANDOFF.md`. עדכן אותו בסוף sessions עתידיים.
