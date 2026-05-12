import type { Rule } from "@/lib/audit/types";
import { iterateUrls, toAffected, isTrueish, PUBLIC_CONTENT_TYPES } from "@/lib/audit/types";

export const noindexOnContent: Rule = {
	id: "noindex-on-content",
	category: "indexation",
	defaultSeverity: "high",
	run: (scan) => {
		const affected = [];
		for (const u of iterateUrls(scan)) {
			if (!PUBLIC_CONTENT_TYPES.has(u.post_type)) continue;
			if (u.post_status !== "publish") continue;
			const fromIndexable = isTrueish(u.yoast?.indexable?.is_robots_noindex);
			const fromPostMeta = u.yoast?.meta_robots_noindex === "1";
			if (!fromIndexable && !fromPostMeta) continue;
			affected.push(toAffected(u, "noindex flag set"));
		}
		if (affected.length === 0) return null;
		return {
			ruleId: "noindex-on-content",
			category: "indexation",
			title: "תוכן שפורסם עם דגל noindex",
			description:
				"דפים שמסומנים במפורש לא להיכנס לאינדקס של Google. לפעמים זה מכוון, כמו דפי תודה או מסמכים פנימיים. לרוב זו תקלת הגדרה, ותוכן שפורסם עם noindex לא מכניס תנועה אורגנית.",
			severity: "high",
			count: affected.length,
			affectedUrls: affected,
			fixHint:
				"לעבור על כל דף ברשימה. אם הוא באמת פנימי או טרנזקציוני, להשאיר את ה-noindex. אם זה תוכן ללקוחות, להסיר את הדגל בלוח המתקדם של Yoast.",
		};
	},
};

function safeHost(url: string): string | null {
	try {
		return new URL(url).host;
	} catch {
		return null;
	}
}

export const canonicalExternal: Rule = {
	id: "canonical-external",
	category: "indexation",
	defaultSeverity: "high",
	run: (scan) => {
		const affected = [];
		for (const u of iterateUrls(scan)) {
			if (!PUBLIC_CONTENT_TYPES.has(u.post_type)) continue;
			if (u.post_status !== "publish") continue;
			const can =
				(u.yoast?.indexable?.canonical?.toString().trim() ||
					u.yoast?.canonical?.toString().trim() ||
					"");
			if (!can) continue;
			const canHost = safeHost(can);
			const pageHost = safeHost(u.url);
			if (!canHost || !pageHost) continue;
			if (canHost === pageHost) continue;
			affected.push(toAffected(u, `canonical → ${canHost}`));
		}
		if (affected.length === 0) return null;
		return {
			ruleId: "canonical-external",
			category: "indexation",
			title: "דפים עם canonical לדומיין חיצוני",
			description:
				"תגית ה-canonical מצביעה לדומיין שונה מהדף עצמו. זה אומר ל-Google לתת קרדיט דירוג לאתר השני. שימושי לתוכן שמופץ באופן רשמי, אחרת זה באג אינדוקס חמור.",
			severity: "high",
			count: affected.length,
			affectedUrls: affected,
			fixHint:
				"לוודא בכל מקרה שזה מכוון. אם לא, להסיר את ה-canonical המותאם ולתת ל-Yoast להגדיר self-canonical אוטומטי.",
		};
	},
};

export const canonicalMismatch: Rule = {
	id: "canonical-mismatch",
	category: "indexation",
	defaultSeverity: "medium",
	run: (scan) => {
		const affected = [];
		for (const u of iterateUrls(scan)) {
			if (!PUBLIC_CONTENT_TYPES.has(u.post_type)) continue;
			if (u.post_status !== "publish") continue;
			const can = (u.yoast?.indexable?.canonical?.toString().trim() || u.yoast?.canonical?.toString().trim() || "");
			if (!can) continue;
			const canHost = safeHost(can);
			const pageHost = safeHost(u.url);
			if (!canHost || !pageHost) continue;
			if (canHost !== pageHost) continue;  // external is a separate rule
			// Compare path (strip query/hash + trailing slashes for comparison)
			const norm = (s: string) => {
				try {
					const x = new URL(s);
					return (x.pathname.replace(/\/+$/, "") || "/").toLowerCase();
				} catch {
					return s;
				}
			};
			if (norm(can) === norm(u.url)) continue;
			affected.push(toAffected(u, `→ ${can}`));
		}
		if (affected.length === 0) return null;
		return {
			ruleId: "canonical-mismatch",
			category: "indexation",
			title: "דפים עם canonical לדף אחר באותו אתר",
			description:
				"ה-canonical מצביע לדף אחר בדומיין. לפעמים זה מכוון, למשל URL מועדף לתוכן עם וריאנטים או עמודים מחולקים. לרוב זו תקלת הגדרה שמסתירה את הדף מהחיפוש.",
			severity: "medium",
			count: affected.length,
			affectedUrls: affected,
			fixHint:
				"לוודא בכל דף שיעד ה-canonical הוא הדף שאתה רוצה לדרג. אם לא, להסיר את ה-canonical המותאם ולתת ל-Yoast להגדיר אוטומטי.",
		};
	},
};
