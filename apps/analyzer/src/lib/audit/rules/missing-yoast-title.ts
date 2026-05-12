import type { Rule } from "@/lib/audit/types";
import { iterateUrls, toAffected, PUBLIC_CONTENT_TYPES } from "@/lib/audit/types";

export const missingYoastTitle: Rule = {
	id: "missing-yoast-title",
	category: "on-page-meta",
	defaultSeverity: "high",
	run: (scan) => {
		const affected = [];
		for (const u of iterateUrls(scan)) {
			if (!PUBLIC_CONTENT_TYPES.has(u.post_type)) continue;
			if (u.post_status !== "publish") continue;
			const hasPostMeta = !!u.yoast?.title?.trim();
			const hasIndexable = !!u.yoast?.indexable?.title?.toString().trim();
			if (hasPostMeta || hasIndexable) continue;
			affected.push(toAffected(u, u.title || "(no title)"));
		}
		if (affected.length === 0) return null;
		return {
			ruleId: "missing-yoast-title",
			category: "on-page-meta",
			title: "דפים ללא כותרת SEO מותאמת",
			description:
				"בדפים האלה Yoast משתמש בתבנית כותרת גלובלית במקום בכותרת ייעודית. כותרות מותאמות לכל דף מדורגות טוב יותר ב-Google ומקבלות שיעור הקלקה גבוה יותר בתוצאות החיפוש.",
			severity: "high",
			count: affected.length,
			affectedUrls: affected,
			fixHint: "להיכנס לכל דף או מוצר באדמין של וורדפרס, ללוח של Yoast SEO, ולהגדיר כותרת ייעודית.",
		};
	},
};
