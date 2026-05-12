import type { Rule } from "@/lib/audit/types";
import { iterateUrls, toAffected, PUBLIC_CONTENT_TYPES } from "@/lib/audit/types";

const MIN = 70;
const MAX = 160;

import type { UrlEntry } from "@/lib/plugin-client";
function resolvedDesc(u: UrlEntry): string {
	return (u.yoast?.description?.trim() || u.yoast?.indexable?.description?.toString().trim() || "");
}

export const descTooLong: Rule = {
	id: "description-too-long",
	category: "on-page-meta",
	defaultSeverity: "low",
	run: (scan) => {
		const affected = [];
		for (const u of iterateUrls(scan)) {
			if (!PUBLIC_CONTENT_TYPES.has(u.post_type)) continue;
			if (u.post_status !== "publish") continue;
			const d = resolvedDesc(u);
			if (!d) continue;
			if (d.length <= MAX) continue;
			affected.push(toAffected(u, `${d.length} chars`));
		}
		if (affected.length === 0) return null;
		return {
			ruleId: "description-too-long",
			category: "on-page-meta",
			title: `תיאורי מטא ארוכים מ-${MAX} תווים`,
			description: `Google חותך תיאורי מטא באזור ${MAX} תווים בתוצאות החיפוש. החלק החתוך נעלם מהמשתמש.`,
			severity: "low",
			count: affected.length,
			affectedUrls: affected,
			fixHint: `להדק כל תיאור לטווח של ${MIN} עד ${MAX} תווים. להתחיל מהצעת הערך הברורה ביותר.`,
		};
	},
};

export const descTooShort: Rule = {
	id: "description-too-short",
	category: "on-page-meta",
	defaultSeverity: "low",
	run: (scan) => {
		const affected = [];
		for (const u of iterateUrls(scan)) {
			if (!PUBLIC_CONTENT_TYPES.has(u.post_type)) continue;
			if (u.post_status !== "publish") continue;
			const d = resolvedDesc(u);
			if (!d) continue;
			if (d.length >= MIN) continue;
			affected.push(toAffected(u, `${d.length} chars — "${d}"`));
		}
		if (affected.length === 0) return null;
		return {
			ruleId: "description-too-short",
			category: "on-page-meta",
			title: `תיאורי מטא קצרים מ-${MIN} תווים`,
			description: "תיאורים קצרים מאוד מפסידים את ההזדמנות לשכנע את הגולש להקליק. בדרך כלל יש מקום ליתרון מרכזי, פירוט משני וקריאה לפעולה רכה.",
			severity: "low",
			count: affected.length,
			affectedUrls: affected,
			fixHint: `להרחיב ל-${MIN} עד ${MAX} תווים. המבנה: יתרון מוביל, פרט משני נוסף, קריאה לפעולה רכה.`,
		};
	},
};
