// Phase 16.4 — AI Content Writer types (client-safe).

export interface ContentGenerationResult {
	draftId: string;
	wordCount: number;
	inputTokens: number;
	outputTokens: number;
	model: string;
	preview: string; // first 500 chars
}

export const WORD_COUNT_TARGETS: Record<string, { min: number; max: number }> = {
	new_article: { min: 1000, max: 2000 },
	new_landing_page: { min: 600, max: 1200 },
	optimize_existing_page: { min: 400, max: 800 },
	expand_existing_content: { min: 500, max: 1000 },
	faq_section: { min: 300, max: 600 },
	title_meta_update: { min: 0, max: 0 }, // no content, just meta
	internal_link_plan: { min: 0, max: 0 },
};

export const DRAFT_STATUS_LABELS: Record<string, string> = {
	draft: "טיוטה",
	review: "בסקירה",
	approved: "אושר",
	rejected: "נדחה",
};
