// Phase 7 — Advanced Technical SEO Audit (server-only).
//
// Async pipeline that fetches external resources (sitemap, robots.txt, HEAD
// requests, optionally PSI) and emits Finding rows on the latest Scan. All
// new rule IDs are prefixed `tech_` so they're trivially distinguishable.
//
// No plugin changes required. No writes to the client site.

import "server-only";
import { db } from "./db";
import type { Finding, AffectedUrl, AuditCategory, Severity } from "@/lib/audit/types";

// ─── HTTP helpers ────────────────────────────────────────────────

const FETCH_TIMEOUT_MS = 12_000;
const USER_AGENT = "NINJA-Analyzer/0.2 (+https://seo.samp.ninja)";

async function safeFetch(
	url: string,
	init: RequestInit = {},
): Promise<{ ok: boolean; status: number; text?: string; finalUrl?: string; redirected?: boolean }> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
	try {
		const r = await fetch(url, {
			...init,
			signal: controller.signal,
			redirect: "follow",
			headers: { "User-Agent": USER_AGENT, ...(init.headers || {}) },
		});
		const text = await r.text().catch(() => "");
		return {
			ok: r.ok,
			status: r.status,
			text,
			finalUrl: r.url,
			redirected: r.redirected,
		};
	} catch {
		return { ok: false, status: 0 };
	} finally {
		clearTimeout(timer);
	}
}

async function safeHead(url: string): Promise<{ status: number; finalUrl: string; redirected: boolean }> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
	try {
		const r = await fetch(url, {
			method: "HEAD",
			signal: controller.signal,
			redirect: "follow",
			headers: { "User-Agent": USER_AGENT },
		});
		return { status: r.status, finalUrl: r.url, redirected: r.redirected };
	} catch {
		return { status: 0, finalUrl: url, redirected: false };
	} finally {
		clearTimeout(timer);
	}
}

/** Run async fns with bounded concurrency. */
async function pool<T, R>(items: T[], fn: (t: T) => Promise<R>, limit = 5): Promise<R[]> {
	const out: R[] = [];
	let i = 0;
	const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
		while (i < items.length) {
			const cur = items[i++];
			out.push(await fn(cur));
		}
	});
	await Promise.all(workers);
	return out;
}

// ─── Site URL helpers ────────────────────────────────────────────

function siteRoot(baseUrl: string): string {
	try {
		const u = new URL(baseUrl);
		return `${u.protocol}//${u.host}`;
	} catch {
		return baseUrl.replace(/\/wp-json.*/, "").replace(/\/$/, "");
	}
}

function isHttps(url: string): boolean {
	try {
		return new URL(url).protocol === "https:";
	} catch {
		return false;
	}
}

// ─── Sitemap parsing ────────────────────────────────────────────

interface SitemapEntry {
	loc: string;
	lastmod?: string;
}

const SITEMAP_CANDIDATES = ["/sitemap.xml", "/sitemap_index.xml", "/wp-sitemap.xml"];

async function discoverSitemap(root: string, robotsSitemap?: string): Promise<{ url: string; xml: string } | null> {
	const tried = new Set<string>();
	const candidates: string[] = [];
	if (robotsSitemap) candidates.push(robotsSitemap);
	for (const path of SITEMAP_CANDIDATES) candidates.push(root + path);

	for (const u of candidates) {
		if (tried.has(u)) continue;
		tried.add(u);
		const r = await safeFetch(u);
		if (r.ok && r.text && /<urlset|<sitemapindex/.test(r.text)) {
			return { url: u, xml: r.text };
		}
	}
	return null;
}

async function parseSitemap(xml: string, rootUrl: string, depth = 0): Promise<SitemapEntry[]> {
	if (depth > 2) return []; // guard against runaway nested indexes

	// Sitemap index?
	if (/<sitemapindex/i.test(xml)) {
		const childLocs = Array.from(xml.matchAll(/<sitemap>\s*<loc>([^<]+)<\/loc>/gi)).map((m) => m[1].trim());
		const children = await pool(childLocs.slice(0, 10), async (loc) => {
			const r = await safeFetch(loc);
			if (!r.ok || !r.text) return [];
			return parseSitemap(r.text, rootUrl, depth + 1);
		});
		return children.flat();
	}

	// urlset
	const urls = Array.from(xml.matchAll(/<url>\s*<loc>([^<]+)<\/loc>(?:[\s\S]*?<lastmod>([^<]+)<\/lastmod>)?/gi)).map(
		(m) => ({ loc: m[1].trim(), lastmod: m[2]?.trim() }),
	);
	return urls;
}

