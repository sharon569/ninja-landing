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
		case "/scan":
			return handleScan(arg);
		case "/sync":
			return handleSync(arg);
		case "/refresh":
			return handleRefresh(arg);
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
			"",
			"<b>פעולות:</b>",
			"/scan &lt;לקוח&gt; — הרצת סריקה",
			"/sync &lt;לקוח&gt; — סנכרון GSC",
			"/refresh &lt;לקוח&gt; — רענון מלא",
			"",
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

// ─── /scan <client> ───────────────────────────────────────────

async function handleScan(query: string): Promise<CommandResult> {
	if (!query) return { text: "שימוש: /scan &lt;שם לקוח&gt;" };

	const client = await findClient(query);
	if (!client) return { text: `לא נמצא לקוח בשם "<b>${esc(query)}</b>".` };

	const { enqueueJob, wakeWorker } = await import("@/lib/jobs-server");
	const { id, alreadyQueued } = await enqueueJob("scan", client.id, null, "telegram");
	wakeWorker();

	if (alreadyQueued) {
		return { text: `⏳ סריקה ל-<b>${esc(client.name)}</b> כבר בתור.` };
	}
	return { text: `📷 סריקה ל-<b>${esc(client.name)}</b> נכנסה לתור.\nתקבל התראה כשתסתיים.` };
}

// ─── /sync <client> ───────────────────────────────────────────

async function handleSync(query: string): Promise<CommandResult> {
	if (!query) {
		// Sync all clients
		const { enqueueJob, wakeWorker } = await import("@/lib/jobs-server");
		const clients = await db.client.findMany({
			where: { status: "active", gscPropertyUrl: { not: null } },
			select: { id: true, name: true },
		});
		if (clients.length === 0) {
			return { text: "אין לקוחות עם חיבור GSC." };
		}
		let queued = 0;
		for (const c of clients) {
			const { alreadyQueued } = await enqueueJob("gsc_sync", c.id, null, "telegram");
			if (!alreadyQueued) queued++;
		}
		wakeWorker();
		return { text: `📡 סנכרון GSC נכנס לתור עבור ${queued} לקוחות.` };
	}

	const client = await findClient(query);
	if (!client) return { text: `לא נמצא לקוח בשם "<b>${esc(query)}</b>".` };

	const { enqueueJob, wakeWorker } = await import("@/lib/jobs-server");
	const { alreadyQueued } = await enqueueJob("gsc_sync", client.id, null, "telegram");
	wakeWorker();

	if (alreadyQueued) {
		return { text: `⏳ סנכרון GSC ל-<b>${esc(client.name)}</b> כבר בתור.` };
	}
	return { text: `📡 סנכרון GSC ל-<b>${esc(client.name)}</b> נכנס לתור.` };
}

// ─── /refresh <client> ────────────────────────────────────────

