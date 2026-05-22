// Phase 16.1 — Telegram command router.
// Parses /command <args> from incoming messages and routes to DB queries.
// All commands are read-only in Phase 1. Mutations added in Phase 3.

import "server-only";

import { db } from "@/lib/db";
import { calcHealthScore } from "@/lib/health-score";
import { calcProfileCompletion } from "@/lib/profile";
import { sendMessage, type InlineKeyboard } from "@/lib/telegram";
import {
	formatClientList,
	formatClientStatus,
	formatOpportunities,
	formatWorkPlan,
} from "@/lib/telegram-format";

const BASE_URL = process.env.PUBLIC_ANALYZER_URL || "https://seo.samp.ninja";

// ─── Command Dispatch ─────────────────────────────────────────

export interface CommandResult {
	text: string;
	keyboard?: InlineKeyboard;
}

export async function handleCommand(text: string): Promise<CommandResult> {
	const trimmed = text.trim();
	const [cmd, ...args] = trimmed.split(/\s+/);
	const arg = args.join(" ").trim();

	switch (cmd.toLowerCase()) {
		case "/start":
		case "/help":
			return handleHelp();
		case "/clients":
			return handleClients();
		case "/status":
			return handleStatus(arg);
		case "/opps":
			return handleOpps(arg);
		case "/plan":
			return handlePlan(arg);
		case "/discover":
			return handleDiscover(arg);
		default:
			return {
				text: `❓ לא מכיר את הפקודה <code>${esc(cmd)}</code>.\nשלח /help לרשימת פקודות.`,
			};
	}
}

// ─── /help ────────────────────────────────────────────────────

function handleHelp(): CommandResult {
	return {
		text: [
			"<b>🥷 Ninja SEO Bot</b>",
			"",
			"<b>פקודות:</b>",
			"/clients — רשימת כל הלקוחות",
			"/status &lt;לקוח&gt; — סטטוס לקוח",
			"/opps &lt;לקוח&gt; — הזדמנויות פתוחות",
			"/plan &lt;לקוח&gt; — תוכנית עבודה",
			"/discover &lt;לקוח&gt; — מילות מפתח מומלצות מ-GSC",
			"/help — הודעה זו",
		].join("\n"),
	};
}

// ─── /clients ─────────────────────────────────────────────────

async function handleClients(): Promise<CommandResult> {
	const clients = await db.client.findMany({
		where: { status: { not: "archived" } },
		select: {
			id: true,
			name: true,
			baseUrl: true,
			vertical: true,
			language: true,
			country: true,
			serviceAreas: true,
			seoGoals: true,
			targetPages: true,
			competitors: true,
			brandVoice: true,
			gscLastSyncAt: true,
			lastScanAt: true,
			_count: {
				select: {
					opportunities: { where: { status: { in: ["detected", "recommended", "needs_human_review", "approved"] } } },
					targetKeywords: { where: { status: "active" } },
				},
			},
		},
		orderBy: { name: "asc" },
	});

	// Compute health score per client
	const items = await Promise.all(
		clients.map(async (c) => {
			const [highSeverity, highImpact, monitoring, improved] = await Promise.all([
				db.finding.count({
					where: {
						scan: { clientId: c.id },
						severity: "high",
					},
				}),
				db.opportunity.count({
					where: {
						clientId: c.id,
						priorityScore: { gte: 80 },
						status: { in: ["detected", "recommended", "needs_human_review", "approved"] },
					},
				}),
				db.opportunity.count({
					where: { clientId: c.id, status: { in: ["monitoring", "manually_applied"] } },
				}),
				db.impactReview.count({
					where: { clientId: c.id, result: "improved" },
				}),
			]);

			const health = calcHealthScore({
				profileCompletionPct: calcProfileCompletion(c).percent,
				openOpportunities: c._count.opportunities,
				highImpactOpen: highImpact,
				highSeverityFindings: highSeverity,
				hasKeywordBank: c._count.targetKeywords > 0,
				hasGscSync: !!c.gscLastSyncAt,
				gscFreshDays: c.gscLastSyncAt
					? Math.floor((Date.now() - c.gscLastSyncAt.getTime()) / 86_400_000)
					: null,
				monitoringCount: monitoring,
				improvedReviews: improved,
			});

			return {
				id: c.id,
				name: c.name,
				baseUrl: c.baseUrl,
				healthScore: health.score,
				healthBand: health.band,
				openOpps: c._count.opportunities,
				lastScanAt: c.lastScanAt?.toISOString() || null,
				gscLastSyncAt: c.gscLastSyncAt?.toISOString() || null,
			};
		}),
	);

	const { text, keyboard } = formatClientList(items, BASE_URL);
	return { text, keyboard };
}

