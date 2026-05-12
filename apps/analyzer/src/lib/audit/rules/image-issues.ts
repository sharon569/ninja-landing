import type { Rule } from "@/lib/audit/types";
import { iterateUrls, toAffected, PUBLIC_CONTENT_TYPES } from "@/lib/audit/types";

/**
 * Filename-style alt text (e.g. "IMG_20230501_140832", "7290014828995_28042020143941_large")
 * is worthless for image search and accessibility — it's just the raw upload name.
 * Heuristic: alt text matches common camera/EAN-style patterns or has no spaces and
 * lots of digits.
 */
function looksLikeFilename(alt: string): boolean {
	if (!alt) return false;
	const a = alt.trim();
	// All-digit barcodes
	if (/^\d{8,}/.test(a)) return true;
	// IMG_/DSC_ camera prefixes
	if (/^(IMG|DSC|MVIMG|VID|Screenshot)[_\- ]/i.test(a)) return true;
	// "1234567890_28042020143941_large" — digits + underscores + size suffix
	if (/^[\d_-]+(?:_(?:large|small|medium|thumbnail|scaled))?$/i.test(a)) return true;
	// No spaces, more than half digits, longer than 12 chars — looks generated
	if (a.length > 12 && !a.includes(" ")) {
		const digits = (a.match(/\d/g) ?? []).length;
		if (digits / a.length > 0.4) return true;
	}
	return false;
}

export const filenameAltText: Rule = {
	id: "filename-alt-text",
	category: "images",
	defaultSeverity: "medium",
	run: (scan) => {
		const affected = [];
		for (const u of iterateUrls(scan)) {
			if (!PUBLIC_CONTENT_TYPES.has(u.post_type)) continue;
			if (u.post_status !== "publish") continue;
			const alt = u.featured_image?.alt ?? "";
			if (!alt) continue;  // separate rule
			if (!looksLikeFilename(alt)) continue;
			affected.push(toAffected(u, `alt: "${alt.slice(0, 80)}"`));
		}
		if (affected.length === 0) return null;
		return {
			ruleId: "filename-alt-text",
			category: "images",
			title: "תמונות ראשיות עם טקסט חלופי שנראה כשם קובץ",
			description:
				"טקסט חלופי שמתאים לשם הקובץ המקורי (למשל '7290014828995_28042020143941_large') לא נותן ערך לקוראי מסך ולא נותן אות דירוג ל-Google Images. בקנה מידה גדול זו הזדמנות מבוזבזת.",
			severity: "medium",
			count: affected.length,
			affectedUrls: affected,
			fixHint:
				"לייצר טקסט חלופי משם הפוסט או המוצר בזמן ההעלאה. עבור ספריות קיימות, סקריפט חד-פעמי שמגדיר alt לפי post_title לכל הקבצים החסרים או בעלי alt בתבנית שם קובץ הוא התיקון המהיר ביותר.",
		};
	},
};

export const featuredImageMissingAlt: Rule = {
	id: "featured-image-missing-alt",
	category: "images",
	defaultSeverity: "medium",
	run: (scan) => {
		const affected = [];
		for (const u of iterateUrls(scan)) {
			if (!PUBLIC_CONTENT_TYPES.has(u.post_type)) continue;
			if (u.post_status !== "publish") continue;
			if (!u.featured_image) continue;
			const alt = u.featured_image.alt ?? "";
			if (alt.trim()) continue;
			affected.push(toAffected(u, "featured image has no alt"));
		}
		if (affected.length === 0) return null;
		return {
			ruleId: "featured-image-missing-alt",
			category: "images",
			title: "תמונות ראשיות ללא טקסט חלופי",
			description:
				"התמונה הראשית היא בדרך כלל התמונה הבולטת ביותר בעמוד, וגם תמונת ה-OG בשיתופים ברשתות. ללא alt אין נגישות, אין חשיפה ב-Google Images, ואין fallback אם התמונה לא נטענת.",
			severity: "medium",
			count: affected.length,
			affectedUrls: affected,
			fixHint: "לערוך כל מדיה בספריית המדיה ולהגדיר Alt Text. או למלא בעדכון מסד נתונים פשוט שמגדיר alt לפי post_title.",
		};
	},
};

export const bodyImagesMissingAlt: Rule = {
	id: "body-images-missing-alt",
	category: "images",
	defaultSeverity: "low",
	run: (scan) => {
		const affected = [];
		for (const u of iterateUrls(scan)) {
			if (!PUBLIC_CONTENT_TYPES.has(u.post_type)) continue;
			if (u.post_status !== "publish") continue;
			const missing = u.content_metrics?.images_missing_alt_count ?? 0;
			if (missing === 0) continue;
			const total = u.content_metrics?.image_count ?? 0;
			affected.push(toAffected(u, `${missing} of ${total} images missing alt`));
		}
		if (affected.length === 0) return null;
		return {
			ruleId: "body-images-missing-alt",
			category: "images",
			title: "תמונות בגוף התוכן ללא טקסט חלופי",
			description:
				"תמונות שהוטמעו בגוף הפוסט ללא טקסט חלופי. פוגע בנגישות ומוציא את התמונות מ-Google Images.",
			severity: "low",
			count: affected.length,
			affectedUrls: affected,
			fixHint: "לערוך כל פוסט ולהוסיף טקסט חלופי לכל התמונות הפנימיות, או להחליף אותן דרך ספריית המדיה שבה ה-alt מוגדר מרכזית.",
		};
	},
};
