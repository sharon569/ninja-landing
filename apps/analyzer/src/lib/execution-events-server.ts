// Phase 13 — server-only event logger + alert dispatcher.

import "server-only";
import { db } from "./db";
import {
	type ExecutionEventType,
	type ExecutionEventSeverity,
	ALWAYS_ALERT_EVENT_TYPES,
	SUCCESS_EVENT_TYPES,
	ALERT_DEDUPE_MINUTES,
} from "./execution-events";
import {
	readAlertConfig,
	sendSlackAlert,
	sendEmailAlert,
	type AlertPayload,
} from "./notifications";

export interface LogEventArgs {
	clientId: string;
	executionActionId?: string | null;
	eventType: ExecutionEventType;
	severity?: ExecutionEventSeverity;
	title: string;
	message?: string | null;
	metadata?: Record<string, unknown>;
	// Skip alert dispatch — set true when we just want a feed row (e.g. info-only
	// signals or the agency dashboard's own derived events).
	suppressAlert?: boolean;
}

function sanitizeMetadata(meta: Record<string, unknown> | undefined): string | null {
	if (!meta) return null;
	const clone: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(meta)) {
		// Defense in depth: filter anything that looks like a secret.
		if (/token|secret|password|api[_-]?key/i.test(k)) continue;
		// Trim long strings — alerts are signposts, not full dumps.
		if (typeof v === "string" && v.length > 800) clone[k] = v.slice(0, 800) + "…";
		else clone[k] = v;
	}
	return JSON.stringify(clone);
}

/**
 * Append-only event logger. Always writes the row even if the alert
 * dispatch fails or is disabled — the row carries the disposition. Never
 * throws to the caller; observability code must never crash the engine.
 */
export async function logExecutionEvent(args: LogEventArgs): Promise<void> {
	const severity: ExecutionEventSeverity = args.severity ?? defaultSeverity(args.eventType);
	let row: { id: string } | null = null;
	try {
		row = await db.executionEvent.create({
			data: {
				clientId: args.clientId,
				executionActionId: args.executionActionId ?? null,
				eventType: args.eventType,
				severity,
				title: args.title,
				message: args.message ?? null,
				metadata: sanitizeMetadata(args.metadata),
			},
			select: { id: true },
		});
	} catch (err) {
		// Logging the logger's failure to stderr is the best we can do here.
		console.error("[execution-events] failed to write row:", err);
		return;
	}

	if (args.suppressAlert) {
		await markNotificationStatus(row.id, "skipped_disabled", null);
		return;
	}

	const cfg = readAlertConfig();
	if (!cfg.enabled) {
		await markNotificationStatus(row.id, "skipped_disabled", null);
		return;
	}
	if (cfg.channel === "none") {
		await markNotificationStatus(row.id, "no_channel", null);
		return;
	}

	const isSuccess = SUCCESS_EVENT_TYPES.includes(args.eventType);
	const isAlways = ALWAYS_ALERT_EVENT_TYPES.includes(args.eventType);
	if (isSuccess && !cfg.includeSuccess) {
		await markNotificationStatus(row.id, "skipped_severity", null);
		return;
	}
	if (!isAlways && !isSuccess) {
		// Info-only types: drop on the floor for alerts; still recorded in feed.
		await markNotificationStatus(row.id, "skipped_severity", null);
		return;
	}

	// Dedupe — same (clientId, executionActionId|null, eventType) within window
	const dedupeSince = new Date(Date.now() - ALERT_DEDUPE_MINUTES * 60_000);
	const recent = await db.executionEvent.findFirst({
		where: {
			id: { not: row.id },
			clientId: args.clientId,
			executionActionId: args.executionActionId ?? null,
			eventType: args.eventType,
			notificationStatus: { in: ["sent", "partial"] },
			notifiedAt: { gte: dedupeSince },
		},
		select: { id: true },
	});
	if (recent) {
		await markNotificationStatus(row.id, "skipped_dedupe", null);
		return;
	}

	// Build the alert payload — minimal, no secrets.
	const client = await db.client.findUnique({
		where: { id: args.clientId },
		select: { name: true, baseUrl: true },
	});
	const host = (() => {
		try {
			return new URL(client?.baseUrl ?? "").host || client?.baseUrl || "";
		} catch {
			return client?.baseUrl ?? "";
		}
	})();
	const actionType = (args.metadata?.actionType as string | undefined) ?? null;
	const targetUrl = (args.metadata?.targetUrl as string | undefined) ?? null;
	const status = (args.metadata?.status as string | undefined) ?? severity;
	const payload: AlertPayload = {
		clientName: client?.name ?? "Unknown",
		clientHost: host,
		actionType,
		targetUrl,
		status,
		severity,
		title: args.title,
		message: args.message,
		link: `/clients/${args.clientId}/execution`,
	};

	const wantSlack = cfg.channel === "slack" || cfg.channel === "both";
	const wantEmail = cfg.channel === "email" || cfg.channel === "both";
	const results: { channel: string; ok: boolean; error?: string }[] = [];
	if (wantSlack) {
		const r = await sendSlackAlert(cfg, payload);
		results.push({ channel: "slack", ...r });
	}
	if (wantEmail) {
		const r = await sendEmailAlert(cfg, payload);
		results.push({ channel: "email", ...r });
	}

	const sentChannels = results.filter((r) => r.ok).map((r) => r.channel);
	const failedChannels = results.filter((r) => !r.ok);
	let status_:
		| "sent"
		| "partial"
		| "failed"
		| "no_channel" = sentChannels.length > 0 && failedChannels.length === 0
		? "sent"
		: sentChannels.length > 0
			? "partial"
			: results.length === 0
				? "no_channel"
				: "failed";

	const errorNote = failedChannels.length
		? failedChannels.map((r) => `${r.channel}: ${r.error}`).join("; ")
		: null;

	await db.executionEvent.update({
		where: { id: row.id },
		data: {
			notifiedAt: new Date(),
			notificationStatus: status_,
			notificationChannel: sentChannels.join(",") || null,
			message:
				errorNote && args.message
					? `${args.message}\n[alert] ${errorNote}`
					: errorNote
						? `[alert] ${errorNote}`
						: args.message ?? null,
		},
	});
}

