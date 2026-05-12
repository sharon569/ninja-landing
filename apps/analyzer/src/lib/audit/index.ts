// Audit rules registry + runner. Add a new rule by importing its file
// and pushing it into RULES — that's it; the runner picks it up.

import type { Rule, Finding, AuditCategory } from "@/lib/audit/types";
import { CATEGORY_ORDER } from "@/lib/audit/types";
import type { ScanResponse } from "@/lib/plugin-client";

import { missingYoastTitle } from "@/lib/audit/rules/missing-yoast-title";
import { missingYoastDescription } from "@/lib/audit/rules/missing-yoast-description";
import { missingFocusKeyword } from "@/lib/audit/rules/missing-focus-keyword";
import { titleTooLong, titleTooShort } from "@/lib/audit/rules/title-length";
import { descTooLong, descTooShort } from "@/lib/audit/rules/description-length";
import { missingH1, multipleH1, headingHierarchySkip } from "@/lib/audit/rules/h1-issues";
import { thinContent } from "@/lib/audit/rules/thin-content";
import { orphanPage, noInternalLinksOut } from "@/lib/audit/rules/linking-issues";
import {
	filenameAltText,
	featuredImageMissingAlt,
	bodyImagesMissingAlt,
} from "@/lib/audit/rules/image-issues";
import { cannibalFocusKeyword, duplicateTitleWithinSite } from "@/lib/audit/rules/cannibalization";
import {
	noindexOnContent,
	canonicalExternal,
	canonicalMismatch,
} from "@/lib/audit/rules/indexation";
import { missingSchemaType, productMissingSchema } from "@/lib/audit/rules/schema";

export const RULES: Rule[] = [
	// indexation
	noindexOnContent,
	canonicalExternal,
	canonicalMismatch,
	// on-page meta
	missingYoastTitle,
	missingYoastDescription,
	missingFocusKeyword,
	titleTooLong,
	titleTooShort,
	descTooLong,
	descTooShort,
	// content structure
	missingH1,
	multipleH1,
	headingHierarchySkip,
	// content quality
	thinContent,
	// internal linking
	orphanPage,
	noInternalLinksOut,
	// images
	filenameAltText,
	featuredImageMissingAlt,
	bodyImagesMissingAlt,
	// schema
	missingSchemaType,
	productMissingSchema,
	// cannibalization
	cannibalFocusKeyword,
	duplicateTitleWithinSite,
];

const SEVERITY_ORDER: Record<string, number> = {
	high: 0,
	medium: 1,
	low: 2,
	info: 3,
};

export function runAudit(scan: ScanResponse): Finding[] {
	const findings: Finding[] = [];
	for (const rule of RULES) {
		try {
			const f = rule.run(scan);
			if (f) findings.push(f);
		} catch (err) {
			console.error(`[audit] rule "${rule.id}" threw:`, err);
		}
	}
	findings.sort((a, b) => {
		// Primary: category order (so the report reads as a coherent walkthrough)
		const c = CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category);
		if (c !== 0) return c;
		// Secondary: severity
		const s = (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9);
		if (s !== 0) return s;
		// Tertiary: impact (count desc)
		return b.count - a.count;
	});
	return findings;
}

/** Group a flat findings list by category, preserving CATEGORY_ORDER. */
export function groupByCategory(findings: Finding[]): Array<{
	category: AuditCategory;
	findings: Finding[];
	totalAffected: number;
}> {
	const buckets = new Map<AuditCategory, Finding[]>();
	for (const f of findings) {
		const list = buckets.get(f.category) ?? [];
		list.push(f);
		buckets.set(f.category, list);
	}
	const out: Array<{ category: AuditCategory; findings: Finding[]; totalAffected: number }> = [];
	for (const cat of CATEGORY_ORDER) {
		const list = buckets.get(cat);
		if (!list || list.length === 0) continue;
		out.push({
			category: cat,
			findings: list,
			totalAffected: list.reduce((s, f) => s + f.count, 0),
		});
	}
	return out;
}

export type { Finding, Rule } from "@/lib/audit/types";