// ─── /status <client> ─────────────────────────────────────────

async function handleStatus(query: string): Promise<CommandResult> {
	if (!query) {
		return { text: "שימוש: /status &lt;שם לקוח&gt;" };
	}

	const client = await findClient(query);
	if (!client) {
		return { text: `לא נמצא לקוח בשם "<b>${esc(query)}</b>".` };
	}

	const [oppCount, highImpact, findingCount, criticalCount, kwCount] = await Promise.all([
		db.opportunity.count({
			where: {
				clientId: client.id,
				status: { in: ["detected", "recommended", "needs_human_review", "approved"] },
			},
		}),
		db.opportunity.count({
			where: {
				clientId: client.id,
				priorityScore: { gte: 80 },
				status: { in: ["detected", "recommended", "needs_human_review", "approved"] },
			},
		}),
		db.finding.count({ where: { scan: { clientId: client.id } } }),
		db.finding.count({ where: { scan: { clientId: client.id }, severity: "high" } }),
		db.targetKeyword.count({ where: { clientId: client.id, status: "active" } }),
	]);

	const health = calcHealthScore({
		profileCompletionPct: calcProfileCompletion(client).percent,
		openOpportunities: oppCount,
		highImpactOpen: highImpact,
		highSeverityFindings: criticalCount,
		hasKeywordBank: kwCount > 0,
		hasGscSync: !!client.gscLastSyncAt,
		gscFreshDays: client.gscLastSyncAt
			? Math.floor((Date.now() - client.gscLastSyncAt.getTime()) / 86_400_000)
			: null,
		monitoringCount: 0,
		improvedReviews: 0,
	});

	const { text, keyboard } = formatClientStatus(
		{
			id: client.id,
			name: client.name,
			baseUrl: client.baseUrl,
			healthScore: health.score,
			healthBand: health.band,
			openOpps: oppCount,
			highImpactOpps: highImpact,
			findings: findingCount,
			criticalFindings: criticalCount,
			keywords: kwCount,
			gscLastSyncAt: client.gscLastSyncAt?.toISOString() || null,
			lastScanAt: client.lastScanAt?.toISOString() || null,
		},
		BASE_URL,
	);

	return { text, keyboard };
}

// ─── /opps <client> ───────────────────────────────────────────

async function handleOpps(query: string): Promise<CommandResult> {
	if (!query) {
		return { text: "שימוש: /opps &lt;שם לקוח&gt;" };
	}

	const client = await findClient(query);
	if (!client) {
		return { text: `לא נמצא לקוח בשם "<b>${esc(query)}</b>".` };
	}

	const opps = await db.opportunity.findMany({
		where: {
			clientId: client.id,
			status: { in: ["detected", "recommended", "needs_human_review", "approved"] },
		},
		orderBy: { priorityScore: "desc" },
		take: 15,
		select: {
			id: true,
			type: true,
			title: true,
			priorityScore: true,
			impact: true,
			status: true,
			relatedKeyword: true,
			relatedPage: true,
		},
	});

	const { text, keyboard } = formatOpportunities(client.name, opps, BASE_URL);
	return { text, keyboard };
}

