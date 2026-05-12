import type { Rule } from "@/lib/audit/types";
import { iterateUrls, toAffected, PUBLIC_CONTENT_TYPES } from "@/lib/audit/types";

export const missingFocusKeyword: Rule = {
	id: "missing-focus-keyword",
	category: "on-page-meta",
	defaultSeverity: "medium",
	run: (scan) => {
		const affected = [];
		for (const u of iterateUrls(scan)) {
			if (!PUBLIC_CONTENT_TYPES.has(u.post_type)) continue;
			if (u.post_status !== "publish") continue;
			const fk = (u.yoast?.focus_keyword ?? u.yoast?.indexable?.primary_focus_keyword ?? "").toString().trim();
			if (fk) continue;
			affected.push(toAffected(u, u.title || "(no title)"));
		}
		if (affected.length === 0) return null;
		return {
			ruleId: "missing-focus-keyword",
			category: "on-page-meta",
			title: "דפים ללא מילת מפתח ממוקדת",
			description:
				"שדה מילת המפתח של Yoast מפעיל את בדיקות ה-SEO בעורך (צפיפות מילות מפתח, התאמת slug, נוכחות בפסקת הפתיחה) ומסמן על איזה ביטוי הדף ממוקד. דפים ללא מילת מפתח עוקפים את כל הבדיקות האלו.",
			severity: "medium",
			count: affected.length,
			affectedUrls: affected,
			fixHint:
				"לבחור את שאילתת החיפוש החשובה ביותר לכל דף ולהגדיר אותה כמילת מפתח ממוקדת בלוח של Yoast. מילת מפתח אחת לכל דף, לא רשימה.",
		};
	},
};
