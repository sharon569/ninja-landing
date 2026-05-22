# Ninja SEO Analyzer — System Architecture & Product Status

**Date:** 2026-05-21
**Audience:** Product & Engineering

---

## What Is This System?

An internal tool for an SEO agency. The agency manages WordPress client websites. This system:

1. Connects to each client's WordPress site via a plugin
2. Analyzes the site's SEO health
3. Finds optimization opportunities using real Google Search Console data
4. Builds strategies per keyword
5. Generates work plans with grouped, risk-scored actions
6. Executes changes on the WordPress site (with human approval + dry run + rollback)
7. Measures impact over time (7/14/30 days)

**Live at:** `seo.samp.ninja`

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    NINJA ANALYZER (Next.js 16)               │
│                    seo.samp.ninja                             │
│                                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────┐  │
│  │  Agency   │  │  Client  │  │  Client  │  │  Client    │  │
│  │Dashboard  │  │ Overview │  │ Keywords │  │ Execution  │  │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └─────┬──────┘  │
│       │              │             │               │         │
│  ─────┴──────────────┴─────────────┴───────────────┴─────── │
│                    SERVER ACTIONS LAYER                       │
│  ─────┬──────────────┬─────────────┬───────────────┬─────── │
│       │              │             │               │         │
│  ┌────▼────┐   ┌─────▼────┐  ┌────▼─────┐  ┌─────▼──────┐ │
│  │  Audit  │   │  Opps    │  │ Strategy │  │ Execution  │  │
│  │ Engine  │   │ Detector │  │  Engine  │  │  Engine    │  │
│  │21 rules │   │9 detects │  │per keywd │  │dry run +   │  │
│  └────┬────┘   └─────┬────┘  └────┬─────┘  │execute     │  │
│       │              │            │         └─────┬──────┘  │
│  ─────┴──────────────┴────────────┴───────────────┴──────── │
│                    DECISION ENGINE                            │
│          (risk / confidence / recommended action)             │
│          (never recommends without real GSC evidence)         │
│  ────────────────────────────────────────────────────────── │
│                                                              │
│  ┌─────────┐  ┌──────────┐  ┌──────────┐  ┌────────────┐  │
│  │ Work    │  │ Content  │  │ Internal │  │  Impact    │  │
│  │ Plan    │  │ Briefs   │  │  Links   │  │  Review    │  │
│  │Builder  │  │Generator │  │ Analyzer │  │ 7/14/30d   │  │
│  └─────────┘  └──────────┘  └──────────┘  └────────────┘  │
│                                                              │
└──────────┬────────────────────┬──────────────────┬──────────┘
           │                    │                  │
           ▼                    ▼                  ▼
┌──────────────────┐  ┌─────────────────┐  ┌──────────────────┐
│  WordPress Site  │  │  Google Search  │  │   Supabase       │
│  + SEO Scanner   │  │    Console     │  │   (Postgres +    │
│    Plugin        │  │    API         │  │    Auth)          │
│                  │  │                │  │                   │
│  /info           │  │  28 days of    │  │  analyzer.*      │
│  /scan           │  │  queries,      │  │  schema with     │
│  /yoast-title    │  │  clicks,       │  │  15+ tables      │
│  /yoast-desc     │  │  impressions,  │  │                   │
│  /image-alt      │  │  position,     │  │  Vercel Blob     │
│  (dry run +      │  │  CTR           │  │  (raw scan JSON) │
│   execute)       │  │                │  │                   │
└──────────────────┘  └─────────────────┘  └──────────────────┘
```

---

## The Pipeline — Step by Step

```
STEP 1          STEP 2          STEP 3           STEP 4
Scan            Analyze         Strategize       Execute
─────────       ─────────       ─────────        ─────────

 WordPress       Audit           Keyword          Dry Run
 Plugin    ───►  21 rules  ───►  Strategy   ───►  on Plugin
 /scan           +               per keyword      (preview)
                 GSC Sync        +                   │
                 28 days         Work Plan            ▼
                 +               (grouped,        Execute
                 9 Opportunity   risk-scored)     on Plugin
                 Detectors                        (live)
                 +                                   │
                 Decision                            ▼
                 Engine                           Impact
                 (risk/why)                       Review
                                                 7/14/30d
                                                 GSC compare


         AUTOMATIC ──────────────────►│◄─── MANUAL (operator approves)
                                      │
                               Approval Gate
                            (nothing executes
                             without human OK)