// ─── Robots parsing ─────────────────────────────────────────────

interface RobotsRules {
	exists: boolean;
	disallowAll: boolean;
	disallows: string[];
	allows: string[];
	sitemap?: string;
	blocksUploads: boolean;
	raw: string;
}

async function fetchRobots(root: string): Promise<RobotsRules> {
	const r = await safeFetch(`${root}/robots.txt`);
	if (!r.ok || !r.text) {
		return {
			exists: false,
			disallowAll: false,
			disallows: [],
			allows: [],
			blocksUploads: false,
			raw: "",
		};
	}
	const lines = r.text.split(/\r?\n/);
	const disallows: string[] = [];
	const allows: string[] = [];
	let sitemap: string | undefined;
	let inUaStar = false;
	for (const raw of lines) {
		const line = raw.split("#")[0].trim();
		if (!line) continue;
		const [keyRaw, ...rest] = line.split(":");
		const key = keyRaw.toLowerCase().trim();
		const value = rest.join(":").trim();
		if (key === "user-agent") {
			inUaStar = value === "*";
			continue;
		}
		if (!inUaStar && key !== "sitemap") continue;
		if (key === "disallow" && value) disallows.push(value);
		else if (key === "allow" && value) allows.push(value);
		else if (key === "sitemap") sitemap = value;
	}
	return {
		exists: true,
		disallowAll: disallows.includes("/"),
		disallows,
		allows,
		sitemap,
		blocksUploads: disallows.some((d) => /^\/wp-content\/uploads/i.test(d)),
		raw: r.text,
	};
}

// ─── Finding builder ────────────────────────────────────────────

interface PlainAffected {
	url: string;
	title?: string;
	detail?: string;
}

function buildFinding(opts: {
	ruleId: string;
	category: AuditCategory;
	severity: Severity;
	title: string;
	description: string;
	fixHint: string;
	affected: PlainAffected[];
}): Finding {
	return {
		ruleId: opts.ruleId,
		category: opts.category,
		title: opts.title,
		description: opts.description,
		severity: opts.severity,
		count: opts.affected.length,
		affectedUrls: opts.affected.map((a, i) => ({
			blog_id: 1,
			post_id: i,
			url: a.url,
			post_type: "tech",
			title: a.title || a.url,
			detail: a.detail,
		})),
		fixHint: opts.fixHint,
	};
}

// ─── 1. Sitemap audit ───────────────────────────────────────────

async function auditSitemap(root: string, robotsSitemap: string | undefined): Promise<{
	findings: Finding[];
	sitemapUrl?: string;
	sitemapEntries: SitemapEntry[];
}> {
	const findings: Finding[] = [];
	const found = await discoverSitemap(root, robotsSitemap);

	if (!found) {
		findings.push(
			buildFinding({
				ruleId: "tech_sitemap_missing",
				category: "sitemap",
				severity: "high",
				title: "אין sitemap.xml זמין",
				description: "לא הצלחנו לאתר sitemap.xml באתר. גוגל מסתמך על Sitemap כדי לגלות עמודים חדשים — חוסר Sitemap מאט אינדוקס משמעותית.",
				fixHint: "ודא ש-Yoast מייצר sitemap, ושהוא נגיש בכתובת /sitemap.xml או /sitemap_index.xml.",
				affected: [{ url: `${root}/sitemap.xml`, title: "sitemap.xml", detail: "404 / לא נגיש" }],
			}),
		);
		return { findings, sitemapEntries: [] };
	}

	let entries: SitemapEntry[] = [];
	try {
		entries = await parseSitemap(found.xml, root);
	} catch {
		findings.push(
			buildFinding({
				ruleId: "tech_sitemap_invalid",
				category: "sitemap",
				severity: "high",
				title: "Sitemap.xml פגום",
				description: "הצלחנו לאתר sitemap.xml אבל לא הצלחנו לפרסר אותו. הנתונים שבו לא נכנסים לגוגל כראוי.",
				fixHint: "בדוק את התקינות של ה-XML דרך https://www.xml-sitemaps.com/validate-xml-sitemap.html",
				affected: [{ url: found.url, title: "sitemap" }],
			}),
		);
		return { findings, sitemapUrl: found.url, sitemapEntries: [] };
	}

	// Non-HTTPS URLs inside sitemap when root is HTTPS
	if (isHttps(root)) {
		const httpUrls = entries.filter((e) => !isHttps(e.loc)).slice(0, 50);
		if (httpUrls.length > 0) {
			findings.push(
				buildFinding({
					ruleId: "tech_sitemap_contains_http",
					category: "sitemap",
					severity: "medium",
					title: "Sitemap מכיל URLs ב-HTTP במקום HTTPS",
					description: "באתר HTTPS, סביר שכל URL ב-Sitemap יהיה גם HTTPS. URLs ב-HTTP נחשבים מסמכים שונים בעיני גוגל ויוצרים בלבול וקניבליזציה.",
					fixHint: "ודא שכל ה-permalinks מבוססים HTTPS, וש-Yoast מייצר את ה-sitemap לאחר שינוי האתר.",
					affected: httpUrls.map((e) => ({ url: e.loc })),
				}),
			);
		}
	}

	return { findings, sitemapUrl: found.url, sitemapEntries: entries };
}

