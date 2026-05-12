// Phase 14B — Execution Rollout types (client-safe).
//
// Status is capability-based, not version-locked: a 0.3.0–0.3.6 plugin keeps
// working, the rollout dashboard just nudges the operator to upgrade. The
// only hard gates are the explicit per-client `executionEnabled` flag and
// the plugin reporting the capabilities it actually has (write_api_enabled,
// dry_run_supported, etc.) via /info.

import type { ExecutionReadiness } from "./execution";

export type ClientExecutionStatus =
	| "disabled"               // executionEnabled=false
	| "not_ready"              // plugin unreachable / version <MIN / token missing
	| "update_recommended"     // capabilities OK, version between MIN and RECOMMENDED
	| "needs_attention"        // executionEnabled=true but plugin disabled/broken, OR recent failures
	| "plugin_ready"           // capabilities OK, but execution not enabled yet
	| "pilot_enabled"          // executionEnabled=true, pilotMode=true
	| "execution_enabled";     // executionEnabled=true, pilotMode=false

export const CLIENT_STATUS_LABEL: Record<ClientExecutionStatus, string> = {
	disabled: "כבוי",
	not_ready: "לא מוכן",
	update_recommended: "מומלץ עדכון",
	needs_attention: "דורש טיפול",
	plugin_ready: "פלאגין מוכן",
	pilot_enabled: "Pilot",
	execution_enabled: "Execution פעיל",
};

export const CLIENT_STATUS_TONE: Record<ClientExecutionStatus, "good" | "warn" | "bad" | "neutral" | "mute"> = {
	disabled: "mute",
	not_ready: "bad",
	update_recommended: "warn",
	needs_attention: "bad",
	plugin_ready: "neutral",
	pilot_enabled: "warn",
	execution_enabled: "good",
};

export interface ClientRolloutRow {
	clientId: string;
	clientName: string;
	host: string;

	pluginVersion: string | null;
	pluginVersionOk: boolean;           // >=MIN
	pluginVersionRecommended: boolean;  // >=RECOMMENDED
	writeApiEnabled: boolean;
	dryRunSupported: boolean;
	pluginSupportedActions: string[];

	executionEnabled: boolean;
	executionPilotMode: boolean;
	allowedExecutionActions: string[];

	executionsCount: number;
	executedCount: number;
	failedCount: number;
	dryRunStaleCount: number;
	rollbackAvailableCount: number;
	finalizedCount: number;
	lastExecutedAt: string | null;       // ISO
	lastErrorMessage: string | null;

	pluginReachable: boolean;
	tokenPresent: boolean;

	status: ClientExecutionStatus;
	statusReasons: string[];             // human-readable, for tooltip / list
}

export interface AgencyExecutionMetrics {
	totalClients: number;
	clientsExecutionEnabled: number;
	clientsPilot: number;
	clientsUpdateRecommended: number;
	clientsNeedsAttention: number;
	executionsLast7d: number;
	failuresLast7d: number;
	dryRunStaleCount: number;
	rollbackAvailableCount: number;
	finalizedExecutions: number;
	dryRunSuccessRate: number;          // 0..1, last 30d
	executionSuccessRate: number;       // 0..1, last 30d
	rollbackRate: number;               // 0..1, last 30d (rolled_back / executed)
	staleRate: number;                  // 0..1, last 30d
}

export interface NeedsAttentionItem {
	id: string;                          // composite or eventId/actionId
	clientId: string;
	clientName: string;
	kind:
		| "failed_execution"
		| "dry_run_stale"
		| "dry_run_failed"
		| "rollback_available_aging"
		| "rollback_blocked_drift"
		| "plugin_unreachable"
		| "write_api_disabled"
		| "readiness_failed"
		| "execution_stuck"
		| "client_enabled_but_not_ready"
		| "plugin_update_recommended";
	title: string;
	detail: string | null;
	createdAt: string;                   // ISO
	links: { label: string; href: string }[];
}

// Suggested next action to unlock when a client has accumulated clean
// successful executions of a current action. Used by the rollout dashboard
// to nudge the operator — system NEVER auto-expands.
export interface ActionExpansionSuggestion {
	clientId: string;
	clientName: string;
	currentAction: string;               // e.g. yoast_title_update
	currentSuccessCount: number;
	suggestedAction: string;             // e.g. yoast_description_update
	suggestedActionLabel: string;
}

/** Convenience: derive the readiness flags into a status enum + reasons. */
export function deriveClientStatus(
	readiness: ExecutionReadiness,
	stats: {
		failedCount: number;
		dryRunStaleCount: number;
		rollbackAvailableCount: number;
	},
	pluginVersionRecommended: boolean,
): { status: ClientExecutionStatus; reasons: string[] } {
	const reasons: string[] = [];

	if (!readiness.executionEnabled) {
		return { status: "disabled", reasons: ["Execution disabled in client settings"] };
	}

	// Things that BLOCK any execution at all
	if (!readiness.tokenPresent) reasons.push("Missing token or baseUrl");
	if (!readiness.pluginReachable) reasons.push("Plugin unreachable");
	if (!readiness.pluginVersionOk) reasons.push(`Plugin version below minimum`);

	if (reasons.length) {
		return { status: "not_ready", reasons };
	}

	// Things that mean "supported but something specific is wrong right now"
	if (!readiness.writeApiEnabled) reasons.push("Write API disabled on plugin");
	if (!readiness.dryRunSupported) reasons.push("Dry run not supported by plugin");
	if (readiness.allowedActions.length === 0) reasons.push("No allowed actions selected");
	if (stats.failedCount > 0) reasons.push(`${stats.failedCount} recent failures`);
	if (stats.dryRunStaleCount > 0) reasons.push(`${stats.dryRunStaleCount} stale dry runs`);

	if (reasons.length) {
		return { status: "needs_attention", reasons };
	}

	// Plugin & client both healthy — distinguish pilot vs full execution
	const baseReasons: string[] = [];
	if (!pluginVersionRecommended) {
		baseReasons.push("Plugin version below recommended — update suggested");
	}

	if (readiness.pilotMode) {
		return {
			status: pluginVersionRecommended ? "pilot_enabled" : "update_recommended",
			reasons: [...baseReasons, "Pilot Mode active"],
		};
	}
	return {
		status: pluginVersionRecommended ? "execution_enabled" : "update_recommended",
		reasons: baseReasons,
	};
}
