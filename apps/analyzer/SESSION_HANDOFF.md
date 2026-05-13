# Session Handoff — 2026-05-13

**Last commit**: `cf2a831` — fix(analyzer): Phase 15E.1 review findings (actor email + remove dead override UI)
**Previous commits in 15E**:
- `6b661d4` — feat(analyzer): Phase 15E.1 — Keyword Goals + Master Page manual override (DB + UI only)
**Previous milestone**: `cf5b970` — Phase 15D.-1 (Master Page Engine)
**Production**: `seo.samp.ninja` (Frankfurt) — `dpl_*` ID will refresh on next push
**Repo**: `apps/analyzer` is the active codebase
**Branch**: `main` — 2 commits ahead of `origin/main` (not pushed yet — wait for Sharon's approval)

---

## ⚡ TL;DR — איפה להמשיך כשחוזרים

Phase 15E.1 הושלם + ה-review fixes שלו נסגרו (2 commits). הוגדרו 4 keyword goals ידנית ל-Levizon.

**Phase 15E.2 (Brain Wiring) בעיצומו אבל מושהה**:
- ✅ `src/lib/keyword-goal.ts` (309 שורות) — **נכתב, נמצא ב-working tree untracked, מהדר נקי**. הוא הקובץ הראשי של 15E.2. ראה פירוט מלא בסוף ההנדאוף.
- ⏸ עוד לא נכתב: עדכוני `strategy.ts` (להוסיף שדות אופציונליים ל-`KeywordStrategySummary`), עדכוני `strategy-server.ts` (wiring conservative), 3 test scripts
- ⏸ עוד לא רץ: tsc/build/tests על integration המלאה

**צעד ראשון כשחוזרים**: לקרוא את הסעיף "Phase 15E.2 — איפה הפסקנו" בסוף ההנדאוף, ולהמשיך משם.

---

## ⚠️ שינוי תפעולי חשוב מ-15E.1

ה-DB **עכשיו תחת Prisma migrate tracking מסודר** (analyzer schema, `_prisma_migrations` table פעיל, 17 migrations applied).

עד 15E.1 כל שינוי schema הופעל ב-`prisma db push`. ב-15E.1 ביצענו:
1. `prisma migrate resolve --applied` ל-16 ה-migrations ההיסטוריות (baseline — לא הריץ DDL, רק רשם כ-applied)
2. `prisma migrate deploy` להפצת 15E.1

**מכאן והלאה לא להשתמש ב-`prisma db push` לשינויי schema ב-production/staging.** כל שינוי schema עתידי חייב:
- migration file חדש ב-`prisma/migrations/YYYYMMDDHHMMSS_name/migration.sql`
- `npx prisma migrate deploy` (לא `db push`, לא `migrate dev` על prod)
- SQL idempotent עם `ADD COLUMN IF NOT EXISTS` / fields nullable או עם DEFAULT, אין DROP destructive

אם schema.prisma ושומר השינוי בלי migration file, הוא ייכשל ב-deploy או יגרום drift.

---

## איפה אנחנו עכשיו

Phase 15E.1 + review fixes הושלמו. 4 keyword goals הוגדרו ידנית ב-DB של Levizon. Phase 15E.2 התחיל אבל הושהה אחרי שכתבתי את הקובץ הראשי (`keyword-goal.ts`) — לא נכנס ל-commit כי הופסקתי באמצע ל-fix של ממצאי ultrareview.

**הצעד הבא כשחוזרים**: לעבור לסעיף "Phase 15E.2 — איפה הפסקנו" בסוף ההנדאוף, להמשיך לעדכן `strategy.ts` + `strategy-server.ts`, לכתוב 3 test scripts, ולעשות commit.

---

## איפה אנחנו עכשיו (state ישן — לפני 15E.1)

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
| 15D.-1 | `cf5b970` | Master Page Engine + page-type guards |
| 15E.1 | `6b661d4` | Keyword Goals + Manual MP Override — DB + UI only, no Brain changes |
| **15E.1 review fixes (latest)** | **`cf2a831`** | **actorEmail() במקום "operator" hardcoded; הסרת Manual Override counter המטעה; שדות נשארו ב-DB (dormant)** |
| 15E.2 (in progress) | — | Brain Wiring — `keyword-goal.ts` נכתב, working tree untracked, ראה סוף המסמך |

---

## מצב Levizon כרגע (אחרי 15E.1 + הגדרת goals)

```
Active TargetKeywords: 4 — כולם עם keywordGoal + businessValue מוגדרים ידנית
GSC rows: 12,616 (כולן עם page dim ✓)
Opportunities: 47
Strategies: 4 (כל ה-rankingPage תקין)
Briefs: 11 (3 דופליקציות לא חוסמות — ראה issue #3 למטה)
ExecutionActions: 10 (1 open, 2 failed/stale — היסטוריה מ-pilot 14A)
Work Plan: 1 active
```

**הערה אסטרטגית — 2 keywords הם Goal↔MasterPageType mismatch מובהק** שיתפסו ע"י ה-`detectGoalMismatch()` ב-15E.2 כשיורץ:

| Keyword | masterPage | type | confidence | keywordGoal | businessValue | התראה צפויה ב-15E.2 |
|---|---|---|---|---|---|---|
| פח אשפה ברבנטיה | `/dustbins/brabantia` | category | high | `improve_rank` | high | aligned ✓ |
| אביזרים לאמבטיה | `/bath-accessories` | category | high (GSC) | `expand_content_coverage` | high | aligned ✓ |
| מסננת לכיור | `/kitchen-gadgets/oxo/...oxo` | product | high (scan) | `improve_rank` | medium | **`rank_goal_on_product_for_generic_keyword`** (medium) |
| משקל דיגיטלי למטבח | `/kitchen-weights/...2kg/free` | product | high (GSC) | `expand_content_coverage` | medium | **`content_goal_on_product_page`** (medium) |

ה-notes של 4 ה-keywords כתובים ב-`keywordGoalNote` (השאר ב-DB, נקראים מהטבלה ב-UI).

**Audit defect ידוע**: 4 ה-keywords שהוגדרו ב-session הזה נשמרו עם `keywordGoalSetBy="operator"` (לפני ה-fix של `cf2a831`). מי שיגדיר goal מחדש דרך ה-UI עכשיו יקבל `sharon@samp.ninja` (או `system` fallback). לא ביצענו backfill — אם תרצה לתקן retro, יש לבצע re-save מה-UI על כל 4 המילים.

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

---

## Phase 15E.1 — מה נעשה (DB + UI בלבד)

### Schema changes (`prisma/schema.prisma`)
ל-`TargetKeyword` נוספו 7 שדות:
- `keywordGoal` (String?) — מטרת קידום, ערכים מותרים: `improve_rank | defend_top3 | expand_content_coverage | new_landing_page | informational_authority | cannibalization_resolution | monitor_only`
- `keywordGoalNote` (String?) — הערה חופשית
- `keywordGoalSetAt` (DateTime?) — מתי הוגדר
- `keywordGoalSetBy` (String?) — "operator" כרגע
- `masterPageManualOverride` (Boolean, default false) — דגל אם operator override ידני
- `masterPageOverrideAt` (DateTime?)
- `masterPageOverrideBy` (String?)

המיגרציה: `prisma/migrations/20260513030000_phase_15e1_keyword_goals/migration.sql` — `ADD COLUMN IF NOT EXISTS` בלבד, idempotent.

### UI changes
- `RowActions.tsx` — סקשן חדש "Strategic Context · Phase 15E.1" בעריכה: dropdown מטרה, dropdown businessValue, textarea note
- `page.tsx` — עמודה חדשה "מטרה" בטבלה (pill כחול), section חדש "Strategic Goals" עם 3 counters (עם Goal / פעילות ללא Goal / עם ערך עסקי), Master Page section עכשיו עם 5 counters (הוספת "Manual Override")
- `keywords.ts` — `KEYWORD_GOAL_OPTIONS`, `BUSINESS_VALUE_OPTIONS`, helpers
- `actions.ts` — zod schema מקבל goal/businessValue/note, מעדכן `keywordGoalSetAt`/`keywordGoalSetBy` כש-goal משתנה

### QA scripts שנשארו ב-repo
- `scripts/check-15e1-db-state.ts` — read-only, מציג את כל עמודות TargetKeyword + מסמן את 7 שדות 15E.1. מועיל ל-future drift detection.
- `scripts/smoke-15e1-ui.ts` — exercises ה-edit form code path (zod + db.update) end-to-end, mocks `nonEmpty` normalization, מאמת round-trip + counters. **Note**: לא קורא ל-`updateKeyword` server action ישירות כי `revalidatePath` קורס מחוץ ל-Next runtime — משכפל את הלוגיקה במקום זאת. אם בעתיד הelevated server actions מנוקות מ-`revalidatePath` ניתן יהיה לקרוא ישירות.

### מה לא נגעתי
- Strategy classifier (`strategy-server.ts`) — לא נגע
- Opportunities detectors (`opportunities-server.ts`) — לא נגע
- Work Plan (`work-plan-server.ts`) — לא נגע
- Briefs (`briefs-server.ts`) — לא נגע
- Decision Guard (`decision-server.ts`) — לא נגע
- Refresh pipeline (`refresh-server.ts`) — לא נגע
- Plugin / Execute / Dry Run — לא נגע

ה-Brain עדיין לא יודע על goal — זה ב-15E.2.

### בדיקות שעברו
| בדיקה | תוצאה |
|---|---|
| `prisma migrate deploy` | ✅ 1 migration applied |
| `tsc --noEmit` | ✅ no errors |
| `next build` | ✅ 27 routes |
| `test-page-scope.ts` | ✅ 22/22 |
| `audit-system.ts` | ✅ זהה לbaseline |
| `smoke-15e1-ui.ts` | ✅ 4/4 steps (setup → write → update → restore) |

---

## Phase 15E.1 Review Fixes — מה תוקן ב-`cf2a831`

שני ממצאים זוהו ע"י שני ultrareviews independent על `6b661d4`:

### Fix 1 — `keywordGoalSetBy` משתמש ב-actorEmail()
- **לפני**: hardcoded `"operator"` — כל ה-keywords של כל הלקוחות עם אותו string anonymous
- **אחרי**: `actorEmail()` (אותו pattern של briefs/opportunities/work-plan/keyword-strategy server actions) → `getCurrentUser()?.email` עם fallback ל-`"system"`
- ב-`actions.ts`: עכשיו `const actor = goalChanged ? await actorEmail() : null` והשמירה היא `keywordGoalSetBy: parsed.data.keywordGoal ? actor : null`
- שמירה רק כש-goal משתנה (לא כשrows אחרים בtemple updated)

### Fix 2 — Manual Override counter הוסר מה-UI
- ה-counter "Manual Override" ב-Master Page Status section הוסר (היה תקוע ב-0)
- ה-section text של Master Page Status מציין עכשיו במפורש שה-Tier 1 protection בא דרך operator-set `targetUrl`, לא דרך flag
- ה-schema comment ב-`schema.prisma` שוכתב להגיד שהשדות **reserved** ולא לצרוך אותם עד שphase מאוחר יחבר אותם
- **השדות נשארו ב-DB** (`masterPageManualOverride`, `OverrideAt`, `OverrideBy`) — dormant, ממתינים לphase שיבנה Master Page Override UI אמיתי

### ממצאים על landing page (לא בקוד analyzer) — לא טופלו בכוונה
תועדו במקום אחר, לא חלק מ-Phase 15E:
- `src/styles/global.css` — `:focus-visible { border-radius: 4px }` קופץ inputs מ-10px ל-4px במיקוד
- `src/pages/index.astro` — `role="application"` על game arena מנטרל browse mode לקוראי מסך בלי מודל מקלדת חלופי
- `src/pages/index.astro` — Google Partner CTA: visible text לא substring של aria-label (WCAG 2.5.3 Level A)
- `src/components/Nav.astro` — services dropdown: role=menu/menuitem בלי keyboard model + חסר aria-expanded
- `src/pages/index.astro` — strip section: aria-label על section + aria-hidden על תוכן → empty labeled landmark

---

## Phase 15E.2 — איפה הפסקנו (CRITICAL להמשך)

### הקובץ שכבר נכתב: `src/lib/keyword-goal.ts`
- **309 שורות**
- **Working tree, untracked** — לא בcommit עדיין
- **מהדר נקי** — אומת ב-`tsc --noEmit` במהלך הסשן
- **תכולה**:
  - Types: `GoalAlignment`, `GoalMismatchType`, `GoalMismatch`, `GoalAlignmentInput`, `GoalAlignmentResult`
  - Labels: `GOAL_ALIGNMENT_LABEL`, `GOAL_ALIGNMENT_TONE`, `GOAL_MISMATCH_LABEL`
  - Helpers: `getGoalLabel()`, `getGoalDescription()`, `isLikelyGenericKeyword()`
  - Pure functions: `expectedStrategyTypeForGoal()`, `expectedMasterPageTypeForGoal(goal, intent)`
  - Mismatch detection: `detectGoalMismatch(input)` — 7 types (A-G מהמפרט)
  - Top-level entry: `classifyGoalAlignment(input)` → `GoalAlignmentResult`
- **GUARANTEE שהוטמע**: לא משנה strategyType / riskLevel / שום input. רק calc.
- **GoalAlignment values**: `aligned | goal_overrides | data_overrides | mismatch_needs_review | no_goal_set` (`goal_overrides` מוגדר אך לא מוחזר ב-15E.2 — שמור לפhase עתידי)

### ה-Mismatch types המוטמעים (A-G מהמפרט)
| Type | תנאי | Severity |
|---|---|---|
| `defend_top3_slipping` | goal=defend_top3 + position > 3 | high |
| `new_page_goal_but_master_page_exists` | goal=new_landing_page + masterPage קיים ב-medium/high confidence | high |
| `informational_goal_but_commercial_page` | goal=informational_authority + masterPageType ∈ {product,category} + intent ∈ {commercial,transactional} | high |
| `content_goal_on_product_page` | goal=expand_content_coverage + masterPageType=product + `isLikelyGenericKeyword()` | medium |
| `rank_goal_on_product_for_generic_keyword` | goal=improve_rank + masterPageType=product + `isLikelyGenericKeyword()` | medium |
| `monitor_goal_but_actionable_data` | goal=monitor_only + strategyType ∈ {quick_win,content_boost,new_content_needed,internal_link_boost} | low |
| `goal_unset` | goal=null + status ∈ {active,ranking} | low |

`isLikelyGenericKeyword()` heuristic: מילים שלא מכילות ספרות, יחידות מידה (ק"ג / גרם / ml / kg), פחות מ-5 מילים → generic.

### מה עוד צריך לעשות ב-15E.2 (לפי הסדר)

#### 1. עדכוני `src/lib/strategy.ts`
להוסיף לטיפוס `KeywordStrategySummary` (כל השדות אופציונליים — לא לשבור backward compat):
```ts
// Phase 15E.2 — goal alignment (all optional for backward compat)
keywordGoal?: string | null;
goalAlignment?: GoalAlignment;
goalMismatch?: GoalMismatchType | null;
goalMismatchReason?: string | null;
goalMismatchSeverity?: "low" | "medium" | "high" | null;
goalExpectedStrategyTypes?: StrategyType[];
goalExpectedMasterPageTypes?: MasterPageType[];
goalNeedsHumanReview?: boolean;
```
Import הטיפוסים מ-`./keyword-goal`. Re-export אם נדרש.

#### 2. עדכוני `src/lib/strategy-server.ts`
ב-`computeKeywordStrategy()` (line ~31):
- אחרי `const { riskLevel, confidence } = computeRiskAndConfidence(...)` — לפני יצירת ה-summary
- לקרוא ל-`classifyGoalAlignment({ goal: tk.keywordGoal, status: tk.status, keyword: tk.keyword, intent: snapshot.intent, masterPage: tk.masterPage, masterPageType: tk.masterPageType, masterPageConfidence: tk.masterPageConfidence, currentPosition: snapshot.currentPosition, strategyType, confidence })`
- להעביר את התוצאה ל-buildSummary OR להוסיף ישירות ל-return object
- **CRITICAL — לא לשנות**: `strategyType`, `riskLevel`, `confidence`, `opportunityScore`. השדות החדשים רק מתווספים, לא מחליפים.

ב-`buildSnapshot()` — אם צריך, להוסיף `masterPage*` ל-snapshot. אבל ההמלצה: לא לשנות ה-snapshot, להעביר את ה-masterPage fields ישירות ל-`classifyGoalAlignment` מה-TK record.

#### 3. test script — `scripts/test-keyword-goal.ts`
בסגנון `test-page-scope.ts`: array של 15+ fixtures, כל אחד בודק:
- `expectedStrategyTypeForGoal(goal)` → expected list
- `expectedMasterPageTypeForGoal(goal, intent)` → expected list
- `getGoalLabel(goal)` → expected Hebrew label
- edge cases: null/unknown goal לא קורס

#### 4. test script — `scripts/test-goal-mismatch.ts`
12+ fixtures, כל אחד בודק `detectGoalMismatch(input)`:
- defend_top3 + position=2 → null (aligned)
- defend_top3 + position=8 → `defend_top3_slipping` severity=high
- new_landing_page + masterPage="...", confidence=high → `new_page_goal_but_master_page_exists`
- informational_authority + masterPageType=product + intent=commercial → `informational_goal_but_commercial_page`
- expand_content_coverage + masterPageType=product + keyword=generic → `content_goal_on_product_page`
- improve_rank + masterPageType=product + keyword=generic → `rank_goal_on_product_for_generic_keyword`
- monitor_only + strategyType=quick_win → `monitor_goal_but_actionable_data`
- goal=null + status=active → `goal_unset` severity=low
- goal=null + status=paused → null

#### 5. test script — `scripts/test-strategy-with-goal.ts`
Integration-style — 6+ fixtures על 4 ה-keywords של Levizon (mock snapshot + goal):
- "פח אשפה ברבנטיה": improve_rank + category → aligned (לא mismatch)
- "אביזרים לאמבטיה": expand_content_coverage + category → aligned
- "מסננת לכיור": improve_rank + product + generic → `mismatch_needs_review` + mismatch type נכון
- "משקל דיגיטלי למטבח": expand_content_coverage + product + generic → `mismatch_needs_review`
- defend_top3 + position=2 → aligned
- defend_top3 + position=12 → `mismatch_needs_review` (defend_top3_slipping)

#### 6. בדיקות שצריך להריץ אחרי כל השינויים
```bash
cd apps/analyzer
npx tsc --noEmit                       # type check
npx next build                          # 27 routes כמו עכשיו
npx tsx scripts/test-page-scope.ts      # baseline 22/22
npx tsx scripts/test-keyword-goal.ts    # חדש
npx tsx scripts/test-goal-mismatch.ts   # חדש
npx tsx scripts/test-strategy-with-goal.ts  # חדש
npx tsx scripts/audit-system.ts         # ללא רגרסיות
```

#### 7. אסור לעשות ב-15E.2 (תזכורת)
- ❌ שינוי `strategyType` או `riskLevel` בפועל
- ❌ Work Plan classifier wiring (15E.3)
- ❌ Gap detector / Opportunity חדש (15E.3)
- ❌ Brief template changes (15E.4)
- ❌ Decision Guard changes (15E.4)
- ❌ Refresh pipeline changes
- ❌ Execution / Dry Run / Plugin / post_content

#### 8. commit message מוצע ל-15E.2
`feat(analyzer): Phase 15E.2 — Keyword Goal Brain Wiring (read-only, no strategy changes)`

לכלול:
- `src/lib/keyword-goal.ts`
- `src/lib/strategy.ts` (additive fields)
- `src/lib/strategy-server.ts` (call goal alignment)
- 3 test scripts
- אם רוצים — עדכון SESSION_HANDOFF.md לסמן 15E.2 כהושלם

---

## Resume Checklist להתחלת הסשן הבא

1. `git log --oneline -3` — וודא שהcommits האחרונים `cf2a831` ואז `6b661d4`
2. `git status apps/analyzer` — וודא ש-`src/lib/keyword-goal.ts` עדיין untracked + 3 modified files עוד לא נגעת בהם
3. קרא את הסעיף "Phase 15E.2 — איפה הפסקנו" למעלה
4. פתח את `src/lib/keyword-goal.ts` ועברו מהיר על ה-types/functions
5. התחל מ-עדכון `src/lib/strategy.ts` (הוספת השדות האופציונליים)
6. המשך לפי הסדר 1-6 שלמעלה
7. בסוף — commit + עדכון SESSION_HANDOFF + ממתין לאישור Sharon לפני pushות 15E.3

**לפני שמתחילים לכתוב קוד**: לעבור על `keyword-goal.ts` שכבר נכתב ולהחליט אם נשאר כמו שהוא או צריך תיקונים. הקובץ נכתב לפני ה-fix של 15E.1 ולא ידע על שינוי schema (לא היה שינוי schema ב-fix — רק תיקון comment). אז הוא צריך להיות תקף עדיין.
