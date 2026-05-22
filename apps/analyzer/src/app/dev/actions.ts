"use server";

import { db } from "@/lib/db";
import { enqueueJob, drainJobs, wakeWorker } from "@/lib/jobs-server";
import { notifyOperator } from "@/lib/notify";
import type { PipelineRunType } from "@/lib/jobs";

// ─── Test client ──────────────────────────────────────────────

const TEST_CLIENT_NAME = "🧪 Test Client (Dev)";
// Points to the mock plugin endpoint within this app.
// The PluginClient will append /wp-json/aseo/v1/{info,scan,sites} to this.
const TEST_CLIENT_BASE_URL_FALLBACK = "https://test.dev.ninja.local";

function getTestBaseUrl(): string {
	const publicUrl = process.env.PUBLIC_ANALYZER_URL;
	if (publicUrl) return `${publicUrl}/api/mock/plugin`;
	// On Vercel preview, VERCEL_URL is set automatically
	const vercelUrl = process.env.VERCEL_URL;
	if (vercelUrl) return `https://${vercelUrl}/api/mock/plugin`;
	return TEST_CLIENT_BASE_URL_FALLBACK;
}

/** Get or create a test client that's clearly separated from real clients. */
export async function getOrCreateTestClient(): Promise<{
	id: string;
	name: string;
	baseUrl: string;
}> {
	// Find existing test client by name (baseUrl may have been updated to mock)
	const existing = await db.client.findFirst({
		where: { name: TEST_CLIENT_NAME },
		select: { id: true, name: true, baseUrl: true },
	});

	const mockUrl = getTestBaseUrl();

	if (existing) {
		// Update baseUrl to point to current mock endpoint if it changed
		if (existing.baseUrl !== mockUrl) {
			await db.client.update({
				where: { id: existing.id },
				data: { baseUrl: mockUrl },
			});
		}
		return { ...existing, baseUrl: mockUrl };
	}

	const created = await db.client.create({
		data: {
			name: TEST_CLIENT_NAME,
			baseUrl: mockUrl,
			token: "test-token-dev-only",
			status: "paused", // paused so cron never touches it
			automationEnabled: false,
			executionEnabled: false,
		},
		select: { id: true, name: true, baseUrl: true },
	});

	return created;
}

// ─── Job queue actions ────────────────────────────────────────

export async function enqueueTestJob(
	type: PipelineRunType,
): Promise<{ id: string; alreadyQueued: boolean }> {
	const client = await getOrCreateTestClient();
	return enqueueJob(type, client.id, { test: true }, "ui");
}

export async function drainJobsAction(): Promise<{
	processed: number;
	succeeded: number;
	failed: number;
	skipped: number;
}> {
	return drainJobs();
}

export async function getJobQueue() {
	const jobs = await db.pipelineRun.findMany({
		orderBy: { createdAt: "desc" },
		take: 20,
		include: {
			client: { select: { name: true } },
		},
	});
	return jobs;
}

// ─── Notification actions ─────────────────────────────────────

export async function sendTestNotification(): Promise<{
	sent: boolean;
	messageId?: string;
	error?: string;
}> {
	const client = await getOrCreateTestClient();
	return notifyOperator({
		type: "scan_result",
		clientId: client.id,
		text:
			"<b>🧪 Test Notification</b>\n\n" +
			`Client: ${TEST_CLIENT_NAME}\n` +
			`Time: ${new Date().toLocaleString("he-IL", { timeZone: "Asia/Jerusalem" })}\n\n` +
			"If you see this in Telegram, notifications are working!",
	});
}

export async function getNotificationLog() {
	const notifications = await db.botNotification.findMany({
		orderBy: { sentAt: "desc" },
		take: 20,
	});
	return notifications;
}

// ─── Config check ─────────────────────────────────────────────

export async function getDevConfig() {
	return {
		telegramEnabled: process.env.TELEGRAM_ENABLED === "true",
		telegramBotToken: process.env.TELEGRAM_BOT_TOKEN ? "✓ set" : "✗ missing",
		telegramChatId: process.env.TELEGRAM_CHAT_ID || "✗ missing",
		telegramAllowedUsers: process.env.TELEGRAM_ALLOWED_USER_IDS || "✗ missing",
		telegramWebhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET ? "✓ set" : "✗ missing",
		cronSecret: process.env.CRON_SECRET ? "✓ set" : "✗ missing",
		publicUrl: process.env.PUBLIC_ANALYZER_URL || "not set",
		anthropicKey: process.env.ANTHROPIC_API_KEY ? "✓ set" : "✗ missing",
		psiEnabled: process.env.PSI_ENABLED === "true",
		psiKey: process.env.PSI_API_KEY ? "✓ set" : "✗ missing",
	};
}
