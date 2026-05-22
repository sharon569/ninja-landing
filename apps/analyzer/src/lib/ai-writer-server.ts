// Phase 16.4 — AI Content Writer (server-only).
//
// Takes a ContentBrief and generates actual content via Claude API.
// Content always starts as status="draft" — no auto-publish.
// YMYL verticals (medical/legal/finance) auto-flag as "review".

import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/lib/db";
import { WORD_COUNT_TARGETS, type ContentGenerationResult } from "@/lib/ai-writer";

// ─── Generate ─────────────────────────────────────────────────

export async function generateContent(
	briefId: string,
	feedback?: string,
): Promise<ContentGenerationResult> {
	const brief = await db.contentBrief.findUnique({
		where: { id: briefId },
		include: {
			client: {
				select: {
					name: true,
					vertical: true,
					language: true,
					brandVoice: true,
					seoGoals: true,
				},
			},
		},
	});

	if (!brief) throw new Error("Brief not found");
	if (brief.briefType === "title_meta_update" || brief.briefType === "internal_link_plan") {
		throw new Error("Brief type does not require content generation");
	}

	const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";
	const wordTarget = WORD_COUNT_TARGETS[brief.briefType] || { min: 500, max: 1000 };

	const systemPrompt = buildSystemPrompt(brief.client, brief);
	const userPrompt = buildUserPrompt(brief, wordTarget, feedback);

	const client = new Anthropic();

	const response = await client.messages.create({
		model,
		max_tokens: 8192,
		system: systemPrompt,
		messages: [{ role: "user", content: userPrompt }],
	});

	const content = response.content
		.filter((block) => block.type === "text")
		.map((block) => block.text)
		.join("\n\n");

	const wordCount = content.split(/\s+/).length;

	// Determine status — YMYL gets flagged for review
	const ymylVerticals = ["medical", "legal", "finance"];
	const isYmyl = brief.client.vertical && ymylVerticals.includes(brief.client.vertical);
	const status = isYmyl ? "review" : "draft";

	// Get next version number
	const lastDraft = await db.contentDraft.findFirst({
		where: { briefId },
		orderBy: { version: "desc" },
		select: { version: true },
	});
	const version = (lastDraft?.version ?? 0) + 1;

	const draft = await db.contentDraft.create({
		data: {
			briefId,
			version,
			model,
			content,
			wordCount,
			inputTokens: response.usage.input_tokens,
			outputTokens: response.usage.output_tokens,
			status,
			feedback: feedback || null,
		},
	});

	return {
		draftId: draft.id,
		wordCount,
		inputTokens: response.usage.input_tokens,
		outputTokens: response.usage.output_tokens,
		model,
		preview: content.slice(0, 500),
	};
}

// ─── Approve / Reject ─────────────────────────────────────────

export async function approveDraft(draftId: string, actor: string): Promise<void> {
	await db.contentDraft.update({
		where: { id: draftId },
		data: { status: "approved", approvedAt: new Date(), approvedBy: actor },
	});
}

export async function rejectDraft(draftId: string): Promise<void> {
	await db.contentDraft.update({
		where: { id: draftId },
		data: { status: "rejected" },
	});
}

// ─── Prompt Building ──────────────────────────────────────────

function buildSystemPrompt(
	client: { name: string; vertical: string | null; language: string | null; brandVoice: string | null; seoGoals: string | null },
	brief: { searchIntent: string },
): string {
	const lang = client.language === "en" ? "English" : "Hebrew";
	const parts = [
		`You are an expert SEO content writer. Write in ${lang}.`,
		`Client: ${client.name}.`,
	];

	if (client.vertical) parts.push(`Industry: ${client.vertical}.`);
	if (client.brandVoice) parts.push(`Brand voice: ${client.brandVoice}.`);
	if (client.seoGoals) parts.push(`SEO goals: ${client.seoGoals}.`);

	parts.push(
		"",
		"Guidelines:",
		"- Write naturally, not keyword-stuffed",
		"- Use the target keyword in the first paragraph, H2s, and naturally throughout",
		"- Include secondary keywords where they fit naturally",
		"- Structure with clear H2 and H3 headings",
		"- Write for humans first, SEO second",
		"- Be specific and actionable, avoid generic filler",
		"- If Hebrew: write right-to-left, use natural Hebrew phrasing",
		`- Search intent: ${brief.searchIntent} — match the content to what the searcher wants`,
	);

	return parts.join("\n");
}

function buildUserPrompt(
	brief: {
		targetKeyword: string;
		briefType: string;
		searchIntent: string;
		recommendedTitle: string | null;
		recommendedH1: string | null;
		outline: string | null;
		secondaryKeywords: string[];
		internalLinks: string[];
		recommendedCTA: string | null;
		recommendedSchema: string | null;
		contentAngle: string | null;
		notes: string | null;
	},
	wordTarget: { min: number; max: number },
	feedback?: string,
): string {
	const parts = [
		`Write a ${brief.briefType.replace(/_/g, " ")} for the keyword: "${brief.targetKeyword}"`,
		"",
	];

	if (brief.recommendedTitle) parts.push(`Suggested title: ${brief.recommendedTitle}`);
	if (brief.recommendedH1) parts.push(`H1: ${brief.recommendedH1}`);
	if (brief.outline) parts.push(`Outline:\n${brief.outline}`);
	if (brief.secondaryKeywords.length > 0) {
		parts.push(`Secondary keywords to include: ${brief.secondaryKeywords.join(", ")}`);
	}
	if (brief.internalLinks.length > 0) {
		parts.push(`Internal links to weave in:\n${brief.internalLinks.map((l) => `- ${l}`).join("\n")}`);
	}
	if (brief.recommendedCTA) parts.push(`CTA: ${brief.recommendedCTA}`);
	if (brief.contentAngle) parts.push(`Angle: ${brief.contentAngle}`);
	if (brief.notes) parts.push(`Notes: ${brief.notes}`);

	if (wordTarget.min > 0) {
		parts.push(`\nTarget length: ${wordTarget.min}-${wordTarget.max} words.`);
	}

	parts.push("\nOutput the content in markdown format (H2, H3, paragraphs, bullet lists where appropriate).");

	if (feedback) {
		parts.push(`\n--- REVISION REQUEST ---\n${feedback}\nPlease revise the content based on this feedback.`);
	}

	return parts.join("\n");
}
