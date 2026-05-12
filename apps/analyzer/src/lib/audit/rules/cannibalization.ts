import type { Rule, AffectedUrl } from "@/lib/audit/types";
import { iterateUrls, toAffected, PUBLIC_CONTENT_TYPES } from "@/lib/audit/types";

/**
 * Two or more URLs targeting the same focus keyword. Even with great content,
 * Google has to pick one — and often picks the wrong one. The pages end up
 * competing instead of consolidating authority.
 */
export const cannibalFocusKeyword: Rule = {
	id: "cannibal-focus-keyword",
	category: "cannibalization",
	defaultSeverity: "high",
	run: (scan) => {
		const groups = new Map<string, (AffectedUrl & { fk: string })[]>();
		for (const u of iterateUrls(scan)) {
			if (!PUBLIC_CONTENT_TYPES.has(u.post_type)) continue;
			if (u.post_status !== "publish") continue;
			const fk = (u.yoast?.focus_keyword ?? u.yoast?.indexable?.primary_focus_keyword ?? "")
				.toString()
				.trim()
				.toLowerCase();
			if (!fk) continue;
			const a = { ...toAffected(u, `focus: "${fk}"`), fk };
			const list = groups.get(fk) ?? [];
			list.push(a);
			groups.set(fk, list);
		}
		const affected: AffectedUrl[] = [];
		for (const [, urls] of groups) {
			if (urls.length < 2) continue;
			for (const u of urls) affected.push(u);
		}
		if (affected.length === 0) return null;
		return {
			ruleId: "cannibal-focus-keyword",
			category: "cannibalization",
			title: "קניבליזציה של מילת מפתח (אותה מילת מפתח בכמה דפים)",
			description:
				"שני דפים או יותר ממקדים את אותה מילת מפתח. Google בוחר אחד מהם בתור הקנוני לאותה שאילתא, ומדלל את אקוויטי הקישורים על השאר. הדפים מתחרים זה בזה במקום לחזק זה את זה.",
			severity: "high",
			count: affected.length,
			affectedUrls: affected,
			fixHint:
				"בכל קבוצה לבחור את הדף הקנוני, ולעשות 301 לשאר אליו. או, להבדיל בין הדפים דרך מילות מפתח ארוכות זנב יחודיות לכל אחד, למשל 'נעלי ריצה לגברים', 'נעלי ריצה לנשים', 'נעלי ריצת שטח'.",
		};
	},
};

/**
 * Two or more URLs (on the same blog) sharing the same SEO title. Like
 * cannibalization but more visible — Google sometimes deduplicates these in
 * SERPs, hiding one entirely.
 */
function normalize(s: string): string {
	return s.trim().toLowerCase().replace(/\s+/g, " ");
}

export const duplicateTitleWithinSite: Rule = {
	id: "duplicate-title-within-site",
	category: "cannibalization",
	defaultSeverity: "high",
	run: (scan) => {
		// Group by (blog_id, normalized title). Same title on different blogs
		// is already covered by the cross-network master report.
		const groups = new Map<string, AffectedUrl[]>();
		for (const u of iterateUrls(scan)) {
			if (!PUBLIC_CONTENT_TYPES.has(u.post_type)) continue;
			if (u.post_status !== "publish") continue;
			const t =
				u.yoast?.title?.trim() ||
				u.yoast?.indexable?.title?.toString().trim() ||
				u.title;
			const key = `${u.blog_id}::${normalize(t || "")}`;
			if (!t) continue;
			const a = toAffected(u, t);
			const list = groups.get(key) ?? [];
			list.push(a);
			groups.set(key, list);
		}
		const affected: AffectedUrl[] = [];
		for (const [, urls] of groups) {
			if (urls.length < 2) continue;
			for (const u of urls) affected.push(u);
		}
		if (affected.length === 0) return null;
		return {
			ruleId: "duplicate-title-within-site",
			category: "cannibalization",
			title: "כותרות SEO זהות באותו אתר",
			description:
				"כמה דפים חולקים את אותה כותרת SEO. Google עשוי לאחד אותם בתוצאות החיפוש ולהציג רק אחד, והכותרות הכפולות מפצלות את הרלוונטיות הנושאית בין הדפים.",
			severity: "high",
			count: affected.length,
			affectedUrls: affected,
			fixHint:
				"להבדיל כל כותרת לפי מה שייחודי בדף. במוצרים זה ואריאנט, מותג או מידה. בפוסטים זה הזווית או תת-נושא ספציפי.",
		};
	},
};
