import type { Rule } from "@/lib/audit/types";
import { iterateUrls, toAffected, PUBLIC_CONTENT_TYPES } from "@/lib/audit/types";

export const missingYoastDescription: Rule = {
	id: "missing-yoast-description",
	category: "on-page-meta",
	defaultSeverity: "high",
	run: (scan) => {
		const affected = [];
		for (const u of iterateUrls(scan)) {
			if (!PUBLIC_CONTENT_TYPES.has(u.post_type)) continue;
			if (u.post_status !== "publish") continue;
			const hasPostMeta = !!u.yoast?.description?.trim();
			const hasIndexable = !!u.yoast?.indexable?.description?.toString().trim();
			if (hasPostMeta || hasIndexable) continue;
			affected.push(toAffected(u, u.title || "(no title)"));
		}
		if (affected.length === 0) return null;
		return {
			ruleId: "missing-yoast-description",
			category: "on-page-meta",
			title: "דפים ללא תיאור מטא מותאם",
			description:
				"כאשר לא הוגדר תיאור מטא, Google מייצר באופן אוטומטי קטע מתוך תוכן הדף. הקטע האוטומטי לרוב לא קוהרנטי ופוגע משמעותית בשיעור ההקלקה מתוצאות החיפוש.",
			severity: "high",
			count: affected.length,
			affectedUrls: affected,
			fixHint:
				"לכתוב תיאור באורך 140 עד 155 תווים לכל דף שמדגיש את הערך או ההצעה. עבור קטלוג מוצרים, תבנית כמו 'שם המוצר | המותג | משלוח חינם' עובדת היטב בקנה מידה.",
		};
	},
};