// ─── 2. Robots audit ────────────────────────────────────────────

function auditRobots(robots: RobotsRules, root: string, sitemapUrl?: string): Finding[] {
	const findings: Finding[] = [];

	if (!robots.exists) {
		findings.push(
			buildFinding({
				ruleId: "tech_robots_missing",
				category: "robots",
				severity: "medium",
				title: "אין robots.txt",
				description: "אין קובץ robots.txt בשורש האתר. כדאי שיהיה — גם אם הוא מינימליסטי — כדי לכוון את הזחילה של הסורקים.",
				fixHint: "צור robots.txt בסיסי שמכיל User-agent: * ו-Sitemap. WordPress + Yoast עושים את זה בדרך כלל אוטומטית.",
				affected: [{ url: `${root}/robots.txt`, title: "robots.txt" }],
			}),
		);
		return findings;
	}

	if (robots.disallowAll) {
		findings.push(
			buildFinding({
				ruleId: "tech_robots_blocks_all",
				category: "robots",
				severity: "high",
				title: "robots.txt חוסם את כל האתר (Disallow: /)",
				description: "Disallow: / חוסם לחלוטין את כל הסורקים. אם זה לא כוונה (לדוגמה אתר בפיתוח), זה מונע אינדוקס לחלוטין.",
				fixHint: "אם זה אתר חי — להסיר את Disallow: / מיד. אם זה staging — להעביר לחסימת אינדוקס דרך כותרת X-Robots-Tag בלבד.",
				affected: [{ url: `${root}/robots.txt`, title: "robots.txt", detail: "Disallow: /" }],
			}),
		);
	}

	if (!robots.sitemap && sitemapUrl) {
		findings.push(
			buildFinding({
				ruleId: "tech_robots_missing_sitemap",
				category: "robots",
				severity: "low",
				title: "Sitemap לא מצוין ב-robots.txt",
				description: "כתובת ה-Sitemap לא מצוינת ב-robots.txt. זה אינו קריטי אבל מקובל להוסיף — מאיץ את הזיהוי על ידי גוגל ובינג.",
				fixHint: `הוסף שורה ל-robots.txt: Sitemap: ${sitemapUrl}`,
				affected: [{ url: `${root}/robots.txt` }],
			}),
		);
	}

	if (robots.blocksUploads) {
		findings.push(
			buildFinding({
				ruleId: "tech_robots_blocks_uploads",
				category: "robots",
				severity: "medium",
				title: "robots.txt חוסם את /wp-content/uploads/",
				description: "חסימה של תיקיית uploads מונעת מגוגל לראות ולאנדקס תמונות באתר. זה פוגע ב-Image Search ובהבנת תוכן.",
				fixHint: "להסיר את Disallow: /wp-content/uploads/ מ-robots.txt.",
				affected: [{ url: `${root}/robots.txt` }],
			}),
		);
	}

	return findings;
}