async function handleRefresh(query: string): Promise<CommandResult> {
	if (!query) return { text: "שימוש: /refresh &lt;שם לקוח&gt;" };

	const client = await findClient(query);
	if (!client) return { text: `לא נמצא לקוח בשם "<b>${esc(query)}</b>".` };

	const { enqueueJob, wakeWorker } = await import("@/lib/jobs-server");
	const { alreadyQueued } = await enqueueJob("full_refresh", client.id, null, "telegram");
	wakeWorker();

	if (alreadyQueued) {
		return { text: `⏳ רענון מלא ל-<b>${esc(client.name)}</b> כבר בתור.` };
	}
	return { text: `🔄 רענון מלא ל-<b>${esc(client.name)}</b> נכנס לתור.\nתקבל התראה כשיסתיים.` };
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
			return handleRefreshCallback(id);
		case "approve_opp":
			return handleApproveOpp(id);
		case "reject_opp":
			return handleRejectOpp(id);
		case "approve_group":
			return handleApproveGroup(id);
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

// ─── Refresh Callback ─────────────────────────────────────────

async function handleRefreshCallback(clientId: string): Promise<CommandResult> {
	const client = await db.client.findUnique({
		where: { id: clientId },
		select: { name: true },
	});
	if (!client) return { text: "לקוח לא נמצא." };

	const { enqueueJob, wakeWorker } = await import("@/lib/jobs-server");
	const { alreadyQueued } = await enqueueJob("full_refresh", clientId, null, "telegram");
	wakeWorker();

	if (alreadyQueued) {
		return { text: `⏳ רענון ל-<b>${esc(client.name)}</b> כבר בתור.` };
	}
	return { text: `🔄 רענון ל-<b>${esc(client.name)}</b> נכנס לתור.` };
}

// ─── Opportunity Approve/Reject ───────────────────────────────

async function handleApproveOpp(oppId: string): Promise<CommandResult> {
	const opp = await db.opportunity.findUnique({
		where: { id: oppId },
		select: { id: true, title: true, status: true, clientId: true },
	});

	if (!opp) return { text: "הזדמנות לא נמצאה." };

	const approvableStatuses = ["detected", "recommended", "needs_human_review"];
	if (!approvableStatuses.includes(opp.status)) {
		return { text: `ההזדמנות כבר טופלה (${opp.status}).` };
	}

	await db.opportunity.update({
		where: { id: oppId },
		data: {
			status: "approved",
			approvedAt: new Date(),
			approvedBy: "telegram",
		},
	});

	await db.opportunityActionLog.create({
		data: {
			clientId: opp.clientId,
			opportunityId: oppId,
			actionType: "approved",
			fromStatus: opp.status,
			toStatus: "approved",
			note: "אושר מ-Telegram",
			createdBy: "telegram",
		},
	});

	return { text: `✅ <b>${esc(opp.title)}</b> — אושר!` };
}

async function handleRejectOpp(oppId: string): Promise<CommandResult> {
	const opp = await db.opportunity.findUnique({
		where: { id: oppId },
		select: { id: true, title: true, status: true, clientId: true },
	});

	if (!opp) return { text: "הזדמנות לא נמצאה." };

	const rejectableStatuses = ["detected", "recommended", "needs_human_review", "approved"];
	if (!rejectableStatuses.includes(opp.status)) {
		return { text: `ההזדמנות כבר טופלה (${opp.status}).` };
	}

	await db.opportunity.update({
		where: { id: oppId },
		data: {
			status: "rejected",
			rejectedAt: new Date(),
			rejectedBy: "telegram",
		},
	});

	await db.opportunityActionLog.create({
		data: {
			clientId: opp.clientId,
			opportunityId: oppId,
			actionType: "rejected",
			fromStatus: opp.status,
			toStatus: "rejected",
			note: "נדחה מ-Telegram",
			createdBy: "telegram",
		},
	});

	return { text: `❌ <b>${esc(opp.title)}</b> — נדחה.` };
}

// ─── Work Plan Group Approval ─────────────────────────────────

async function handleApproveGroup(encodedData: string): Promise<CommandResult> {
	// Data format: planId_group (underscore separated since : is used for action:id split)
	const underscoreIdx = encodedData.indexOf("_");
	if (underscoreIdx === -1) return { text: "פורמט לא תקין." };

	const planId = encodedData.slice(0, underscoreIdx);
	const group = encodedData.slice(underscoreIdx + 1);

	const plan = await db.seoWorkPlan.findUnique({
		where: { id: planId },
		select: { id: true, status: true, clientId: true, client: { select: { name: true } } },
	});

	if (!plan) return { text: "תוכנית לא נמצאה." };
	if (plan.status === "superseded") {
		return { text: "⚠️ התוכנית הוחלפה בתוכנית חדשה. בדוק /plan." };
	}

	try {
		const { approveWorkPlanGroup } = await import("@/lib/work-plan-server");
		const result = await approveWorkPlanGroup(planId, group as never, "telegram");

		return {
			text: [
				`✅ <b>קבוצה "${esc(group)}" אושרה</b> — ${esc(plan.client.name)}`,
				"",
				`הוכנו: ${result.prepared}`,
				`דולגו: ${result.skipped}`,
				`נכשלו: ${result.failed}`,
				...(result.notes.length > 0 ? ["", ...result.notes.map((n) => `· ${esc(n)}`)] : []),
			].join("\n"),
		};
	} catch (err) {
		return { text: `❌ שגיאה באישור: ${esc((err as Error).message)}` };
	}
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
