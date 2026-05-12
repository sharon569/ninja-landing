// Phase 11 — HTTP client for the WordPress plugin v0.3 Write API.
//
// Every call goes to ${client.baseUrl} with X-ASEO-Token header. baseUrl on
// the Client model is the wp-json endpoint (e.g. https://x.com/wp-json/aseo/v1),
// but legacy values may be the site root — normaliseBase handles both.

import "server-only";

export interface WpInfo {
	plugin: string;
	plugin_version: string;
	wp_version: string;
	yoast_active: boolean;
	yoast_version: string | null;
	write_api_version: string | null;
	write_api_enabled: boolean;
	dry_run_supported: boolean;
	supported_write_actions: string[];
	dry_run_only_actions: string[];
}

export interface WriteResponse {
	ok: boolean;
	actionType: string;
	dryRun: boolean;
	executed?: boolean;
	changed: boolean;
	needsHumanReview?: boolean;
	target: Record<string, unknown>;
	before?: string;
	after?: string;
	// Plugin v0.3.3+ — the title/description Yoast actually renders today,
	// resolved from wp_yoast_indexable. Surfaces the visible page title even
	// when there's no manual meta override (template-rendered case).
	currentRendered?: string | null;
	beforeSnippet?: string | null;
	afterSnippet?: string | null;
	beforeExcerpt?: string;
	afterPreview?: string;
	currentTitle?: string;
	proposedTitle?: string;
	currentDescription?: string;
	proposedDescription?: string;
	currentAlt?: string;
	proposedAlt?: string;
	warnings?: string[];
	note?: string;
	auditLogId?: number;
	error?: string;
	[k: string]: unknown;
}

function normaliseBase(baseUrl: string): string {
	// Strip trailing slash; ensure it ends with /wp-json/aseo/v1.
	let b = baseUrl.replace(/\/+$/, "");
	if (!/\/wp-json\/aseo\/v1$/.test(b)) {
		// If baseUrl is the site root, append the plugin namespace.
		b = b.replace(/\/wp-json.*$/, "");
		b = `${b}/wp-json/aseo/v1`;
	}
	return b;
}

export async function getWpInfo(baseUrl: string, token: string): Promise<WpInfo> {
	const base = normaliseBase(baseUrl);
	const res = await fetch(`${base}/info`, {
		headers: { "X-ASEO-Token": token, Accept: "application/json" },
		cache: "no-store",
	});
	if (!res.ok) {
		throw new Error(`WP /info failed: ${res.status} ${res.statusText}`);
	}
	return (await res.json()) as WpInfo;
}

export interface WritePostBody {
	postId?: number;
	url?: string;
	title?: string;
	description?: string;
	altText?: string;
	attachmentId?: number;
	imageUrl?: string;
	targetUrl?: string;
	anchorText?: string;
	placementHint?: string;
	snippet?: string;
	placement?: string;
	dryRun: boolean;
	requestId: string;
	// Plugin v0.3.2+ — set true for rollback writes so the plugin accepts
	// an empty title/desc/alt and DELETES the meta key (Yoast falls back to
	// its template). Default false — normal writes still reject empty.
	allowEmpty?: boolean;
}

export async function callWriteEndpoint(
	baseUrl: string,
	token: string,
	endpoint:
		| "yoast-title"
		| "yoast-description"
		| "image-alt"
		| "internal-link"
		| "content-snippet",
	body: WritePostBody,
): Promise<WriteResponse> {
	const base = normaliseBase(baseUrl);
	const url = `${base}/write/${endpoint}`;
	let res: Response;
	try {
		res = await fetch(url, {
			method: "POST",
			headers: {
				"X-ASEO-Token": token,
				"Content-Type": "application/json",
				Accept: "application/json",
			},
			body: JSON.stringify(body),
			cache: "no-store",
		});
	} catch (err) {
		throw new Error(`WP write call failed: ${(err as Error).message}`);
	}

	let payload: WriteResponse | { code?: string; message?: string };
	try {
		payload = (await res.json()) as WriteResponse;
	} catch {
		throw new Error(`WP returned non-JSON ${res.status} body`);
	}
	if (!res.ok) {
		const err = (payload as { code?: string; message?: string }).message || `HTTP ${res.status}`;
		throw new Error(`WP ${endpoint} → ${err}`);
	}
	return payload as WriteResponse;
}
