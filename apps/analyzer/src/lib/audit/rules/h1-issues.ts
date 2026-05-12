import type { Rule } from "@/lib/audit/types";
import { iterateUrls, toAffected, PUBLIC_CONTENT_TYPES } from "@/lib/audit/types";

/**
 * IMPORTANT CAVEAT: The plugin currently parses only `the_content` filter output
 * for headings — many themes (including Levizon's and meat-shop's `oc-main-theme`)
 * render the page H1 from the page template OUTSIDE post_content. Plugin v0.3
 * will fetch the rendered HTML to fix this. Until then, h1_count=0 here is
 * suggestive, not definitive — surface it but with a hint about the caveat.
 */
export const missingH1: Rule = {
	id: "missing-h1",
	category: "content-structure",
	defaultSeverity: "high",
	run: (scan) => {
		const affected = [];
		for (const u of iterateUrls(scan)) {
			if (!PUBLIC_CONTENT_TYPES.has(u.post_type)) continue;
			if (u.post_status !== "publish") continue;
			const h1c = u.content_metrics?.h1_count ?? 0;
			if (h1c > 0) continue;
			affected.push(toAffected(u, "no H1 in post content"));
		}
		if (affected.length === 0) return null;
		return {
			ruleId: "missing-h1",
			category: "content-structure",
			title: "דפים ללא תגית H1 בגוף התוכן",
			description:
				"כותרת H1 היא הכותרת החשובה ביותר בעמוד. הרבה תמות מציגות את ה-H1 דרך תבנית התמה ולא דרך תוכן הפוסט, ולכן הרשימה כאן עשויה לכלול false positives. כדאי לוודא בדפדפן את הרינדור לפני תיקון.",
			severity: "medium",
			count: affected.length,
			affectedUrls: affected,
			fixHint:
				"לבדוק את הדף הרנדור בדפדפן. אם באמת אין H1 בעמוד הנראה, להוסיף אחת. לרוב המקור הוא הגדרת התמה לאלמנט הכותרת.",
		};
	},
};

export const multipleH1: Rule = {
	id: "multiple-h1",
	category: "content-structure",
	defaultSeverity: "medium",
	run: (scan) => {
		const affected = [];
		for (const u of iterateUrls(scan)) {
			if (!PUBLIC_CONTENT_TYPES.has(u.post_type)) continue;
			if (u.post_status !== "publish") continue;
			const h1c = u.content_metrics?.h1_count ?? 0;
			if (h1c <= 1) continue;
			affected.push(toAffected(u, `${h1c} H1 elements`));
		}
		if (affected.length === 0) return null;
		return {
			ruleId: "multiple-h1",
			category: "content-structure",
			title: "דפים עם יותר מתגית H1 אחת",
			description:
				"כשיש כמה תגיות H1 בעמוד הפוקוס הנושאי מתפזר. Google עדיין יכול לדרג את הדף, אבל האות הברור ביותר הוא H1 יחיד הממוקד במילת המפתח.",
			severity: "medium",
			count: affected.length,
			affectedUrls: affected,
			fixHint: "להוריד את ה-H1 המשניים ל-H2. בדרך כלל ה-H1 הוא רק כותרת ההירו של הדף, כל השאר H2 ומטה.",
		};
	},
};

export const headingHierarchySkip: Rule = {
	id: "heading-hierarchy-skip",
	category: "content-structure",
	defaultSeverity: "low",
	run: (scan) => {
		const affected = [];
		for (const u of iterateUrls(scan)) {
			if (!PUBLIC_CONTENT_TYPES.has(u.post_type)) continue;
			if (u.post_status !== "publish") continue;
			const h2 = u.content_metrics?.h2_count ?? 0;
			const h3 = u.content_metrics?.h3_count ?? 0;
			// Skip detected: has H3 but no H2 — i.e. jumped past H2.
			if (h3 > 0 && h2 === 0) {
				affected.push(toAffected(u, `0 H2 / ${h3} H3`));
			}
		}
		if (affected.length === 0) return null;
		return {
			ruleId: "heading-hierarchy-skip",
			category: "content-structure",
			title: "דילוג בהיררכיית הכותרות (יש H3 ללא H2)",
			description:
				"הדף קופץ מהכותרת הראשית ישר ל-H3, מדלג על H2. קוראי מסך נשענים על ההיררכיה כדי לנווט בתוכן, ומנועי חיפוש משתמשים בה להבנת המבנה הנושאי של העמוד.",
			severity: "low",
			count: affected.length,
			affectedUrls: affected,
			fixHint: "להעלות את ה-H3 הפותחים ל-H2, או להוסיף H2 מתאים מעל לבלוק של ה-H3.",
		};
	},
};