// ─── 3. Indexability cross-check ────────────────────────────────

interface ScanUrlSummary {
	url: string;
	title: string;
	isNoindex: boolean;
	canonical: string | null;
	postType?: string;
	postStatus?: string;
}

function extractUrlsFromFindings(findings: { ruleId: string; payload: string }[]): Map<string, ScanUrlSummary> {
	const map = new Map<string, ScanUrlSummary>();
	for (const f of findings) {
		let payload: Finding;
		try {
			payload = JSON.parse(f.payload);
		} catch {
			continue;
		}
		for (const a of payload.affectedUrls ?? []) {
			const cur = map.get(a.url) ?? {
				url: a.url,
				title: a.title || "",
				isNoindex: false,
				canonical: null,
				postType: a.post_type,
			};
			if (f.ruleId === "noindex-on-content") cur.isNoindex = true;
			if (f.ruleId === "canonical-external" || f.ruleId === "canonical-mismatch") {
				cur.canonical = a.detail ?? null;
			}
			map.set(a.url, cur);
		}
	}
	return map;
}

function auditIndexability(
	scanFindings: { ruleId: string; payload: string }[],
	clientTargetPages: string[],
	sitemapEntries: SitemapEntry[],
): Finding[] {
	const findings: Finding[] = [];
	const urlMap = extractUrlsFromFindings(scanFindings);
	const sitemapSet = new Set(sitemapEntries.map((e) => e.loc.replace(/\/$/, "")));

	// Target page is noindex
	const targetNoindex: PlainAffected[] = [];
	for (const tp of clientTargetPages) {
		const norm = tp.replace(/\/$/, "");
		const info = urlMap.get(tp) || urlMap.get(norm);
		if (info?.isNoindex) {
			targetNoindex.push({ url: tp, title: info.title, detail: "noindex פעיל" });
		}
	}
	if (targetNoindex.length > 0) {
		findings.push(
			buildFinding({
				ruleId: "tech_important_page_noindex",
				category: "indexation",
				severity: "high",
				title: "עמודי יעד חשובים מסומנים noindex",
				description: "עמוד שמסומן noindex לא יופיע בגוגל. אם זה עמוד יעד עסקי, זה גורם לאובדן תנועה משמעותי.",
				fixHint: "ב-Yoast — להסיר את הסימון \"Allow search engines to show this page\" ל-No.",
				affected: targetNoindex,
			}),
		);
	}

	// Target page missing from sitemap
	if (sitemapEntries.length > 0) {
		const missingTargets: PlainAffected[] = [];
		for (const tp of clientTargetPages) {
			const norm = tp.replace(/\/$/, "");
			if (!sitemapSet.has(tp) && !sitemapSet.has(norm)) {
				missingTargets.push({ url: tp });
			}
		}
		if (missingTargets.length > 0) {
			findings.push(
				buildFinding({
					ruleId: "tech_important_page_missing_from_sitemap",
					category: "sitemap",
					severity: "medium",
					title: "עמודי יעד חסרים ב-Sitemap",
					description: "עמודים חשובים שאינם מופיעים ב-Sitemap עלולים להתעדכן ביום במקום בדקות, ולחסר מ-Search Console.",
					fixHint: "ודא שעמודים אלו אינם noindex, שהם פורסמו (לא טיוטה), ושסוג הפוסט נכלל ב-Sitemap של Yoast.",
					affected: missingTargets,
				}),
			);
		}
	}

	return findings;
}

// ─── 4. Redirects / 404 audit (sample) ──────────────────────────

