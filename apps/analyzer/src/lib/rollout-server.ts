// Phase 14B — Execution Rollout server loader.
//
// Single-call entry point for the /rollout page: aggregates per-client status,
// agency-level metrics, and the Needs Attention queue. Heavy in queries but
// scoped narrowly (Client + ExecutionAction + ExecutionEvent only — no scan
// payloads, no opportunity bodies).

import "server-only";
import { db } from "./db";
import { getExecutionReadiness } from "./execution-server";
import {
	MIN_PLUGIN_VERSION,
	RECOMMENDED_PLUGIN_VERSION,
	compareVersions,
	ACTION_EXPANSION_THRESHOLD,
	ROLLBACK_AVAILABLE_NUDGE_DAYS,
	ACTION_TYPE_LABELS,
	type ExecutionActionType,
	EXECUTABLE_ACTIONS,
} from "./execution";
import {
	deriveClientStatus,
	type ClientRolloutRow,
	type AgencyExecutionMetrics,
	type NeedsAttentionItem,
	type ActionExpansionSuggestion,
} from "./rollout";

export interface RolloutDashboard {
	clients: ClientRolloutRow[];
	metrics: AgencyExecutionMetrics;
	needsAttention: NeedsAttentionItem[];
	expansionSuggestions: ActionExpansionSuggestion[];
}

function hostOf(baseUrl: string): string {
	try {
		return new URL(baseUrl).host.replace(/^www\./, "");
	} catch {
		return baseUrl;
	}
}

