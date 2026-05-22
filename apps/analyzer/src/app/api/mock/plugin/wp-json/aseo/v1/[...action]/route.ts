// Mock WordPress plugin — mimics agency-seo-scanner REST API.
// Test client baseUrl points to /api/mock/plugin, so the plugin client
// calls /api/mock/plugin/wp-json/aseo/v1/{info,scan,sites}.
//
// Returns realistic fake data so the full pipeline can run end-to-end:
// scan → audit → opportunities → strategies → work plan.

import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const MOCK_DOMAIN = "test.dev.ninja.local";
const MOCK_URL = `https://${MOCK_DOMAIN}`;

export async function GET(
	req: NextRequest,
	{ params }: { params: Promise<{ action: string[] }> },
) {
	const { action } = await params;
	const route = action.join("/");

	switch (route) {
		case "info":
			return NextResponse.json({
				plugin: "agency-seo-scanner",
				plugin_version: "0.3.5",
				wp_version: "6.7.1",
				php_version: "8.2.0",
				multisite: false,
				main_site_url: MOCK_URL,
				sites_count: 1,
				yoast_active: true,
				yoast_version: "24.1",
				woocommerce_active: false,
				woocommerce_version: null,
				server_time: new Date().toISOString(),
			});

		case "sites":
			return NextResponse.json([{
				blog_id: 1,
				path: "/",
				home_url: MOCK_URL,
				name: "TestShop",
				public: 1,
				archived: 0,
				spam: 0,
			}]);

		case "scan":
			return NextResponse.json(buildScanResponse());

		default:
			return NextResponse.json({ error: `unknown route: ${route}` }, { status: 404 });
	}
}

export async function POST(
	req: NextRequest,
	ctx: { params: Promise<{ action: string[] }> },
) {
	return GET(req, ctx);
}

// ─── Scan Response Builder ────────────────────────────────────

function buildScanResponse() {
	const pages = [
		page("/", "דף הבית — TestShop", "חנות נעליים מובילה בישראל", "נעלי ריצה", "page", 850),
		page("/shoes", "נעלי ריצה", "מבחר נעלי ריצה מקצועיות", "נעלי ריצה", "page", 620),
		page("/women", "נעלי ספורט לנשים", "", "נעלי ספורט לנשים", "page", 480), // missing meta desc
		page("/nike", "סניקרס נייק", "נעלי נייק במחירים מיוחדים", "סניקרס נייק", "page", 550),
		page("/sale", "מבצעים", "", "", "page", 180), // missing desc + focus keyword + thin content
		page("/walking", "נעלי הליכה", "נעלי הליכה מומלצות לטיולים", "נעלי הליכה", "page", 720),
		page("/kids", "נעלי ילדים", "נעלי ילדים איכותיות", "נעלי ילדים", "page", 390),
		page("/work-shoes", "נעלי עבודה", "נעלי עבודה בטיחותיות", "נעלי עבודה", "page", 510),
		page("/blog/running-tips", "טיפים לריצה", "מדריך למתחילים בריצה", "", "post", 1200), // missing focus kw + no internal links out
		page("/blog/shoe-guide", "מדריך בחירת נעליים", "איך לבחור נעליים", "בחירת נעליים", "post", 950),
		page("/about", "אודות TestShop", "הסיפור שלנו", "", "page", 200), // thin-ish
		page("/contact", "צור קשר", "דברו איתנו", "", "page", 100), // thin + no schema
		page("/cart", "עגלת קניות", "", "", "page", 50),
		page("/checkout", "תשלום", "", "", "page", 30),
		page("/privacy", "מדיניות פרטיות", "", "", "page", 400),
	];

	return {
		manifest: {
			plugin: "agency-seo-scanner",
			plugin_version: "0.3.5",
			network: { multisite: false, sites_count: 1 },
			sites: [{ blog_id: 1, path: "/", home_url: MOCK_URL, name: "TestShop" }],
			counts: { urls_total: pages.length, posts: 2, pages: 13, products: 0, other: 0 },
			warnings: [],
		},
		sites: {
			"1": {
				blog_id: 1,
				collected_at: new Date().toISOString(),
				site: { blog_id: 1, home_url: MOCK_URL, name: "TestShop" },
				robots_txt: `User-agent: *\nAllow: /\nSitemap: ${MOCK_URL}/sitemap.xml`,
				sitemap: `${MOCK_URL}/sitemap.xml`,
				urls: pages,
				taxonomies: [],
				menus: [],
				counts: { urls_total: pages.length, posts: 2, pages: 13, products: 0, other: 0 },
			},
		},
		master: {
			duplicate_titles: [],
			duplicate_content: [],
			sku_overlap: [],
			slug_collisions: [],
		},
	};
}

function page(
	path: string,
	title: string,
	description: string,
	focusKeyword: string,
	postType: string,
	wordCount: number,
) {
	const url = `${MOCK_URL}${path}`;
	const hasH1 = path !== "/sale";
	const hasInternalLinksOut = path !== "/blog/running-tips";

	return {
		post_id: Math.abs(hashCode(path)),
		post_type: postType,
		post_status: "publish",
		post_parent: 0,
		url,
		slug: path.replace(/^\//, "") || "home",
		title,
		excerpt: description.slice(0, 100),
		published: "2026-01-15T10:00:00",
		modified: "2026-05-18T14:30:00",
		author: "admin",
		comment_count: 0,
		content_metrics: {
			word_count: wordCount,
			char_count: wordCount * 5,
			h1_count: hasH1 ? 1 : 0,
			h2_count: Math.max(1, Math.floor(wordCount / 200)),
			h3_count: Math.floor(wordCount / 400),
			image_count: Math.max(1, Math.floor(wordCount / 150)),
			internal_links: hasInternalLinksOut ? Math.floor(Math.random() * 4) + 1 : 0,
			external_links: Math.floor(Math.random() * 2),
		},
		featured_image: wordCount > 200 ? {
			url: `${MOCK_URL}/wp-content/uploads${path.replace(/\//g, "-") || "home"}.jpg`,
			alt: path === "/nike" ? "IMG_20260101.jpg" : `${title}`,
			width: 1200,
			height: 628,
		} : null,
		yoast: {
			title: title ? `${title} | TestShop` : null,
			description: description || null,
			canonical: url,
			primary_focus_keyword: focusKeyword || null,
			primary_focus_keyword_score: focusKeyword ? 55 : null,
			readability_score: Math.floor(Math.random() * 30) + 50,
			is_cornerstone: path === "/" || path === "/shoes",
			robots: {
				index: !["/cart", "/checkout"].includes(path) ? "index" : "noindex",
				follow: "follow",
			},
			og_title: title,
			og_description: description,
			schema_page_type: path === "/contact" ? null : "WebPage",
		},
		product: null,
	};
}

function hashCode(s: string): number {
	let h = 0;
	for (let i = 0; i < s.length; i++) {
		h = ((h << 5) - h + s.charCodeAt(i)) | 0;
	}
	return h;
}