async function markNotificationStatus(id: string, status: string, channel: string | null) {
	try {
		await db.executionEvent.update({
			where: { id },
			data: { notificationStatus: status, notificationChannel: channel },
		});
	} catch (err) {
		console.error("[execution-events] failed to mark notification status:", err);
	}
}

function defaultSeverity(eventType: ExecutionEventType): ExecutionEventSeverity {
	switch (eventType) {
		case "execution_succeeded":
		case "rollback_succeeded":
			return "success";
		case "dry_run_completed":
			return "info";
		case "dry_run_failed":
		case "readiness_failed":
		case "rollback_failed":
		case "rollback_blocked_drift":
			return "error";
		case "dry_run_stale":
		case "plugin_unreachable":
		case "write_api_disabled":
			return "warning";
		case "execution_started":
			return "info";
		case "execution_failed":
		case "execution_stuck":
			return "critical";
		case "test_alert":
			return "info";
		default:
			return "info";
	}
}

// ─── Public read APIs for the feed UIs ─────────────────────

export async function listClientEvents(clientId: string, limit = 20) {
	return await db.executionEvent.findMany({
		where: { clientId },
		orderBy: { createdAt: "desc" },
		take: limit,
		include: {
			executionAction: {
				select: {
					id: true,
					actionType: true,
					status: true,
					targetUrl: true,
				},
			},
		},
	});
}

export async function listAgencyEvents(limit = 10) {
	return await db.executionEvent.findMany({
		orderBy: { createdAt: "desc" },
		take: limit,
		include: {
			client: { select: { id: true, name: true, baseUrl: true } },
			executionAction: {
				select: { id: true, actionType: true, status: true, targetUrl: true },
			},
		},
	});
}

/**
 * Manual test-alert trigger. Always logs an event and respects env gating
 * the same way as a real event would — so Sharon can validate his Slack /
 * email config end-to-end without touching a real ExecutionAction.
 */
export async function sendTestAlert(clientId: string, actor: string) {
	await logExecutionEvent({
		clientId,
		eventType: "test_alert",
		severity: "info",
		title: "התראת בדיקה",
		message: `התראת בדיקה ידנית שהופעלה ע״י ${actor}.`,
		metadata: { actor, status: "test" },
		suppressAlert: false,
	});
}