export async function loadRolloutDashboard(): Promise<RolloutDashboard> {
	const clients = await db.client.findMany({
		orderBy: { createdAt: "asc" },
		select: {
			id: true,
			name: true,
			baseUrl: true,
			executionEnabled: true,
			executionPilotMode: true,
			allowedExecutionActions: true,
		},
	});

	// One readiness probe per client in parallel — capped by Promise.all.
	const readinesses = await Promise.all(
		clients.map((c) => getExecutionReadiness(c.id).catch(() => null)),
	);

	const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000);
	const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000);
	const nudgeCutoff = new Date(Date.now() - ROLLBACK_AVAILABLE_NUDGE_DAYS * 86_400_000);

	// Bulk action stats per client
	const allActions = await db.executionAction.findMany({
		orderBy: { updatedAt: "desc" },
		select: {
			id: true,
			clientId: true,
			actionType: true,
			status: true,
			error: true,
			executedAt: true,
			updatedAt: true,
		},
	});
	const actionsByClient = new Map<string, typeof allActions>();
	for (const a of allActions) {
		const arr = actionsByClient.get(a.clientId) ?? [];
		arr.push(a);
		actionsByClient.set(a.clientId, arr);
	}

	const rows: ClientRolloutRow[] = clients.map((c, i) => {
		const readiness = readinesses[i];
		const actions = actionsByClient.get(c.id) ?? [];

		const executionsCount = actions.length;
		const executedCount = actions.filter((a) => a.status === "executed" || a.status === "rollback_available" || a.status === "finalized").length;
		const failedCount = actions.filter((a) => a.status === "failed").length;
		const dryRunStaleCount = actions.filter((a) => a.status === "dry_run_stale").length;
		const rollbackAvailableCount = actions.filter((a) => a.status === "rollback_available").length;
		const finalizedCount = actions.filter((a) => a.status === "finalized").length;

		const lastExecuted = actions.find((a) => a.executedAt);
		const lastFail = actions.find((a) => a.status === "failed" && a.error);

		const pluginVersion = readiness?.pluginVersion ?? null;
		const pluginVersionOk = !!readiness && compareVersions(pluginVersion, MIN_PLUGIN_VERSION) >= 0;
		const pluginVersionRecommended = !!readiness && compareVersions(pluginVersion, RECOMMENDED_PLUGIN_VERSION) >= 0;

		const fakeReadiness = readiness ?? {
			overallReady: false,
			executionEnabled: c.executionEnabled,
			pilotMode: c.executionPilotMode,
			allowedActions: c.allowedExecutionActions ?? [],
			tokenPresent: false,
			pluginReachable: false,
			pluginVersion: null,
			pluginVersionOk: false,
			writeApiEnabled: false,
			dryRunSupported: false,
			yoastActive: false,
			pluginSupportedActions: [],
			lastCheckedAt: new Date().toISOString(),
			warnings: ["readiness_probe_failed"],
		};

		const { status, reasons } = deriveClientStatus(
			fakeReadiness,
			{ failedCount, dryRunStaleCount, rollbackAvailableCount },
			pluginVersionRecommended,
		);

		return {
			clientId: c.id,
			clientName: c.name,
			host: hostOf(c.baseUrl),

			pluginVersion,
			pluginVersionOk,
			pluginVersionRecommended,
			writeApiEnabled: fakeReadiness.writeApiEnabled,
			dryRunSupported: fakeReadiness.dryRunSupported,
			pluginSupportedActions: fakeReadiness.pluginSupportedActions,

			executionEnabled: c.executionEnabled,
			executionPilotMode: c.executionPilotMode,
			allowedExecutionActions: c.allowedExecutionActions ?? [],

			executionsCount,
			executedCount,
			failedCount,
			dryRunStaleCount,
			rollbackAvailableCount,
			finalizedCount,
			lastExecutedAt: lastExecuted?.executedAt?.toISOString() ?? null,
			lastErrorMessage: lastFail?.error ?? null,

			pluginReachable: fakeReadiness.pluginReachable,
			tokenPresent: fakeReadiness.tokenPresent,

			status,
			statusReasons: reasons,
		};
	});

	// ─── Agency-level metrics ──────────────────────────────────

	const last30dActions = allActions.filter(
		(a) => a.executedAt && a.executedAt >= thirtyDaysAgo,
	);
	const last30dDryRunsCompleted = allActions.filter(
		(a) =>
			a.updatedAt >= thirtyDaysAgo &&
			["dry_run_ready", "preview_only", "executed", "rollback_available", "finalized", "rolled_back"].includes(a.status),
	);
	const last30dDryRunsFailed = allActions.filter(
		(a) => a.updatedAt >= thirtyDaysAgo && a.status === "dry_run_failed",
	);
	const last30dExecuted = allActions.filter(
		(a) => a.executedAt && a.executedAt >= thirtyDaysAgo,
	);
	const last30dExecutedSuccess = last30dExecuted.filter((a) =>
		["executed", "rollback_available", "finalized", "rolled_back"].includes(a.status),
	);
	const last30dExecutedFailed = last30dExecuted.filter((a) => a.status === "failed");
	const last30dRolledBack = allActions.filter(
		(a) => a.updatedAt >= thirtyDaysAgo && a.status === "rolled_back",
	);
	const last30dStale = allActions.filter(
		(a) => a.updatedAt >= thirtyDaysAgo && a.status === "dry_run_stale",
	);

	const safeDiv = (n: number, d: number) => (d > 0 ? n / d : 0);

	const metrics: AgencyExecutionMetrics = {
		totalClients: clients.length,
		clientsExecutionEnabled: rows.filter((r) => r.executionEnabled).length,
		clientsPilot: rows.filter((r) => r.status === "pilot_enabled").length,
		clientsUpdateRecommended: rows.filter((r) => r.status === "update_recommended").length,
		clientsNeedsAttention: rows.filter((r) => r.status === "needs_attention" || r.status === "not_ready").length,
		executionsLast7d: allActions.filter(
			(a) => a.executedAt && a.executedAt >= sevenDaysAgo && ["executed", "rollback_available", "finalized"].includes(a.status),
		).length,
		failuresLast7d: allActions.filter(
			(a) => a.updatedAt >= sevenDaysAgo && a.status === "failed",
		).length,
		dryRunStaleCount: allActions.filter((a) => a.status === "dry_run_stale").length,
		rollbackAvailableCount: allActions.filter((a) => a.status === "rollback_available").length,
		finalizedExecutions: allActions.filter((a) => a.status === "finalized").length,
		dryRunSuccessRate: safeDiv(
			last30dDryRunsCompleted.length,
			last30dDryRunsCompleted.length + last30dDryRunsFailed.length,
		),
		executionSuccessRate: safeDiv(last30dExecutedSuccess.length, last30dExecuted.length),
		rollbackRate: safeDiv(last30dRolledBack.length, Math.max(last30dExecuted.length, 1)),
		staleRate: safeDiv(last30dStale.length, Math.max(last30dDryRunsCompleted.length + last30dDryRunsFailed.length, 1)),
	};

	// ─── Needs Attention queue ─────────────────────────────────

	const needsAttention: NeedsAttentionItem[] = [];
	for (const row of rows) {
		const link = (path: string, label: string) => ({
			label,
			href: `/clients/${row.clientId}${path}`,
		});

		if (row.status === "needs_attention" && row.executionEnabled && !row.writeApiEnabled) {
			needsAttention.push({
				id: `wapi_off:${row.clientId}`,
				clientId: row.clientId,
				clientName: row.clientName,
				kind: "write_api_disabled",
				title: `${row.clientName} · Write API כבוי בפלאגין`,
				detail: "ה-kill switch של Write API בפלאגין כבוי. ביצוע חדש לא יוכל לרוץ עד שיופעל מחדש ב-WP.",
				createdAt: new Date().toISOString(),
				links: [link("/execution", "פתח Execution"), link("/settings", "הגדרות לקוח")],
			});
		}
		if (row.status === "not_ready" && row.executionEnabled && !row.pluginReachable) {
			needsAttention.push({
				id: `plugin_off:${row.clientId}`,
				clientId: row.clientId,
				clientName: row.clientName,
				kind: "plugin_unreachable",
				title: `${row.clientName} · פלאגין לא נגיש`,
				detail: "ה-Analyzer לא הצליח לתקשר עם הפלאגין. בדוק token, baseUrl וזמינות האתר.",
				createdAt: new Date().toISOString(),
				links: [link("/execution", "פתח Execution"), link("/settings", "הגדרות לקוח")],
			});
		}
		if (row.executionEnabled && !row.pluginVersionRecommended && row.pluginVersionOk) {
			needsAttention.push({
				id: `update:${row.clientId}`,
				clientId: row.clientId,
				clientName: row.clientName,
				kind: "plugin_update_recommended",
				title: `${row.clientName} · עדכון פלאגין מומלץ`,
				detail: `נמצא v${row.pluginVersion ?? "?"}. גרסה מומלצת: v${RECOMMENDED_PLUGIN_VERSION}.`,
				createdAt: new Date().toISOString(),
				links: [link("/execution", "פתח Execution")],
			});
		}
		if (row.failedCount > 0) {
			needsAttention.push({
				id: `failed:${row.clientId}`,
				clientId: row.clientId,
				clientName: row.clientName,
				kind: "failed_execution",
				title: `${row.clientName} · ${row.failedCount} ביצועים שנכשלו`,
				detail: row.lastErrorMessage ?? null,
				createdAt: new Date().toISOString(),
				links: [link("/execution", "פתח Execution")],
			});
		}
		if (row.dryRunStaleCount > 0) {
			needsAttention.push({
				id: `stale:${row.clientId}`,
				clientId: row.clientId,
				clientName: row.clientName,
				kind: "dry_run_stale",
				title: `${row.clientName} · ${row.dryRunStaleCount} Dry Runs לא טריים`,
				detail: "צריך להריץ Dry Run חדש לפני שאפשר לבצע Execute.",
				createdAt: new Date().toISOString(),
				links: [link("/execution", "פתח Execution")],
			});
		}
	}

	// Aging rollback-available actions
	const aging = allActions.filter(
		(a) => a.status === "rollback_available" && a.executedAt && a.executedAt < nudgeCutoff,
	);
	for (const a of aging) {
		const row = rows.find((r) => r.clientId === a.clientId);
		if (!row) continue;
		needsAttention.push({
			id: `aging:${a.id}`,
			clientId: row.clientId,
			clientName: row.clientName,
			kind: "rollback_available_aging",
			title: `${row.clientName} · פעולה ב-Rollback Available מעל ${ROLLBACK_AVAILABLE_NUDGE_DAYS} ימים`,
			detail: "אם הכל תקין, סמן Finalize כדי לסגור.",
			createdAt: a.executedAt?.toISOString() ?? new Date().toISOString(),
			links: [{ label: "פתח Execution", href: `/clients/${row.clientId}/execution` }],
		});
	}

	// ─── Expansion suggestions ─────────────────────────────────

	const expansionSuggestions: ActionExpansionSuggestion[] = [];
	for (const row of rows) {
		if (!row.executionEnabled) continue;
		for (let i = 0; i < EXECUTABLE_ACTIONS.length - 1; i++) {
			const current = EXECUTABLE_ACTIONS[i];
			const next = EXECUTABLE_ACTIONS[i + 1];
			if (!row.allowedExecutionActions.includes(current)) continue;
			if (row.allowedExecutionActions.includes(next)) continue;
			const successful = (actionsByClient.get(row.clientId) ?? []).filter(
				(a) =>
					a.actionType === current &&
					["executed", "rollback_available", "finalized"].includes(a.status),
			).length;
			if (successful >= ACTION_EXPANSION_THRESHOLD) {
				expansionSuggestions.push({
					clientId: row.clientId,
					clientName: row.clientName,
					currentAction: current,
					currentSuccessCount: successful,
					suggestedAction: next,
					suggestedActionLabel:
						ACTION_TYPE_LABELS[next as ExecutionActionType] ?? next,
				});
				break; // one suggestion per client per render
			}
		}
	}

	return {
		clients: rows,
		metrics,
		needsAttention,
		expansionSuggestions,
	};
}
