// Phase 16.1 — Telegram Bot webhook endpoint.
//
// Receives updates from Telegram when the operator sends commands or taps
// inline keyboard buttons. Validates the secret token and allowed user IDs,
// then dispatches to the command router.
//
// Security:
//   1. X-Telegram-Bot-Api-Secret-Token header must match TELEGRAM_WEBHOOK_SECRET
//   2. message.from.id must be in TELEGRAM_ALLOWED_USER_IDS
//   3. All commands are read-only in Phase 1

import { NextResponse, type NextRequest } from "next/server";
import { sendMessage, answerCallbackQuery } from "@/lib/telegram";
import { handleCommand, handleCallback } from "@/lib/telegram-commands";

export const dynamic = "force-dynamic";

// ─── Telegram Update Types ────────────────────────────────────

interface TelegramUser {
	id: number;
	first_name: string;
	username?: string;
}

interface TelegramChat {
	id: number;
	type: string;
}

interface TelegramMessage {
	message_id: number;
	from?: TelegramUser;
	chat: TelegramChat;
	text?: string;
	date: number;
}

interface TelegramCallbackQuery {
	id: string;
	from: TelegramUser;
	message?: TelegramMessage;
	data?: string;
}

interface TelegramUpdate {
	update_id: number;
	message?: TelegramMessage;
	callback_query?: TelegramCallbackQuery;
}

// ─── Auth ─────────────────────────────────────────────────────

function validateSecret(req: NextRequest): boolean {
	const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
	if (!secret) return true; // No secret configured = skip check
	const header = req.headers.get("x-telegram-bot-api-secret-token");
	return header === secret;
}

function isAllowedUser(userId: number): boolean {
	const allowed = process.env.TELEGRAM_ALLOWED_USER_IDS;
	if (!allowed) return true; // Not configured = allow all
	const ids = allowed.split(",").map((s) => s.trim());
	return ids.includes(String(userId));
}

// ─── Handler ──────────────────────────────────────────────────

export async function POST(req: NextRequest) {
	// Validate webhook secret
	if (!validateSecret(req)) {
		return NextResponse.json({ error: "unauthorized" }, { status: 401 });
	}

	let update: TelegramUpdate;
	try {
		update = (await req.json()) as TelegramUpdate;
	} catch {
		return NextResponse.json({ error: "invalid json" }, { status: 400 });
	}

	// Handle text messages
	if (update.message?.text) {
		const userId = update.message.from?.id;
		if (userId && !isAllowedUser(userId)) {
			await sendMessage("⛔ אין לך הרשאה להשתמש בבוט זה.", {
				chatId: String(update.message.chat.id),
			});
			return ok();
		}

		try {
			const result = await handleCommand(update.message.text);
			await sendMessage(result.text, {
				chatId: String(update.message.chat.id),
				keyboard: result.keyboard,
			});
		} catch (err) {
			console.error("[telegram/webhook] command error:", err);
			await sendMessage(
				`❌ שגיאה: <code>${esc((err as Error).message)}</code>`,
				{ chatId: String(update.message.chat.id) },
			);
		}

		return ok();
	}

	// Handle callback queries (button clicks)
	if (update.callback_query) {
		const userId = update.callback_query.from.id;
		if (!isAllowedUser(userId)) {
			await answerCallbackQuery(update.callback_query.id, "⛔ אין הרשאה");
			return ok();
		}

		const data = update.callback_query.data;
		if (!data) {
			await answerCallbackQuery(update.callback_query.id);
			return ok();
		}

		try {
			const result = await handleCallback(data);
			await answerCallbackQuery(update.callback_query.id);

			if (result) {
				const chatId = String(update.callback_query.message?.chat.id || process.env.TELEGRAM_CHAT_ID);
				await sendMessage(result.text, {
					chatId,
					keyboard: result.keyboard,
				});
			}
		} catch (err) {
			console.error("[telegram/webhook] callback error:", err);
			await answerCallbackQuery(update.callback_query.id, "❌ שגיאה");
		}

		return ok();
	}

	// Unknown update type — ignore
	return ok();
}

function ok() {
	return NextResponse.json({ ok: true });
}

function esc(s: string): string {
	return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