// ─── /plan <client> ───────────────────────────────────────────

async function handlePlan(query: string): Promise<CommandResult> {
	if (!query) {
		return { text: "שימוש: /plan &lt;שם לקוח&gt;" };
	}

	const client = await findClient(query);
	if (!client) {
		return { text: `לא נמצא לקוח בשם "<b>${esc(query)}</b>".` };
	}

	const plan = await db.seoWorkPlan.findFirst({
		where: {
			clientId: client.id,
			status: { not: "superseded" },
		},
		orderBy: { createdAt: "desc" },
		select: {
			id: true,
			status: true,
			totalItems: true,
			safeItemsCount: true,
			reviewItemsCount: true,
			blockedItemsCount: true,
			monitorItemsCount: true,
		},
	});

	if (!plan) {
		return { text: `אין תוכנית עבודה פעילה ל-<b>${esc(client.name)}</b>.` };
	}

	const { text, keyboard } = formatWorkPlan(
		{ ...plan, clientName: client.name },
		BASE_URL,
	);

	return { text, keyboard };
}

// ─── /discover <client> ───────────────────────────────────────

async function handleDiscover(query: string): Promise<CommandResult> {
	if (!query) {
		return { text: "שימוש: /discover &lt;שם לקוח&gt;" };
	}

	const client = await findClient(query);
	if (!client) {
		return { text: `לא נמצא לקוח בשם "<b>${esc(query)}</b>".` };
	}

	const suggestions = await db.keywordSuggestion.findMany({
		where: { clientId: client.id, status: "suggested" },
		orderBy: { score: "desc" },
		take: 10,
	});

	if (suggestions.length === 0) {
		return {
			text: `אין הצעות מילות מפתח חדשות ל-<b>${esc(client.name)}</b>.\nהרץ רענון כדי לסרוק GSC.`,
		};
	}

	const { btn, kbd } = await import("@/lib/telegram");

	const lines = [`<b>💡 מילות מפתח מומלצות — ${esc(client.name)}</b>\n`];

	for (let i = 0; i < suggestions.length; i++) {
		const s = suggestions[i];
		const posStr = s.position ? `מיקום ${Math.round(s.position)}` : "";
		lines.push(
			`${i + 1}. <b>${esc(s.query)}</b> — ציון ${s.score}`,
			`   ${s.impressions28d.toLocaleString()} חיפושים${posStr ? ` · ${posStr}` : ""}`,
			`   <i>${esc(s.reason)}</i>`,
			"",
		);
	}

	const totalSuggested = await db.keywordSuggestion.count({
		where: { clientId: client.id, status: "suggested" },
	});

	if (totalSuggested > 10) {
		lines.push(`<i>+ עוד ${totalSuggested - 10} הצעות</i>`);
	}

	// Build keyboard with Add/Ignore buttons for top 5
	const keyboard = suggestions.slice(0, 5).map((s) => [
		btn(`➕ ${s.query}`, `add_kw:${s.id}`),
		btn(`⏭ דלג`, `ignore_kw:${s.id}`),
	]);

	return { text: lines.join("\n"), keyboard: kbd(keyboard) };
}

// ─── Callback Query Handler ───────────────────────────────────

export async function handleCallback(data: string): Promise<CommandResult | null> {
	const [action, id] = data.split(":");
	if (!action || !id) return null;

	switch (action) {
		case "status":
			return handleStatusById(id);
		case "opps":
			return handleOppsById(id);
		case "plan":
			return handlePlanById(id);
		case "refresh":
			// Phase 3 will handle this — for now, just acknowledge
			return { text: "🔄 רענון יתווסף בגרסה הבאה. השתמש בדשבורד בינתיים." };
		case "add_kw":
			return handleAddKeyword(id);
		case "ignore_kw":
			return handleIgnoreKeyword(id);
		default:
			return null;
	}
}

