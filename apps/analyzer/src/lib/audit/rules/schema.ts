import type { Rule } from "@/lib/audit/types";
import { iterateUrls, toAffected, PUBLIC_CONTENT_TYPES } from "@/lib/audit/types";

export const missingSchemaType: Rule = {
	id: "missing-schema-type",
	category: "schema",
	defaultSeverity: "medium",
	run: (scan) => {
		const affected = [];
		for (const u of iterateUrls(scan)) {
			if (!PUBLIC_CONTENT_TYPES.has(u.post_type)) continue;
			if (u.post_status !== "publish") continue;
			const page = u.yoast?.indexable?.schema_page_type?.toString().trim();
			const article = u.yoast?.indexable?.schema_article_type?.toString().trim();
			if (page || article) continue;
			affected.push(toAffected(u, "no Yoast schema type set"));
		}
		if (affected.length === 0) return null;
		return {
			ruleId: "missing-schema-type",
			category: "schema",
			title: "דפים ללא סוג סכמה מוגדר ב-Yoast",
			description:
				"Yoast משדר נתונים מובנים ב-JSON-LD אוטומטית, אבל רק עם סוג מוצהר. דפים ללא סוג סכמה מוגדר לא מופיעים כתוצאות עשירות במנועי החיפוש (כמו מתכונים, מאמרים או מוצרים).",
			severity: "medium",
			count: affected.length,
			affectedUrls: affected,
			fixHint:
				"ב-Yoast Search Appearance להגדיר ברירות מחדל לכל סוג פוסט. Page לכתובת WebPage, Post לכתובת Article, Product מטופל אוטומטית על ידי WooCommerce. לעקוף ברמת הדף רק במקרים מיוחדים.",
		};
	},
};

export const productMissingSchema: Rule = {
	id: "product-missing-schema",
	category: "schema",
	defaultSeverity: "high",
	run: (scan) => {
		const affected = [];
		for (const u of iterateUrls(scan)) {
			if (u.post_type !== "product") continue;
			if (u.post_status !== "publish") continue;
			const page = (u.yoast?.indexable?.schema_page_type ?? "").toString().toLowerCase();
			const article = (u.yoast?.indexable?.schema_article_type ?? "").toString().toLowerCase();
			// Product schema usually comes from WooCommerce itself, not Yoast page_type.
			// If neither page_type nor article_type mentions product, AND the product
			// has no description (proxy for "thin product schema"), flag.
			const hasProductTypeHint = page.includes("product") || article.includes("product");
			if (hasProductTypeHint) continue;
			// We don't have rendered JSON-LD captured yet — so this is a soft check.
			// Skip products with rich data (description, gallery, sku) since WC likely emits Product schema.
			const hasSku = !!u.product?.sku?.trim();
			const hasShortDesc = !!u.product?.short_description?.trim();
			const wordCount = u.content_metrics?.word_count ?? 0;
			if (hasSku && hasShortDesc && wordCount > 30) continue;  // likely fine
			affected.push(toAffected(u, [
				hasSku ? null : "no SKU",
				hasShortDesc ? null : "no short description",
				wordCount <= 30 ? `${wordCount} words` : null,
			].filter(Boolean).join(", ")));
		}
		if (affected.length === 0) return null;
		return {
			ruleId: "product-missing-schema",
			category: "schema",
			title: "מוצרים עם סכמת Product חלקית",
			description:
				"WooCommerce ו-Yoast משדרים סכמת Product אוטומטית רק כשיש דאטה למלא אותה (SKU, תיאור, מחיר). מוצרים שחסרים את השדות האלה משדרים סכמה לא שלמה, בלי כוכבי דירוג ובלי מחיר בתוצאות החיפוש.",
			severity: "high",
			count: affected.length,
			affectedUrls: affected,
			fixHint:
				"בכל מוצר להגדיר SKU, למלא תיאור קצר, ולוודא מחיר וסטטוס מלאי. אחר כך להריץ Rich Results Test על URL לדוגמה כדי לוודא ש-Google רואה את הסכמה המלאה.",
		};
	},
};
