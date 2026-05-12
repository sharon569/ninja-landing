// Typed REST client for `agency-seo-scanner` plugin installed on a client's WP site.
// Plugin source: ../seo-scanner/. Plugin API surface: GET /wp-json/aseo/v1/{info,sites,scan,scan/<id>}.
// All routes are token-gated; we send the token in the X-ASEO-Token header.

import { z } from "zod";

// -----------------------------------------------------------------------------
// Response schemas (Zod for the two routes we hit on every connect attempt;
// the heavy /scan payload uses TypeScript types only — Zod-validating thousands
// of inner URL entries on every scan would slow us down with little benefit).
// -----------------------------------------------------------------------------

export const InfoResponseSchema = z.object({
	plugin: z.string(),
	plugin_version: z.string(),
	wp_version: z.string(),
	php_version: z.string(),
	multisite: z.boolean(),
	main_site_url: z.string(),
	sites_count: z.number(),
	yoast_active: z.boolean(),
	yoast_version: z.string().nullable(),
	woocommerce_active: z.boolean(),
	woocommerce_version: z.string().nullable(),
	server_time: z.string(),
});
export type InfoResponse = z.infer<typeof InfoResponseSchema>;

export const SiteSummarySchema = z.object({
	blog_id: z.number(),
	path: z.string(),
	home_url: z.string(),
	name: z.string(),
	public: z.number(),
	archived: z.number(),
	spam: z.number(),
});
export const SitesResponseSchema = z.array(SiteSummarySchema);
export type SiteSummary = z.infer<typeof SiteSummarySchema>;

// -----------------------------------------------------------------------------
// Scan payload types — kept as TypeScript interfaces, not Zod-validated,
// for performance on multi-MB responses. Optional everywhere because the
// plugin's field set may grow between versions.
// -----------------------------------------------------------------------------

export interface YoastIndexable {
	permalink?: string | null;
	permalink_hash?: string | null;
	object_sub_type?: string | null;
	title?: string | null;
	description?: string | null;
	breadcrumb_title?: string | null;
	is_public?: number | boolean | null;
	is_protected?: number | boolean | null;
	has_public_posts?: number | boolean | null;
	canonical?: string | null;
	primary_focus_keyword?: string | null;
	primary_focus_keyword_score?: number | null;
	readability_score?: number | null;
	is_cornerstone?: number | boolean | null;
	is_robots_noindex?: number | boolean | null;
	is_robots_nofollow?: number | boolean | null;
	is_robots_noarchive?: number | boolean | null;
	is_robots_noimageindex?: number | boolean | null;
	is_robots_nosnippet?: number | boolean | null;
	open_graph_title?: string | null;
	open_graph_description?: string | null;
	open_graph_image?: string | null;
	twitter_title?: string | null;
	twitter_description?: string | null;
	twitter_image?: string | null;
	link_count?: number | null;
	incoming_link_count?: number | null;
	language?: string | null;
	region?: string | null;
	schema_page_type?: string | null;
	schema_article_type?: string | null;
	has_ancestors?: number | boolean | null;
	estimated_reading_time_minutes?: number | null;
	inclusive_language_score?: number | null;
	object_published_at?: string | null;
	object_last_modified?: string | null;
}

export interface YoastPostMeta {
	title?: string;
	description?: string;
	canonical?: string;
	focus_keyword?: string;
	meta_robots_noindex?: string;
	meta_robots_nofollow?: string;
	og_title?: string;
	og_description?: string;
	og_image?: string;
	twitter_title?: string;
	twitter_description?: string;
	twitter_image?: string;
	breadcrumb_title?: string;
	primary_category?: string;
	schema_page_type?: string;
	schema_article_type?: string;
	estimated_reading_time?: string;
	indexable?: YoastIndexable | null;
}

export interface ContentMetrics {
	word_count: number;
	char_count: number;
	h1_count: number;
	h1_first: string | null;
	h1_all: string[];
	h2_count: number;
	h2_first_five: string[];
	h3_count: number;
	image_count: number;
	images_missing_alt_count: number;
	images_missing_alt_sample: string[];
	internal_links: number;
	external_links: number;
}

export interface ProductData {
	sku: string;
	type: string;
	price: string;
	regular_price: string;
	sale_price: string;
	on_sale: boolean;
	stock_status: string;
	stock_quantity: number | null;
	manage_stock: boolean;
	catalog_visibility: string;
	categories: string[];
	tags: string[];
	short_description: string;
	reviews_count: number;
	average_rating: string;
	gallery_count: number;
}

export interface UrlEntry {
	post_id: number;
	post_type: string;
	post_status: string;
	post_parent: number;
	url: string;
	slug: string;
	title: string;
	excerpt: string;
	published: string;
	modified: string;
	author: { id: number; login: string; display_name: string } | null;
	comment_count: number;
	content_metrics: ContentMetrics;
	content_excerpt_hash: string | null;
	featured_image: { id: number; url: string; alt: string } | null;
	yoast: YoastPostMeta;
	product?: ProductData;
}