async function handleStatusById(clientId: string): Promise<CommandResult> {
	const client = await db.client.findUnique({
		where: { id: clientId },
		select: { name: true },
	});
	if (!client) return { text: "לקוח לא נמצא." };
	return handleStatus(client.name);
}

async function handleOppsById(clientId: string): Promise<CommandResult> {
	const client = await db.client.findUnique({
		where: { id: clientId },
		select: { name: true },
	});
	if (!client) return { text: "לקוח לא נמצא." };
	return handleOpps(client.name);
}

async function handlePlanById(clientId: string): Promise<CommandResult> {
	const client = await db.client.findUnique({
		where: { id: clientId },
		select: { name: true },
	});
	if (!client) return { text: "לקוח לא נמצא." };
	return handlePlan(client.name);
}

// ─── Keyword Add/Ignore Handlers ──────────────────────────────

async function handleAddKeyword(suggestionId: string): Promise<CommandResult> {
	const { convertSuggestion } = await import("@/lib/keyword-discovery-server");
	const { enqueueJob, wakeWorker } = await import("@/lib/jobs-server");

	try {
		const suggestion = await db.keywordSuggestion.findUnique({
			where: { id: suggestionId },
			select: { query: true, clientId: true, status: true },
		});

		if (!suggestion) return { text: "ההצעה לא נמצאה." };
		if (suggestion.status !== "suggested") {
			return { text: `ההצעה כבר טופלה (${suggestion.status}).` };
		}

		const { keywordId } = await convertSuggestion(suggestionId, "telegram");

		// Trigger pipeline for the new keyword
		enqueueJob("keyword_refresh", suggestion.clientId, { keywordIds: [keywordId] }, "telegram")
			.then(() => wakeWorker())
			.catch(() => {});

		return {
			text: `✅ <b>${esc(suggestion.query)}</b> נוסף לבנק מילות המפתח!\nהמערכת מחשבת אסטרטגיה...`,
		};
	} catch (err) {
		return { text: `❌ שגיאה: ${esc((err as Error).message)}` };
	}
}

async function handleIgnoreKeyword(suggestionId: string): Promise<CommandResult> {
	const { rejectSuggestion } = await import("@/lib/keyword-discovery-server");

	try {
		const suggestion = await db.keywordSuggestion.findUnique({
			where: { id: suggestionId },
			select: { query: true, status: true },
		});

		if (!suggestion) return { text: "ההצעה לא נמצאה." };
		if (suggestion.status !== "suggested") {
			return { text: `ההצעה כבר טופלה (${suggestion.status}).` };
		}

		await rejectSuggestion(suggestionId);
		return { text: `⏭ <b>${esc(suggestion.query)}</b> — דילגת.` };
	} catch (err) {
		return { text: `❌ שגיאה: ${esc((err as Error).message)}` };
	}
}

// ─── Client Lookup ────────────────────────────────────────────

async function findClient(query: string) {
	// Try exact name match first, then partial.
	const exact = await db.client.findFirst({
		where: {
			name: { equals: query, mode: "insensitive" },
			status: { not: "archived" },
		},
		select: {
			id: true,
			name: true,
			baseUrl: true,
			vertical: true,
			language: true,
			country: true,
			serviceAreas: true,
			seoGoals: true,
			targetPages: true,
			competitors: true,
			brandVoice: true,
			gscLastSyncAt: true,
			lastScanAt: true,
		},
	});
	if (exact) return exact;

	return db.client.findFirst({
		where: {
			name: { contains: query, mode: "insensitive" },
			status: { not: "archived" },
		},
		select: {
			id: true,
			name: true,
			baseUrl: true,
			vertical: true,
			language: true,
			country: true,
			serviceAreas: true,
			seoGoals: true,
			targetPages: true,
			competitors: true,
			brandVoice: true,
			gscLastSyncAt: true,
			lastScanAt: true,
		},
	});
}

// ─── Helpers ──────────────────────────────────────────────────

function esc(s: string): string {
	return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