```

### Step 1 — Scan (connects to the WordPress site)

The client has a WordPress plugin (`agency-seo-scanner`) installed on their site. When the operator triggers a scan:

- The system calls the plugin's `/scan` endpoint
- The plugin returns every page on the site with full SEO data:
  - Yoast SEO title, meta description, focus keyword
  - Heading structure (H1, H2, H3...)
  - Word count, images, internal/external links
  - Featured image, alt texts
  - WooCommerce product data (if applicable)
  - Canonical URLs, robots directives
  - Schema markup
- This raw JSON is stored in Vercel Blob (cloud storage)
- The scan metadata (size, duration, summary) is stored in Postgres

### Step 2 — Analyze (find what's wrong + what's possible)

Three things happen after a scan (or on a scheduled refresh):

**A. Audit Engine** — 21 rules across 8 categories check the scan data:

| Category | What it checks |
|---|---|
| Indexing | noindex on content, external canonicals, canonical mismatches |
| On-Page Meta | Missing title/description/focus keyword, length violations |
| HTML Structure | Missing H1, multiple H1s, heading hierarchy skips |
| Content Quality | Thin content (<300 words) |
| Images | Missing alt text, generic filename-as-alt, featured image alt |
| Internal Links | Orphan pages (no incoming links), pages with no outgoing links |
| Schema | Missing schema type, products without schema |
| Cannibalization | Duplicate focus keywords, duplicate titles across pages |

Each rule produces a **Finding** with severity (critical / important / minor / info), affected page count, and a fix hint.

**B. Google Search Console Sync** — Pulls the last 28 days of real search data:
- Which queries bring traffic to which pages
- Clicks, impressions, CTR, average position per query
- This is the ground truth — what Google actually shows users

**C. Opportunity Detection** — 9 detectors cross-reference GSC data with audit findings:

| Detector | What it finds |
|---|---|
| Low CTR | Good position but people don't click (title/description problem) |
| Quick Win Position | Position 6-15, high volume — small push could reach top 3 |
| High Impressions No Clicks | Google shows the page but nobody clicks (snippet issue) |
| Declining Clicks | Traffic dropping (competitor overtaking?) |
| Declining Position | Position falling (quality/relevance issue) |
| Target Keyword Not Ranking | Keyword in bank but site doesn't appear in Google for it |
| Target Keyword Needs Optimization | Ranks but underperforms (wrong page, weak content) |
| Cannibalization | Multiple pages competing for the same query (diluting each other) |
| New Query Growth | New search demand appearing (opportunity to capture early) |

Each opportunity gets a **Decision** computed by the Decision Engine:
- **Risk level**: low / medium / high / critical
- **Confidence**: based on data quality and quantity
- **Recommended action**: execute / review / monitor / research / skip
- **Why**: A concrete, data-grounded explanation (e.g., "Position 8, 1,200 monthly searches, CTR 1.2% vs expected 5% — title update could 3x clicks")

**Key rule**: The engine will **never** recommend execution without a substantive, GSC-grounded reason. If it can't justify the action with real numbers, it flags for human review.

### Step 3 — Strategize (plan the work)

**A. Keyword Strategy** — For each target keyword in the bank:
- Builds a performance snapshot (current position, clicks, CTR, trend)
- Classifies into a strategy type:
  - `protect_position` — Already top 3, don't touch, monitor
  - `quick_win` — Position 6-10 with CTR gap, title/meta refresh
  - `content_boost` — Needs deeper content
  - `internal_link_boost` — Needs more internal links pointing to it
  - `new_content_needed` — No page ranks for this keyword, create one
  - `cannibalization_fix` — Multiple pages fighting, consolidate
  - `monitor_only` — Not enough data yet
- Generates a 3-5 step action plan per keyword
- Includes measurement plan (what to check at 7/14/30 days)

**B. Content Briefs** — For opportunities/strategies that need content work:
- Generates structured briefs: recommended title, meta description, H1, content outline, secondary keywords, internal links, CTA, schema
- Intent-aware: transactional keywords get product-focused briefs, informational get guide-style outlines
- Hebrew-aware title construction

**C. Internal Link Suggestions** — Analyzes the site's link graph:
- Finds orphan pages that need incoming links
- Finds high-authority pages that should link to target pages
- Suggests anchor text from keyword bank
- Prioritizes by impact and confidence

**D. Work Plan** — Groups everything into a single actionable plan:

| Group | What's in it | Risk |
|---|---|---|
| safe_meta | Low-risk title/description updates on non-critical pages | Low |
| quick_wins | Position improvements with clear evidence | Low-Medium |
| content_expansion | Content additions/rewrites on existing pages | Medium |
| internal_linking | Link insertions with high confidence | Low |
| human_review | Anything the engine isn't confident about | Varies |
| blocked | Can't execute (scope, technical issues) | — |
| monitor_only | Watch and wait, not enough signal | — |

Each group has a cap (e.g., max 30 safe_meta items) to avoid overwhelming the operator.

### Step 4 — Execute (make changes on the site)

This is the only part where changes are made on the actual WordPress site. It's heavily gated:

```
Operator approves group in work plan
    ↓
