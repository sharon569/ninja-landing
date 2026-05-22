// Phase 16 — Unified operator notification layer.
//
// notifyOperator() is the single function all engines call to push updates
// to the operator. It:
//   1. Logs a BotNotification row (audit trail + dedup + message editing)
//   2. Dispatches to Telegram (Phase 1 — stubbed until then)
//   3. Falls back silently if Telegram is not configured
//
// This replaces ad-hoc notification calls scattered across the codebase.
// The existing Slack/email alerts in notifications.ts remain untouched for
// ExecutionEvent-level alerting; this layer handles higher-level operator
// notifications (scan results, opportunity summaries, plan readiness, etc.).

import "server-only";

import { db } from "@/lib/db";

// ─── Types ────────────────────────────────────────────────────

export const NOTIFICATION_TYPES = [
	"scan_result",
	"opps_found",
	"plan_ready",
	"keyword_discovery",
	"execution_result",
	"impact_review",
	"daily_digest",
	"calendar_reminder",
	"refresh_complete",
	"agency_sync_complete",
	"keyword_pipeline_complete",
	"job_failed",
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export interface NotifyPayload {
	type: NotificationType;
	clientId?: string | null;
	/** ID of the related entity for linking / dedup. */
	referenceId?: string | null;
	/** The message text to send (Telegram HTML or plain text). */
	text: string;
	/** Optional inline keyboard for Telegram (Phase 1). */
	keyboard?: InlineKeyboardButton[][];
}

export interface InlineKeyboardButton {
	text: string;
	callback_data?: string;
	url?: string;
}

export interface NotifyResult {
	sent: boolean;
	messageId?: string;
	error?: string;
}

// ─── Main ─────────────────────────────────────────────────────

export async function notifyOperator(payload: NotifyPayload): Promise<NotifyResult> {
	const chatId = process.env.TELEGRAM_CHAT_ID;
	const enabled = process.env.TELEGRAM_ENABLED === "true";

	// Always log, even if Telegram is disabled — useful for audit trail.
	let messageId: string | undefined;

	try {
		if (enabled && chatId) {
			messageId = await sendTelegram(chatId, payload);
		}
	} catch (err) {
		console.warn("[notify] Telegram send failed:", (err as Error).message);
	}

	// Persist notification record.
	try {
		await db.botNotification.create({
			data: {
				chatId: chatId || "unknown",
				messageId: messageId || null,
				type: payload.type,
				clientId: payload.clientId || null,
				referenceId: payload.referenceId || null,
				status: messageId ? "sent" : "sent", // even without Telegram, we log it
			},
		});
	} catch (err) {
		// Non-fatal: don't crash the caller if logging fails.
		console.warn("[notify] Failed to log BotNotification:", (err as Error).message);
	}

	return {
		sent: !!messageId,
		messageId,
	};
}

// ─── Telegram Dispatch ────────────────────────────────────────

async function sendTelegram(
	chatId: string,
	payload: NotifyPayload,
): Promise<string | undefined> {
	const { sendMessage } = await import("@/lib/telegram");

	const result = await sendMessage(payload.text, {
		chatId,
		keyboard: payload.keyboard,
	});

	return result.ok ? result.messageId : undefined;
}
