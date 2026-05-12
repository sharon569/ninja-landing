// Phase 15C.2 — sanity test for the page-scope classifier. No DB, no env.

import { classifyPage } from "../src/lib/page-scope";

interface Case {
	url: string;
	expected: boolean;
	expectedScope?: string;
	note?: string;
	client?: Parameters<typeof classifyPage>[1];
}

const baseClient = {
	targetPages: [] as string[],
	seoIgnoredUrls: [] as string[],
	seoIgnoredPatterns: [] as string[],
	seoForcedTargetUrls: [] as string[],
};

const withTargetPages = (pages: string[]) => ({ ...baseClient, targetPages: pages });
const withForced = (urls: string[]) => ({ ...baseClient, seoForcedTargetUrls: urls });
const withIgnored = (urls: string[]) => ({ ...baseClient, seoIgnoredUrls: urls });
const withIgnoredPatterns = (patterns: string[]) => ({ ...baseClient, seoIgnoredPatterns: patterns });

const cases: Case[] = [
	// Utility
	{ url: "https://www.levizonmarket.co.il/checkout", expected: false, expectedScope: "utility" },
	{ url: "https://www.levizonmarket.co.il/cart", expected: false, expectedScope: "utility" },
	{ url: "https://www.levizonmarket.co.il/my-account", expected: false, expectedScope: "utility" },
	{ url: "https://www.levizonmarket.co.il/cart/", expected: false, expectedScope: "utility", note: "trailing slash" },
	{ url: "https://www.levizonmarket.co.il/wp-admin", expected: false, expectedScope: "utility", note: "matches /admin in utility list before /wp-admin in system list — either is fine, both block" },

	// Legal
	{ url: "https://www.levizonmarket.co.il/privacy-policy", expected: false, expectedScope: "legal" },
	{ url: "https://www.levizonmarket.co.il/terms", expected: false, expectedScope: "legal" },

	// Trust
	{ url: "https://www.levizonmarket.co.il/accessibility-statement", expected: false, expectedScope: "trust" },

	// Business info — default not eligible
	{ url: "https://www.levizonmarket.co.il/contact", expected: false, expectedScope: "business_info" },
	{ url: "https://www.levizonmarket.co.il/about", expected: false, expectedScope: "business_info" },

	// Business info — eligible when in targetPages
	{
		url: "https://www.levizonmarket.co.il/contact",
		expected: true,
		expectedScope: "seo_target",
		client: withTargetPages(["https://www.levizonmarket.co.il/contact"]),
		note: "/contact is forced via targetPages",
	},

	// Shop archive bare
	{ url: "https://www.levizonmarket.co.il/shop", expected: false, expectedScope: "utility", note: "bare shop archive" },
	{ url: "https://www.levizonmarket.co.il/shop/", expected: false, expectedScope: "utility", note: "bare shop archive with slash" },

	// Real category — must stay in
	{ url: "https://www.levizonmarket.co.il/dustbins/brabantia", expected: true, expectedScope: "seo_target" },
	{ url: "https://www.levizonmarket.co.il/bathroom-and-toilet-products/bath-accessories", expected: true, expectedScope: "seo_target" },
	{ url: "https://www.levizonmarket.co.il/coffee-machines", expected: true, expectedScope: "seo_target" },

	// Forced target override — pushes ignored URL back to seo_target
	{
		url: "https://www.levizonmarket.co.il/checkout",
		expected: true,
		expectedScope: "seo_target",
		client: withForced(["https://www.levizonmarket.co.il/checkout"]),
		note: "forced override beats default utility",
	},

	// Ignored URL override — pushes seo_target to ineligible
	{
		url: "https://www.levizonmarket.co.il/dustbins/brabantia",
		expected: false,
		client: withIgnored(["https://www.levizonmarket.co.il/dustbins/brabantia"]),
		note: "explicit ignore beats default eligible",
	},

	// Ignored pattern
	{
		url: "https://www.levizonmarket.co.il/coupon/blackfriday",
		expected: false,
		client: withIgnoredPatterns(["/coupon"]),
		note: "/coupon pattern blocks /coupon/anything",
	},
	{
		url: "https://www.levizonmarket.co.il/coffee-machines",
		expected: true,
		client: withIgnoredPatterns(["/coupon"]),
		note: "unrelated pattern doesn't block category",
	},

	// URL normalization edge cases
	{ url: " https://www.levizonmarket.co.il/checkout ", expected: false, expectedScope: "utility", note: "whitespace stripped" },
	{ url: "https://www.levizonmarket.co.il/checkout?utm_source=fb", expected: false, expectedScope: "utility", note: "query stripped" },
];

let passed = 0;
let failed = 0;
for (const c of cases) {
	const cls = classifyPage(c.url, c.client ?? baseClient);
	const ok = cls.isSeoEligible === c.expected && (!c.expectedScope || cls.scope === c.expectedScope);
	if (ok) {
		passed++;
		console.log(`✓ ${c.url.padEnd(70)} → ${cls.scope} eligible=${cls.isSeoEligible}`);
	} else {
		failed++;
		console.log(
			`✗ ${c.url.padEnd(70)} → ${cls.scope} eligible=${cls.isSeoEligible} | expected eligible=${c.expected} scope=${c.expectedScope ?? "any"} | ${c.note ?? ""}`,
		);
	}
}

console.log(`\n${passed}/${passed + failed} passed`);
process.exit(failed === 0 ? 0 : 1);