async function auditRedirectsAndStatus(
	sitemapEntries: SitemapEntry[],
	targetPages: string[],
): Promise<Finding[]> {
	const findings: Finding[] = [];

	// Build sample: targetPages + first 25 sitemap entries
	const sample = Array.from(new Set([...targetPages, ...sitemapEntries.slice(0, 25).map((e) => e.loc)])).slice(0, 30);
	if (sample.length === 0) return findings;

	const results = await pool(
		sample,
		async (url) => ({ url, ...(await safeHead(url)) }),
		4,
	);

	const redirects: PlainAffected[] = [];
	const notFound: PlainAffected[] = [];
	for (const r of results) {
		if (r.status === 0) continue;
		if (r.status >= 300 && r.status < 400 && r.redirected) {
			redirects.push({ url: r.url, detail: `${r.status} → ${r.finalUrl}` });
		} else if (r.status === 404 || r.status === 410) {
			notFound.push({ url: r.url, detail: `HTTP ${r.status}` });
		} else if (r.redirected) {
			redirects.push({ url: r.url, detail: `→ ${r.finalUrl}` });
		}
	}

	if (redirects.length > 0) {
		findings.push(
			buildFinding({
				ruleId: "tech_sitemap_url_redirects",
				category: "redirects",
				severity: "medium",
				title: "URLs ב-Sitemap מבצעים Redirect",
				description: "Sitemap צריך להכיל את ה-URLs הסופיים (אחרי redirect). URLs שעוברים redirect מקטינים את התקציב הסריקה ויוצרים בלבול.",
				fixHint: "עדכן את ה-permalinks או הגדרות Yoast כך שה-Sitemap יכיל את ה-URLs הסופיים בלבד.",
				affected: redirects,
			}),
		);
	}

	if (notFound.length > 0) {
		findings.push(
			buildFinding({
				ruleId: "tech_sitemap_url_404",
				category: "redirects",
				severity: "high",
				title: "URLs ב-Sitemap מחזירים 404/410",
				description: "Sitemap עם 404 שולח לגוגל אות שלילי על איכות האתר. גוגל גם מבזבז על זה תקציב סריקה שיכול היה ללכת לעמודים תקינים.",
				fixHint: "להסיר את העמודים האלו מה-Sitemap (לסמן noindex או למחוק), או להחזיר אותם לאוויר.",
				affected: notFound,
			}),
		);
	}

	return findings;
}

// ─── 5. Hreflang audit (basic, only for multi-language sites) ───

function auditHreflang(clientLanguage: string | null): Finding[] {
	// We don't have hreflang data in the current plugin scan. Surface as info
	// when the client is configured as multi-language so the gap is visible.
	if (clientLanguage !== "multi") return [];
	return [
		buildFinding({
			ruleId: "tech_hreflang_data_unavailable",
			category: "multi-language",
			severity: "info",
			title: "בדיקת Hreflang דורשת שדרוג פלאגין",
			description: "האתר מסומן כרב-לשוני בפרופיל הלקוח, אבל הפלאגין הנוכחי לא מחזיר Hreflang tags. בדיקה אוטומטית של חוסר/שגיאות תזדקק ל-Plugin v0.4+ עם נתוני HTML.",
			fixHint: "כרגע — ניתן לבדוק ידנית ב-Screaming Frog או ב-Yoast Hreflang plugin.",
			affected: [],
		}),
	];
}

// ─── 6. Schema audit (uses existing scan data) ──────────────────

function auditSchemaSitewide(scanFindings: { ruleId: string; payload: string }[]): Finding[] {
	const findings: Finding[] = [];
	// If "missing-schema-type" rule fires for >50% of URLs, flag sitewide
	const missingSchemaFinding = scanFindings.find((f) => f.ruleId === "missing-schema-type");
	if (missingSchemaFinding) {
		try {
			const parsed = JSON.parse(missingSchemaFinding.payload) as Finding;
			if (parsed.count >= 20) {
				findings.push(
					buildFinding({
						ruleId: "tech_schema_missing_sitewide",
						category: "schema",
						severity: "medium",
						title: "Schema markup חסר באופן רוחבי",
						description: `${parsed.count} עמודים ללא schema type ב-Yoast. Schema עוזר לגוגל להציג Rich Results — חוסר רוחבי שלו מקטין נראות.`,
						fixHint: "ב-Yoast → Schema → להגדיר Default Article Type ו-Default Page Type ברמת האתר. ב-WooCommerce — לוודא ש-Schema פעיל.",
						affected: [{ url: "site-wide", title: "כל האתר", detail: `${parsed.count} עמודים` }],
					}),
				);
			}
		} catch {
			/* skip */
		}
	}
	return findings;
}

// ─── 7. PSI audit (gated on env var) ────────────────────────────

interface PsiResult {
	url: string;
	mobilePerf?: number;
	desktopPerf?: number;
	lcp?: number;       // seconds
	inp?: number;       // milliseconds
	cls?: number;
	error?: string;
}

