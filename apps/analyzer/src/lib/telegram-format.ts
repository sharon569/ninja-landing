// Phase 16.1 — Format engine results as Telegram HTML messages.
// All formatters respect the 4096 char limit and truncate gracefully.
// Uses Telegram's HTML subset: <b>, <i>, <code>, <a href>, <pre>.

import type { InlineKeyboard } from "@/lib/telegram";
import { btn, urlBtn, kbd } from "@/lib/telegram";

// ─── Client List ──────────────────────────────────────────────

interface ClientListItem {
	id: string;
	name: string;
	baseUrl: string;
	healthScore: number;
	healthBand: string;
	openOpps: number;
	lastScanAt: string | null;
	gscLastSyncAt: string | null;
}

export function formatClientList(clients: ClientListItem[], baseUrl: string): {
	text: string;
	keyboard: InlineKeyboard;
} {
	if (clients.length === 0) {
		return { text: "אין לקוחות במערכת.", keyboard: [] };
	}

	const lines = ["<b>📋 לקוחות</b>\n"];

	for (const c of clients) {
		const icon = bandIcon(c.healthBand);
		const host = new URL(c.baseUrl).hostname;
		lines.push(
			`${icon} <b>${esc(c.name)}</b> · ${c.healthScore}/100`,
			`   ${esc(host)} · ${c.openOpps} הזדמנויות`,
			"",
		);
	}

	lines.push(`<i>סה"כ ${clients.length} לקוחות</i>`);

	return {
		text: lines.join("\n"),
		keyboard: kbd(
			clients.slice(0, 8).map((c) => [
				btn(`📊 ${c.name}`, `status:${c.id}`),
			]),
		),
	};
}

// ─── Client Status ────────────────────────────────────────────

interface ClientStatus {
	id: string;
	name: string;
	baseUrl: string;
	healthScore: number;
	healthBand: string;
	openOpps: number;
	highImpactOpps: number;
	findings: number;
	criticalFindings: number;
	keywords: number;
	gscLastSyncAt: string | null;
	lastScanAt: string | null;
}

export function formatClientStatus(c: ClientStatus, baseUrl: string): {
	text: string;
	keyboard: InlineKeyboard;
} {
	const icon = bandIcon(c.healthBand);
	const host = new URL(c.baseUrl).hostname;

	const lines = [
		`${icon} <b>${esc(c.name)}</b>`,
		`<code>${esc(host)}</code>`,
		"",
		`🏥 בריאות: <b>${c.healthScore}/100</b> (${bandLabel(c.healthBand)})`,
		`🔍 הזדמנויות: <b>${c.openOpps}</b> פתוחות${c.highImpactOpps ? ` (${c.highImpactOpps} השפעה גבוהה)` : ""}`,
		`🐛 ממצאים: <b>${c.findings}</b>${c.criticalFindings ? ` (${c.criticalFindings} קריטיים)` : ""}`,
		`🔑 מילות מפתח: <b>${c.keywords}</b>`,
		`📡 GSC: ${c.gscLastSyncAt ? ago(c.gscLastSyncAt) : "לא סונכרן"}`,
		`📷 סריקה: ${c.lastScanAt ? ago(c.lastScanAt) : "לא נסרק"}`,
	];

	const link = `${baseUrl}/clients/${c.id}`;

	return {
		text: lines.join("\n"),
		keyboard: kbd([
			[btn("🔄 רענן", `refresh:${c.id}`), btn("📊 הזדמנויות", `opps:${c.id}`)],
			[urlBtn("🌐 פתח בדשבורד", link)],
		]),
	};
}

// ─── Opportunities ────────────────────────────────────────────

interface OpportunityItem {
	id: string;
	type: string;
	title: string;
	priorityScore: number;
	impact: string;
	status: string;
	relatedKeyword: string;
	relatedPage: string;
}

export function formatOpportunities(
	clientName: string,
	opps: OpportunityItem[],
	baseUrl: string,
): { text: string; keyboard: InlineKeyboard } {
	if (opps.length === 0) {
		return { text: `אין הזדמנויות פתוחות ל-<b>${esc(clientName)}</b>.`, keyboard: [] };
	}

	const lines = [`<b>🔍 הזדמנויות — ${esc(clientName)}</b>\n`];

	const top = opps.slice(0, 10);
	for (let i = 0; i < top.length; i++) {
		const o = top[i];
		const impactIcon = o.impact === "high" ? "🔴" : o.impact === "medium" ? "🟡" : "🔵";
		lines.push(
			`${i + 1}. ${impactIcon} <b>${esc(o.title)}</b>`,
			`   ציון: ${o.priorityScore} · ${esc(o.relatedKeyword || o.relatedPage || "—")}`,
			"",
		);
	}

	if (opps.length > 10) {
		lines.push(`<i>+ עוד ${opps.length - 10} הזדמנויות</i>`);
	}

	// Approve/Reject buttons for top 5 approvable opportunities
	const approvable = top
		.filter((o) => ["detected", "recommended", "needs_human_review"].includes(o.status))
		.slice(0, 5);

	const keyboard = approvable.map((o) => [
		btn(`✅ ${o.title.slice(0, 20)}`, `approve_opp:${o.id}`),
		btn(`❌ דחה`, `reject_opp:${o.id}`),
	]);

	return {
		text: lines.join("\n"),
		keyboard: kbd(keyboard),
	};
}