System generates Content Briefs + Execution Action drafts
    ↓
Operator reviews each action (sees what will change and why)
    ↓
Operator clicks "Dry Run"
    ↓
System calls plugin with dryRun=true → gets before/after preview
    ↓
Operator reviews the diff
    ↓
Operator clicks "Execute"
    ↓
System checks: dry run fresh? value hasn't drifted? scope still valid?
    ↓
System calls plugin with dryRun=false → change goes live
    ↓
System creates baseline snapshot for impact measurement
    ↓
At 7, 14, 30 days: compare GSC metrics before vs after
```

**What can be executed today:**
- Yoast title updates
- Yoast meta description updates
- Image alt text updates

**Preview-only (no auto-execute):**
- Internal link insertions
- Content snippet insertions

**Safety features:**
- Nothing executes without dry run first
- Dry runs expire after 24 hours (must re-run if stale)
- Drift detection (if someone manually edited the field since dry run, execution is blocked)
- Rollback available for title/description/alt changes
- Rollback checks for drift too (won't revert if value was manually changed)

---

## Product Requirements vs Current State

### 1. "Go over all meta on the site — what's there, what's missing per page"

**STATUS: FULLY BUILT**

The Audit Engine runs 21 rules on every scan. Per-page breakdown shows exactly which pages are missing titles, descriptions, focus keywords, H1s, schema, etc. Results are grouped by category with severity ratings.

### 2. "Internal links — where to add, where not"

**STATUS: FULLY BUILT**

The Internal Link Analyzer identifies orphan pages, pages without outgoing links, and suggests specific source→target link pairs with recommended anchor text. Suggestions are prioritized by impact and filtered through the scope engine (won't suggest links on cart/checkout/legal pages).

### 3. "Write blog posts / change content / add to product pages"

**STATUS: PARTIALLY BUILT**

What exists:
- Content Brief generator — produces structured briefs with title, outline, keywords, CTA, schema recommendations
- Brief types: new article, new landing page, optimize existing page, expand content, FAQ section, title/meta update

What's missing:
- **Actual content generation (AI writing)** — the system produces the brief/outline but doesn't write the actual text. An AI writer (Claude API or similar) would take the brief and produce publishable content.

### 4. "Google Search Console for keyword progress tracking"

**STATUS: FULLY BUILT**

Central Google OAuth account syncs the last 28 days of search data per client. Tracks queries, pages, clicks, impressions, CTR, position. Used by all engines (opportunities, decisions, strategies, impact reviews) as ground truth.

### 5. "Keyword bank — client gives me keywords, system works, I just approve the plan"

**STATUS: FULLY BUILT**

The TargetKeyword model stores the keyword bank per client. When keywords are added:
1. System computes a strategy per keyword (protect / quick win / content boost / etc.)
2. Builds an action plan (3-5 steps)
3. Groups everything into a work plan
4. Operator approves groups → system prepares briefs and execution actions
5. Operator reviews and executes

This is exactly the flow described: keywords in → system works → operator approves.

### 6. "Blog content calendar — timed, researched, not 100 posts at once"

**STATUS: NOT BUILT**

What's missing:
- **ContentCalendar model** — scheduling when each piece of content goes live
- **Publishing cadence** — configurable rate (e.g., 2-3 posts/week)
- **Content dependencies** — cornerstone content before supporting posts
- **Seasonal/trend awareness** — timing content to search trends
- **Queue management** — draft → review → scheduled → published pipeline

### 7. "Quality score for site speed / code improvement"

**STATUS: NOT BUILT**

What's missing:
- **PageSpeed Insights integration** — Google's free API, returns Core Web Vitals (LCP, FID, CLS), performance score, specific recommendations
- **Per-page speed scoring** — track over time, show improvement/regression
- **Code quality recommendations** — image optimization, lazy loading, render-blocking resources, etc.

---

## The Missing Piece: How the Operator Actually Interacts

### Current model: Dashboard (operator drives)

```
Operator                              System
────────                              ──────
Opens browser                    
Navigates to client          →        Shows data
Clicks "Run Scan"            →        Scans site
Goes to Opportunities tab    →        Shows list
Reviews one by one           →        Waits
Clicks "Approve"             →        Prepares
Goes to Execution tab        →        Shows drafts
Clicks "Dry Run"             →        Runs preview
Reviews diff                 →        Waits
Clicks "Execute"             →        Makes change
Comes back in a week         →        Has impact data
```

**Problem:** The operator has to remember to check, navigate 14 tabs per client, and manually trigger every step. The engines are powerful but the interaction model is "pull" — you only see results when you go looking.

### Target model: Notification + Approval (system drives)

```
Operator                              System
────────                              ──────
Adds keywords for client     →        Receives keywords
                                      ↓ automatically:
                                      Syncs GSC
                                      Runs audit
                                      Detects opportunities
                                      Computes strategies
                                      Builds work plan
                             ←        "Here's the plan for Levizon:
                                       5 safe meta updates
                                       3 quick wins
                                       2 content pieces needed
                                       [Approve Safe Meta] [Approve Quick Wins] [Review All]"