async function auditPSI(urls: string[]): Promise<Finding[]> {
	if (process.env.PSI_ENABLED !== "true") return [];
	if (urls.length === 0) return [];

	const apiKey = process.env.PSI_API_KEY;
	const top = urls.slice(0, 5);

	const results: PsiResult[] = await pool(
		top,
		async (url) => {
			const fetchCategory = async (strategy: "mobile" | "desktop") => {
				const u = new URL("https://www.googleapis.com/pagespeedonline/v5/runPagespeed");
				u.searchParams.set("url", url);
				u.searchParams.set("strategy", strategy);
				u.searchParams.set("category", "performance");
				if (apiKey) u.searchParams.set("key", apiKey);
				const r = await safeFetch(u.toString());
				if (!r.ok || !r.text) return null;
				try {
					return JSON.parse(r.text) as {
						lighthouseResult?: { categories?: { performance?: { score?: number } } };
						loadingExperience?: { metrics?: Record<string, { percentile?: number; category?: string }> };
					};
				} catch {
					return null;
				}
			};
			const [m, d] = await Promise.all([fetchCategory("mobile"), fetchCategory("desktop")]);
			const result: PsiResult = { url };
			if (m?.lighthouseResult?.categories?.performance?.score !== undefined) {
				result.mobilePerf = Math.round((m.lighthouseResult.categories.performance.score ?? 0) * 100);
			}
			if (d?.lighthouseResult?.categories?.performance?.score !== undefined) {
				result.desktopPerf = Math.round((d.lighthouseResult.categories.performance.score ?? 0) * 100);
			}
			const lcp = m?.loadingExperience?.metrics?.LARGEST_CONTENTFUL_PAINT_MS?.percentile;
			const inp = m?.loadingExperience?.metrics?.INTERACTION_TO_NEXT_PAINT?.percentile;
			const cls = m?.loadingExperience?.metrics?.CUMULATIVE_LAYOUT_SHIFT_SCORE?.percentile;
			if (lcp !== undefined) result.lcp = lcp / 1000;
			if (inp !== undefined) result.inp = inp;
			if (cls !== undefined) result.cls = (cls ?? 0) / 100;
			return result;
		},
		2,
	);

	const findings: Finding[] = [];
	const poorMobile = results.filter((r) => (r.mobilePerf ?? 100) < 50);
	const poorDesktop = results.filter((r) => (r.desktopPerf ?? 100) < 50);
	const poorLcp = results.filter((r) => (r.lcp ?? 0) > 4);
	const poorInp = results.filter((r) => (r.inp ?? 0) > 500);
	const poorCls = results.filter((r) => (r.cls ?? 0) > 0.25);

	if (poorMobile.length > 0) {
		findings.push(
			buildFinding({
				ruleId: "tech_poor_mobile_performance",
				category: "performance",
				severity: "high",
				title: "ביצועי מובייל נמוכים",
				description: "Performance score של פחות מ-50 במובייל מסמן בעיות חמורות בזמן טעינה. גוגל משתמש במובייל כ-primary index.",
				fixHint: "התחל מ-LCP: דחיסת תמונות, lazy-load מתחת ל-fold, הקטנת CSS/JS. PSI מפרט את ההמלצות.",
				affected: poorMobile.map((r) => ({ url: r.url, detail: `Mobile: ${r.mobilePerf}/100` })),
			}),
		);
	}
	if (poorDesktop.length > 0) {
		findings.push(
			buildFinding({
				ruleId: "tech_poor_desktop_performance",
				category: "performance",
				severity: "medium",
				title: "ביצועי דסקטופ נמוכים",
				description: "Performance score של פחות מ-50 בדסקטופ אינו תקין. גם אם המובייל קודם, דסקטופ עדיין חשוב לקונברסיה.",
				fixHint: "ראה המלצות PSI ב-Lab data של ה-URL הספציפי.",
				affected: poorDesktop.map((r) => ({ url: r.url, detail: `Desktop: ${r.desktopPerf}/100` })),
			}),
		);
	}
	if (poorLcp.length > 0) {
		findings.push(
			buildFinding({
				ruleId: "tech_poor_lcp",
				category: "performance",
				severity: "high",
				title: "LCP נמוך (Largest Contentful Paint)",
				description: "LCP מעל 4 שניות פוגע משמעותית בחוויית המשתמש ובדירוג. גוגל מסמן זאת כ-poor.",
				fixHint: "צמצם את משקל התמונה הראשית של העמוד, הוסף preload, הפעל CDN.",
				affected: poorLcp.map((r) => ({ url: r.url, detail: `LCP: ${r.lcp?.toFixed(1)}s` })),
			}),
		);
	}
	if (poorInp.length > 0) {
		findings.push(
			buildFinding({
				ruleId: "tech_poor_inp",
				category: "performance",
				severity: "medium",
				title: "INP גבוה (אינטראקטיביות איטית)",
				description: "INP מעל 500ms מסמן שדפדפנים נתקעים בעת אינטראקציה של המשתמש. ב-2024 INP החליף את FID במדדים הרשמיים.",
				fixHint: "צמצם JavaScript ראשי, פצל chunks, השתמש ב-defer/async.",
				affected: poorInp.map((r) => ({ url: r.url, detail: `INP: ${r.inp}ms` })),
			}),
		);
	}
	if (poorCls.length > 0) {
		findings.push(
			buildFinding({
				ruleId: "tech_poor_cls",
				category: "performance",
				severity: "medium",
				title: "CLS גבוה (תזוזות פתאומיות)",
				description: "CLS מעל 0.25 מציין שתוכן זז בזמן הטעינה — מסמל ביצועים פחות טובים וחוויית משתמש לא יציבה.",
				fixHint: "הגדר width/height לתמונות ולפרסומות; שמור שטח cleared בכל אלמנט שטוען דינמית.",
				affected: poorCls.map((r) => ({ url: r.url, detail: `CLS: ${r.cls?.toFixed(2)}` })),
			}),
		);
	}

	return findings;
}