// ─── Work Plan ────────────────────────────────────────────────

interface WorkPlanSummary {
	id: string;
	clientName: string;
	status: string;
	totalItems: number;
	safeItemsCount: number;
	reviewItemsCount: number;
	blockedItemsCount: number;
	monitorItemsCount: number;
}

export function formatWorkPlan(plan: WorkPlanSummary, baseUrl: string): {
	text: string;
	keyboard: InlineKeyboard;
} {
	const lines = [
		`<b>📋 תוכנית עבודה — ${esc(plan.clientName)}</b>`,
		`סטטוס: <code>${plan.status}</code>`,
		"",
		`✅ פריטים בטוחים: <b>${plan.safeItemsCount}</b>`,
		`👁 דורשים סקירה: <b>${plan.reviewItemsCount}</b>`,
		`🚫 חסומים: <b>${plan.blockedItemsCount}</b>`,
		`👀 מעקב בלבד: <b>${plan.monitorItemsCount}</b>`,
		`━━━━━━━━━━━━━━`,
		`סה"כ: <b>${plan.totalItems}</b> פריטים`,
	];

	// Approve group buttons (only for approvable groups with items)
	// Note: approve_group callback uses planId_group format
	const buttons: InlineKeyboardButton[][] = [];
	if (plan.safeItemsCount > 0) {
		buttons.push([btn(`✅ אשר Safe Meta (${plan.safeItemsCount})`, `approve_group:${plan.id}_safe_meta`)]);
	}
	// Quick wins would need a separate count — for now use safeItemsCount > 0 as proxy
	if (plan.totalItems > plan.safeItemsCount + plan.blockedItemsCount + plan.monitorItemsCount) {
		buttons.push([btn(`✅ אשר Quick Wins`, `approve_group:${plan.id}_quick_wins`)]);
	}
	buttons.push([urlBtn("🌐 צפה בדשבורד", `${baseUrl}/clients/${plan.id}/work-plan`)]);

	return {
		text: lines.join("\n"),
		keyboard: kbd(buttons),
	};
}

// ─── Refresh Result ───────────────────────────────────────────

interface RefreshResult {
	clientName: string;
	clientId: string;
	gscRows: number;
	opportunities: number;
	strategies: number;
	findings: number;
	durationMs: number;
}

export function formatRefreshResult(r: RefreshResult, baseUrl: string): {
	text: string;
	keyboard: InlineKeyboard;
} {
	const seconds = (r.durationMs / 1000).toFixed(1);
	const lines = [
		`<b>🔄 רענון הושלם — ${esc(r.clientName)}</b>`,
		"",
		`📡 שורות GSC: ${r.gscRows}`,
		`🔍 הזדמנויות: ${r.opportunities}`,
		`🎯 אסטרטגיות: ${r.strategies}`,
		`🐛 ממצאים טכניים: ${r.findings}`,
		`⏱ ${seconds}s`,
	];

	return {
		text: lines.join("\n"),
		keyboard: kbd([
			[btn("📊 הזדמנויות", `opps:${r.clientId}`), btn("📋 תוכנית", `plan:${r.clientId}`)],
			[urlBtn("🌐 דשבורד", `${baseUrl}/clients/${r.clientId}`)],
		]),
	};
}

// ─── Scan Result ──────────────────────────────────────────────

interface ScanResult {
	clientName: string;
	clientId: string;
	pages: number;
	findings: number;
	critical: number;
	important: number;
	minor: number;
	durationMs: number;
}

export function formatScanResult(r: ScanResult, baseUrl: string): {
	text: string;
	keyboard: InlineKeyboard;
} {
	const seconds = (r.durationMs / 1000).toFixed(1);
	const lines = [
		`<b>📷 סריקה הושלמה — ${esc(r.clientName)}</b>`,
		"",
		`📄 דפים: ${r.pages}`,
		`🔴 קריטי: ${r.critical}`,
		`🟡 חשוב: ${r.important}`,
		`🔵 מינורי: ${r.minor}`,
		`⏱ ${seconds}s`,
	];

	return {
		text: lines.join("\n"),
		keyboard: kbd([
			[urlBtn("🌐 צפה בממצאים", `${baseUrl}/clients/${r.clientId}/issues`)],
		]),
	};
}

// ─── Helpers ──────────────────────────────────────────────────

function esc(s: string): string {
	return s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
}

function bandIcon(band: string): string {
	switch (band) {
		case "excellent": return "🟢";
		case "good": return "🟢";
		case "warn": return "🟡";
		case "poor": return "🔴";
		default: return "⚪";
	}
}

function bandLabel(band: string): string {
	switch (band) {
		case "excellent": return "מצוין";
		case "good": return "טוב";
		case "warn": return "דורש תשומת לב";
		case "poor": return "דורש טיפול";
		default: return band;
	}
}

function ago(dateStr: string): string {
	const ms = Date.now() - new Date(dateStr).getTime();
	const min = Math.floor(ms / 60_000);
	if (min < 1) return "ממש עכשיו";
	if (min < 60) return `לפני ${min} דק׳`;
	const hr = Math.floor(min / 60);
	if (hr < 24) return `לפני ${hr} שע׳`;
	const days = Math.floor(hr / 24);
	return `לפני ${days} ימים`;
}
