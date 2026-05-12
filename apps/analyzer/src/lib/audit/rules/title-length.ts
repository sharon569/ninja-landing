import type { Rule } from "@/lib/audit/types";
import { iterateUrls, toAffected, PUBLIC_CONTENT_TYPES } from "@/lib/audit/types";

// Google SERP visible title is roughly 50-60 chars before truncation; <30 is wasted space.
const MIN = 30;
const MAX = 60;

import type { UrlEntry } from "@/lib/plugin-client";
function resolvedTitle(u: UrlEntry): string {
	return (u.yoast?.title?.trim() || u.yoast?.indexable?.title?.toString().trim() || "");
}

export const titleTooLong: Rule = {
	id: "title-too-long",
	category: "on-page-meta",
	defaultSeverity: "low",
	run: (scan) => {
		const affected = [];
		for (const u of iterateUrls(scan)) {
			if (!PUBLIC_CONTENT_TYPES.has(u.post_type)) continue;
			if (u.post_status !== "publish") continue;
			const t = resolvedTitle(u);
			if (!t) continue;  // missing title is a separate rule
			if (t.length <= MAX) continue;
			affected.push(toAffected(u, `${t.length} chars — "${t.slice(0, 80)}…"`));
		}
		if (affected.length === 0) return null;
		return {
			ruleId: "title-too-long",
			category: "on-page-meta",
			title: `כותרות SEO ארוכות מ-${MAX} תווים`,
			description: `Google חותך כותרות באזור ${MAX} תווים בתוצאות החיפוש. מה שמעבר מקבל שלוש נקודות ומסתיר את הצעת הערך של הדף.`,
			severity: "low",
			count: affected.length,
			affectedUrls: affected,
			fixHint: `לקצר כל כותרת מושפעת מתחת ל-${MAX} תווים תוך שמירה על מילת המפתח הראשית בתחילת הכותרת.`,
		};
	},
};

export const titleTooShort: Rule = {
	id: "title-too-short",
	category: "on-page-meta",
	defaultSeverity: "low",
	run: (scan) => {
		const affected = [];
		for (const u of iterateUrls(scan)) {
			if (!PUBLIC_CONTENT_TYPES.has(u.post_type)) continue;
			if (u.post_status !== "publish") continue;
			const t = resolvedTitle(u);
			if (!t) continue;
			if (t.length >= MIN) continue;
			affected.push(toAffected(u, `${t.length} chars — "${t}"`));
		}
		if (affected.length === 0) return null;
		return {
			ruleId: "title-too-short",
			category: "on-page-meta",
			title: `כותרות SEO קצרות מ-${MIN} תווים`,
			description: "כותרות קצרות מבזבזות שטח יקר בתוצאות החיפוש. בדרך כלל יש מקום למילת המפתח הראשית בנוסף להצעת ערך או למותג.",
			severity: "low",
			count: affected.length,
			affectedUrls: affected,
			fixHint: `להרחיב את הכותרת ל-${MIN} עד ${MAX} תווים. הנוסחה: מילת מפתח ראשית, ערך ברור (למשל 'משלוח מהיר' או 'החזרה חינם'), שם המותג.`,
		};
	},
};