// ─── Opportunity creation ───────────────────────────────────────

const TECH_RULE_TO_TITLE_HE: Record<string, { title: string; impact: "low" | "medium" | "high" }> = {
	tech_sitemap_missing: { title: "אין sitemap.xml — סיכוי גבוה לאינדוקס איטי", impact: "high" },
	tech_sitemap_url_404: { title: "Sitemap מכיל 404 — לתקן בדחיפות", impact: "high" },
	tech_robots_blocks_all: { title: "robots.txt חוסם את כל האתר", impact: "high" },
	tech_important_page_noindex: { title: "עמוד יעד חשוב מסומן noindex", impact: "high" },
	tech_poor_mobile_performance: { title: "ביצועי מובייל נמוכים", impact: "high" },
	tech_poor_lcp: { title: "LCP גבוה — חוויית טעינה איטית", impact: "high" },
};

async function createTechOpportunities(
	clientId: string,
	findings: Finding[],
): Promise<{ created: number; updated: number }> {
	let created = 0;
	let updated = 0;
	for (const f of findings) {
		const tpl = TECH_RULE_TO_TITLE_HE[f.ruleId];
		if (!tpl) continue; // only escalate critical tech findings to opportunities

		// Build relatedPage from first affected URL (or empty for site-wide)
		const relatedPage = f.affectedUrls[0]?.url?.startsWith("http")
			? f.affectedUrls[0].url
			: "";

		const score = tpl.impact === "high" ? 80 : tpl.impact === "medium" ? 60 : 40;

		try {
			const result = await db.opportunity.upsert({
				where: {
					clientId_type_relatedKeyword_relatedPage_relatedQuery: {
						clientId,
						type: "technical_seo_issue",
						relatedKeyword: "",
						relatedPage,
						relatedQuery: f.ruleId, // used as stable dedupe slot per tech rule
					},
				},
				create: {
					clientId,
					type: "technical_seo_issue",
					title: tpl.title,
					description: f.description,
					evidence: JSON.stringify({
						ruleId: f.ruleId,
						count: f.count,
						sampleAffected: f.affectedUrls.slice(0, 5),
					}),
					recommendedAction: f.fixHint ?? "",
					priorityScore: score,
					impact: tpl.impact,
					effort: "medium",
					confidence: "high",
					status: "detected",
					relatedKeyword: "",
					relatedPage,
					relatedQuery: f.ruleId,
					source: "technical_audit",
				},
				update: {
					title: tpl.title,
					description: f.description,
					evidence: JSON.stringify({
						ruleId: f.ruleId,
						count: f.count,
						sampleAffected: f.affectedUrls.slice(0, 5),
					}),
					recommendedAction: f.fixHint ?? "",
					priorityScore: score,
					impact: tpl.impact,
					source: "technical_audit",
				},
			});
			if (result.createdAt.getTime() === result.updatedAt.getTime()) created++;
			else updated++;
		} catch (err) {
			console.error("tech opportunity upsert failed", f.ruleId, err);
		}
	}
	return { created, updated };
}