export interface BlogPayload {
	blog_id: number;
	collected_at: string;
	site: Record<string, unknown>;
	robots_txt: Record<string, unknown>;
	sitemap: Record<string, unknown>;
	urls: UrlEntry[];
	taxonomies: Record<string, unknown>;
	menus: Record<string, unknown>;
	counts: {
		urls_total: number;
		posts: number;
		pages: number;
		products: number;
		other: number;
	};
}

export interface ScanResponse {
	manifest: {
		plugin: string;
		plugin_version: string;
		scanned_at: string;
		network: {
			multisite: boolean;
			main_site_url: string;
			domain: string;
			sites_count: number;
		};
		environment: {
			wp_version: string;
			php_version: string;
			yoast_active: boolean;
			yoast_version: string | null;
			woocommerce_active: boolean;
			woocommerce_version: string | null;
		};
		sites: Array<{
			blog_id: number;
			path: string;
			home_url: string;
			name: string;
			public: number;
			archived: number;
			urls_scanned: number;
			posts: number;
			pages: number;
			products: number;
		}>;
		counts: Record<string, unknown>;
		warnings: string[];
	};
	sites: Record<string, BlogPayload>;
	master: {
		generated_at: string;
		sites: unknown[];
		totals: { urls_in_pool: number; sites_scanned: number };
		duplicate_titles: Record<string, DuplicateCluster>;
		duplicate_content: Record<string, DuplicateCluster>;
		sku_overlap: Record<string, DuplicateCluster>;
		slug_collisions: Record<string, DuplicateCluster>;
	};
}

export interface DuplicateCluster {
	blogs_affected: number;
	occurrences: number;
	urls: Array<{
		blog_id: number;
		post_id: number;
		url: string;
		post_type: string;
		title_hash: string | null;
		content_hash: string | null;
		slug: string;
		sku: string | null;
	}>;
}

// -----------------------------------------------------------------------------
// Client
// -----------------------------------------------------------------------------

export class PluginClientError extends Error {
	constructor(message: string, public status: number, public body?: unknown) {
		super(message);
		this.name = "PluginClientError";
	}
}

export interface PluginClientOptions {
	baseUrl: string;  // e.g. "https://www.levizonmarket.co.il/wp-json/aseo/v1"
	token: string;
	timeoutMs?: number;  // defaults below — long for /scan because plugin can take minutes
}

export class PluginClient {
	private baseUrl: string;
	private token: string;
	private defaultTimeoutMs: number;

	constructor(opts: PluginClientOptions) {
		// Normalize: strip trailing slash; ensure /wp-json/aseo/v1 suffix is present.
		let base = opts.baseUrl.replace(/\/+$/, "");
		if (!base.endsWith("/wp-json/aseo/v1")) {
			if (base.endsWith("/wp-json/aseo")) base = base + "/v1";
			else if (!base.includes("/wp-json/")) base = base + "/wp-json/aseo/v1";
		}
		this.baseUrl = base;
		this.token = opts.token;
		this.defaultTimeoutMs = opts.timeoutMs ?? 600_000;  // 10 min — /scan can be slow
	}

	async info(): Promise<InfoResponse> {
		const data = await this.fetchJson("/info", 30_000);
		return InfoResponseSchema.parse(data);
	}

	async sites(): Promise<SiteSummary[]> {
		const data = await this.fetchJson("/sites", 30_000);
		return SitesResponseSchema.parse(data);
	}

	/** Full network scan. Can be megabytes of JSON; caller should stream-save to disk. */
	async scan(): Promise<ScanResponse> {
		return (await this.fetchJson("/scan", this.defaultTimeoutMs)) as ScanResponse;
	}

	async scanBlog(blogId: number): Promise<BlogPayload> {
		return (await this.fetchJson(`/scan/${blogId}`, this.defaultTimeoutMs)) as BlogPayload;
	}

	private async fetchJson(path: string, timeoutMs: number): Promise<unknown> {
		const url = `${this.baseUrl}${path}`;
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), timeoutMs);
		let res: Response;
		try {
			res = await fetch(url, {
				headers: {
					"X-ASEO-Token": this.token,
					Accept: "application/json",
				},
				signal: controller.signal,
				// Plugin responses are not cacheable — they're either a live ping or a
				// fresh scan. Prevent Next.js fetch caching layers from holding them.
				cache: "no-store",
			});
		} catch (err) {
			clearTimeout(timer);
			if ((err as Error).name === "AbortError") {
				throw new PluginClientError(`Request timed out after ${timeoutMs}ms`, 0);
			}
			throw new PluginClientError(`Network error: ${(err as Error).message}`, 0);
		}
		clearTimeout(timer);

		const contentType = res.headers.get("content-type") ?? "";
		const isJson = contentType.includes("application/json");
		const body = isJson ? await res.json() : await res.text();

		if (!res.ok) {
			// WP REST errors look like { code, message, data: { status } }.
			const message =
				isJson && body && typeof body === "object" && "message" in body
					? String((body as { message: unknown }).message)
					: typeof body === "string"
						? body.slice(0, 200)
						: `HTTP ${res.status}`;
			throw new PluginClientError(message, res.status, body);
		}

		return body;
	}
}
