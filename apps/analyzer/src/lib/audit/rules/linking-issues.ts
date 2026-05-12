import type { Rule } from "@/lib/audit/types";
import { iterateUrls, toAffected, PUBLIC_CONTENT_TYPES } from "@/lib/audit/types";

/** Orphan pages — Yoast's own indexer reports zero incoming internal links. */
export const orphanPage: Rule = {
	id: "orphan-page",
	category: "internal-linking",
	defaultSeverity: "medium",
	run: (scan) => {
		const affected = [];
		for (const u of iterateUrls(scan)) {
			if (!PUBLIC_CONTENT_TYPES.has(u.post_type)) continue;
			if (u.post_status !== "publish") continue;
			const incoming = u.yoast?.indexable?.incoming_link_count;
			if (incoming === null || incoming === undefined) continue;  // not computed
			if ((incoming as number) > 0) continue;
			affected.push(toAffected(u, "0 incoming internal links"));
		}
		if (affected.length === 0) return null;
		return {
			ruleId: "orphan-page",
			category: "internal-linking",
			title: "דפים יתומים (ללא קישורים פנימיים נכנסים)",
			description:
				"דפים שאף עמוד אחר באתר לא מקשר אליהם. מנועי חיפוש מתקשים לגלות אותם ולדרג אותם, וגולשים כמעט אף פעם לא מגיעים אליהם דרך ניווט פנימי. לרוב סימן לתוכן שנשכח.",
			severity: "medium",
			count: affected.length,
			affectedUrls: affected,
			fixHint:
				"להוסיף שניים או שלושה קישורים פנימיים בהקשר רלוונטי מפוסטים ודפי קטגוריה בעלי תנועה. אם הדף היתום באמת לא רלוונטי יותר, לעשות אליו 301 לעמוד מתאים.",
		};
	},
};

/** Dead-end pages — Yoast reports zero outbound internal links from this page. */
export const noInternalLinksOut: Rule = {
	id: "no-internal-links-out",
	category: "internal-linking",
	defaultSeverity: "low",
	run: (scan) => {
		const affected = [];
		for (const u of iterateUrls(scan)) {
			if (!PUBLIC_CONTENT_TYPES.has(u.post_type)) continue;
			if (u.post_status !== "publish") continue;
			const out = u.yoast?.indexable?.link_count;
			if (out === null || out === undefined) continue;
			if ((out as number) > 0) continue;
			// Also use DOM-parsed count as a secondary signal
			if ((u.content_metrics?.internal_links ?? 0) > 0) continue;
			affected.push(toAffected(u, "0 outbound internal links"));
		}
		if (affected.length === 0) return null;
		return {
			ruleId: "no-internal-links-out",
			category: "internal-linking",
			title: "דפים ללא קישורים פנימיים יוצאים",
			description:
				"דפים שלא מקשרים לשום מקום אחר באתר לא מעבירים אקוויטי קישורים לעמודים אחרים, ולא נותנים לגולש צעד הבא לחיפוש. הם מרגישים כמו מבוי סתום.",
			severity: "low",
			count: affected.length,
			affectedUrls: affected,
			fixHint:
				"להוסיף לפחות קישור פנימי רלוונטי אחד בכל דף. לפוסט קשור, לקטגוריה, או למוצר. אפילו קישור בהקשר אחד עוזר.",
		};
	},
};
