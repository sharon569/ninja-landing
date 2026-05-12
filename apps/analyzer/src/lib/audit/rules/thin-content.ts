import type { Rule } from "@/lib/audit/types";
import { iterateUrls, toAffected, PUBLIC_CONTENT_TYPES } from "@/lib/audit/types";

const THIN_THRESHOLD = 100;       // posts/pages below this are clearly thin
const PRODUCT_THIN_THRESHOLD = 30;  // product descriptions get a lower bar

export const thinContent: Rule = {
	id: "thin-content",
	category: "content-quality",
	defaultSeverity: "medium",
	run: (scan) => {
		const affected = [];
		for (const u of iterateUrls(scan)) {
			if (!PUBLIC_CONTENT_TYPES.has(u.post_type)) continue;
			if (u.post_status !== "publish") continue;
			const wc = u.content_metrics?.word_count ?? 0;
			const threshold = u.post_type === "product" ? PRODUCT_THIN_THRESHOLD : THIN_THRESHOLD;
			if (wc >= threshold) continue;
			affected.push(toAffected(u, `${wc} words`));
		}
		if (affected.length === 0) return null;
		return {
			ruleId: "thin-content",
			category: "content-quality",
			title: "דפים עם תוכן דליל",
			description:
				"דפים עם מעט מאוד טקסט בגוף התוכן מתקשים להידרג. מערכות התוכן המועיל של Google מענישות אתרים שמכפילים דפים דלילים. במוצרים זה תופס SKU-ים ללא תיאור, בפוסטים ובדפים זה תופס סטאבים מינימליים.",
			severity: "medium",
			count: affected.length,
			affectedUrls: affected,
			fixHint:
				"במוצרים, להוסיף תיאור קצר שמכסה חומר, מידות, שימושים וטיפול. בדפים ובפוסטים, להעמיק עם דוגמאות ושאלות נפוצות, או להסיר עם 301 אם הם לא רלוונטיים.",
		};
	},
};
