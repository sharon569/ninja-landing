// Phase 16.1 — Telegram Bot API client.
// Raw fetch() calls — no npm dependency needed. The Bot API is simple REST.

import "server-only";

const API_BASE = "https://api.telegram.org/bot";

function getToken(): string {
	const token = process.env.TELEGRAM_BOT_TOKEN;
	if (!token) throw new Error("TELEGRAM_BOT_TOKEN not set");
	return token;
}

function getChatId(): string {
	const chatId = process.env.TELEGRAM_CHAT_ID;
	if (!chatId) throw new Error("TELEGRAM_CHAT_ID not set");
	return chatId;
}

// ─── Types ────────────────────────────────────────────────────

export interface InlineKeyboardButton {
	text: string;
	callback_data?: string;
	url?: string;
}

export type InlineKeyboard = InlineKeyboardButton[][];

interface TelegramResponse<T = unknown> {
	ok: boolean;
	description?: string;
	result?: T;
}

interface TelegramMessage {
	message_id: number;
	chat: { id: number };
	text?: string;
	date: number;
}

// ─── Send ─────────────────────────────────────────────────────

export async function sendMessage(
	text: string,
	opts?: {
		chatId?: string;
		keyboard?: InlineKeyboard;
		parseMode?: "HTML" | "Markdown";
		disablePreview?: boolean;
	},
): Promise<{ ok: boolean; messageId?: string; error?: string }> {
	const chatId = opts?.chatId || getChatId();
	const body: Record<string, unknown> = {
		chat_id: chatId,
		text: truncateMessage(text),
		parse_mode: opts?.parseMode ?? "HTML",
	};

	if (opts?.disablePreview) {
		body.link_preview_options = { is_disabled: true };
	}

	if (opts?.keyboard && opts.keyboard.length > 0) {
		body.reply_markup = { inline_keyboard: opts.keyboard };
	}

	return callApi<TelegramMessage>("sendMessage", body).then((res) => ({
		ok: res.ok,
		messageId: res.result?.message_id?.toString(),
		error: res.description,
	}));
}

export async function editMessage(
	messageId: string,
	text: string,
	opts?: {
		chatId?: string;
		keyboard?: InlineKeyboard;
	},
): Promise<{ ok: boolean; error?: string }> {
	const chatId = opts?.chatId || getChatId();
	const body: Record<string, unknown> = {
		chat_id: chatId,
		message_id: Number(messageId),
		text: truncateMessage(text),
		parse_mode: "HTML",
	};

	if (opts?.keyboard) {
		body.reply_markup = { inline_keyboard: opts.keyboard };
	}

	return callApi("editMessageText", body).then((res) => ({
		ok: res.ok,
		error: res.description,
	}));
}

export async function answerCallbackQuery(
	callbackQueryId: string,
	text?: string,
	opts?: { showAlert?: boolean },
): Promise<{ ok: boolean }> {
	const body: Record<string, unknown> = {
		callback_query_id: callbackQueryId,
	};
	if (text) body.text = text;
	if (opts?.showAlert) body.show_alert = true;

	return callApi("answerCallbackQuery", body);
}

// ─── Webhook Management ───────────────────────────────────────

export async function setWebhook(url: string): Promise<{ ok: boolean; description?: string }> {
	const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
	const body: Record<string, unknown> = { url };
	if (secret) body.secret_token = secret;

	return callApi("setWebhook", body);
}

export async function deleteWebhook(): Promise<{ ok: boolean }> {
	return callApi("deleteWebhook", {});
}

export async function getWebhookInfo(): Promise<{
	ok: boolean;
	result?: { url: string; has_custom_certificate: boolean; pending_update_count: number };
}> {
	return callApi("getWebhookInfo", {});
}

// ─── Keyboard Builder ─────────────────────────────────────────

export function kbd(buttons: InlineKeyboardButton[][]): InlineKeyboard {
	return buttons;
}

export function btn(text: string, callbackData: string): InlineKeyboardButton {
	return { text, callback_data: callbackData };
}

export function urlBtn(text: string, url: string): InlineKeyboardButton {
	return { text, url };
}

// ─── Internal ─────────────────────────────────────────────────

async function callApi<T = unknown>(
	method: string,
	body: Record<string, unknown>,
): Promise<TelegramResponse<T>> {
	const token = getToken();
	try {
		const res = await fetch(`${API_BASE}${token}/${method}`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
			cache: "no-store",
		});

		const data = (await res.json()) as TelegramResponse<T>;
		if (!data.ok) {
			console.warn(`[telegram] ${method} failed:`, data.description);
		}
		return data;
	} catch (err) {
		console.error(`[telegram] ${method} fetch error:`, (err as Error).message);
		return { ok: false, description: (err as Error).message };
	}
}

/** Telegram messages max out at 4096 characters. Truncate gracefully. */
function truncateMessage(text: string): string {
	if (text.length <= 4096) return text;
	return text.slice(0, 4080) + "\n\n…(truncated)";
}