Taps "Approve Safe Meta"     →        Generates briefs
                                      Creates execution drafts
                                      Runs dry runs automatically
                             ←        "5 dry runs ready:
                                       1. Title: 'בשר טרי' → 'מוצרי בשר טרי | משלוח | Levizon'
                                       2. Title: 'עוף' → 'עוף טרי למהדרין | Levizon Market'
                                       ...
                                       [Execute All] [Review One by One]"

Taps "Execute All"           →        Executes on WordPress
                             ←        "5/5 executed successfully ✓
                                       Impact review scheduled for May 28"

    ... 7 days pass ...
                             ←        "Impact Report — Levizon Safe Meta:
                                       • 'מוצרי בשר טרי': position 8→5, CTR +216%
                                       • 'עוף טרי': position 12→7, CTR +84%
                                       Overall: +43% clicks this week
                                       [Close] [Continue Monitoring]"
```

**The operator's job becomes: add keywords, approve plans, review results.** Everything else is automated.

### How to deliver this: Telegram Bot

A Telegram bot is the simplest way to deliver the notification + approval model:

- **Free**, no business verification, no message limits
- **Inline keyboards** — unlimited buttons for approve/reject/review
- **Proactive messages** — system can notify anytime (no 24-hour window like WhatsApp)
- **Mobile-first** — operator works from their phone
- **Simple API** — one webhook endpoint, one send function

The bot is a **thin translation layer** — it doesn't contain business logic. It just:
1. Receives operator commands → calls existing server functions
2. Receives engine results → formats as Telegram messages with buttons

```
┌────────────┐     ┌───────────────────┐     ┌──────────────────┐
│  Telegram   │ ──► │  /api/telegram/   │ ──► │  Existing        │
│  (operator) │ ◄── │  webhook          │ ◄── │  Engines         │
│             │     │  (translate only) │     │  (scan, audit,   │
│  Commands   │     │                   │     │   opps, strategy │
│  + Buttons  │     │  ~200 lines of    │     │   execution...)  │
│             │     │  glue code        │     │                  │
└────────────┘     └───────────────────┘     └──────────────────┘
```

### The daily operator experience (target)

**Morning:**
- Bot sends daily digest: "3 clients need attention, 2 impact reviews ready"
- Operator taps a client → sees summary → approves or skips

**When keywords are added:**
- Operator sends keywords in chat (or adds via web UI)
- Bot responds within minutes with a strategy per keyword
- Operator approves the plan → system works

**When things happen:**
- Scan finishes → bot notifies with summary
- Opportunities detected → bot shows top ones with approve buttons
- Execution completes → bot confirms
- Impact review ready → bot shows before/after metrics

**The web dashboard still exists** for deep-dives, reports, and detailed review. But the daily workflow moves to Telegram.

---

## Summary: What to Build Next

| Priority | Feature | What it unlocks | Effort |
|---|---|---|---|
| **1** | **Telegram Bot** — notification + approval flow | Operator works from phone, system drives | 3-4 days |
| **2** | **Auto-pipeline on keyword add** — adding a keyword triggers GSC → strategy → brief → plan automatically | "I add keywords, system works" | 1-2 days |
| **3** | **AI Content Writer** — take existing briefs, produce actual content via Claude/GPT API | Blog posts and content pages | 3-4 days |
| **4** | **Content Calendar** — schedule publishing with cadence control | Timed content, not 100 posts at once | 2-3 days |
| **5** | **PageSpeed Integration** — Google PSI API, per-page scores, tracking | Speed quality score | 1-2 days |

Total: ~12-15 days to fully deliver all 7 product requirements + the interaction model.

Items 1-2 change **how** the operator works (from dashboard-babysitting to approve-from-phone).
Items 3-5 add **what** the system can do (write content, schedule it, measure speed).

---

## Tech Stack

| Component | Technology |
|---|---|
| App framework | Next.js 16 (App Router) |
| Frontend | React 19, Tailwind 4, Hebrew RTL |
| Database | PostgreSQL on Supabase (EU, Frankfurt) |
| ORM | Prisma 7 with pg adapter |
| Auth | Supabase Auth (email/password, admin_users gate) |
| Storage | Vercel Blob (scan payloads) |
| Hosting | Vercel (Frankfurt region) |
| WordPress connector | Custom plugin `agency-seo-scanner` |
| External APIs | Google Search Console, Google OAuth |
| Language | TypeScript throughout |

---

## Data Model (simplified)

```
Client
  ├── Scan[] ──────────── Finding[]
  ├── TargetKeyword[] ─── KeywordStrategy[]
  ├── Opportunity[] ───── ExecutionAction[] ──── ExecutionEvent[]
  ├── ContentBrief[]
  ├── InternalLinkSuggestion[]
  ├── GscDailyRow[]
  ├── ImpactBaseline[] ── ImpactReview[]
  ├── SeoWorkPlan[] ───── SeoWorkPlanItem[]
  └── AutomationRun[]

GscAccount (singleton — one Google account for the whole agency)
```