// ─── Runner ─────────────────────────────────────────────────────

export interface TechAuditResult {
	scanId: string;
	findingsCreated: number;
	findingsRemoved: number;
	sitemapEntries: number;
	psiRan: boolean;
	opportunitiesCreated: number;
	opportunitiesUpdated: number;
	durationMs: number;
}

export async function runTechnicalAudit(clientId: string): Promise<TechAuditResult> {
	const startedAt = Date.now();
	const client = await db.client.findUnique({ where: { id: clientId } });
	if (!client) throw new Error(`Client ${clientId} not found`);
	const latestScan = await db.scan.findFirst({
		where: { clientId },
		orderBy: { ranAt: "desc" },
		include: { findings: { select: { ruleId: true, payload: true } } },
	});
	if (!latestScan) {
		throw new Error("אין סריקה זמינה. הרץ סריקה ראשונה לפני ניתוח טכני.");
	}

	const root = siteRoot(client.baseUrl);

	// Robots first (its sitemap pointer feeds the sitemap audit)
	const robots = await fetchRobots(root);
	const sitemap = await auditSitemap(root, robots.sitemap);
	const robotsFindings = auditRobots(robots, root, sitemap.sitemapUrl);
	const indexabilityFindings = auditIndexability(
		latestScan.findings,
		client.targetPages,
		sitemap.sitemapEntries,
	);
	const redirectFindings = await auditRedirectsAndStatus(
		sitemap.sitemapEntries,
		client.targetPages,
	);
	const schemaFindings = auditSchemaSitewide(latestScan.findings);
	const hreflangFindings = auditHreflang(client.language);

	// PSI: top 5 URLs = homepage + first 4 targetPages
	const psiUrls = Array.from(
		new Set([root + "/", ...client.targetPages]),
	).slice(0, 5);
	const psiFindings = await auditPSI(psiUrls);

	const allFindings = [
		...sitemap.findings,
		...robotsFindings,
		...indexabilityFindings,
		...redirectFindings,
		...schemaFindings,
		...hreflangFindings,
		...psiFindings,
	];

	// Replace previous tech findings on this scan
	const removed = await db.finding.deleteMany({
		where: {
			scanId: latestScan.id,
			ruleId: { startsWith: "tech_" },
		},
	});

	// Insert new
	if (allFindings.length > 0) {
		await db.finding.createMany({
			data: allFindings.map((f) => ({
				scanId: latestScan.id,
				ruleId: f.ruleId,
				severity: f.severity,
				count: f.count,
				payload: JSON.stringify(f),
			})),
		});
	}

	// Update the scan's summary to include tech audit metadata
	let summary: Record<string, unknown> = {};
	try {
		summary = JSON.parse(latestScan.summary) as Record<string, unknown>;
	} catch {
		summary = {};
	}
	summary.tech_audit = {
		ranAt: new Date().toISOString(),
		findings: allFindings.length,
		sitemapEntries: sitemap.sitemapEntries.length,
		psiRan: psiFindings.length > 0 || process.env.PSI_ENABLED === "true",
	};
	await db.scan.update({
		where: { id: latestScan.id },
		data: { summary: JSON.stringify(summary) },
	});

	// Escalate critical tech findings → opportunities
	const oppCounts = await createTechOpportunities(clientId, allFindings);

	return {
		scanId: latestScan.id,
		findingsCreated: allFindings.length,
		findingsRemoved: removed.count,
		sitemapEntries: sitemap.sitemapEntries.length,
		psiRan: process.env.PSI_ENABLED === "true",
		opportunitiesCreated: oppCounts.created,
		opportunitiesUpdated: oppCounts.updated,
		durationMs: Date.now() - startedAt,
	};
}
