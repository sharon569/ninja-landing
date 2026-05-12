// Phase 13 — server-only notification helpers. Slack + Resend email.
//
// All channel calls are wrapped so a failed alert never crashes a server
// action. The caller (logExecutionEvent) records the outcome on the event row
// and moves on.
//
// SECURITY: Payloads are deliberately minimal. We never include the auth
// token, the full HTML before/after, or any user-provided secret. Sharon
// reviews diffs in-app; alerts are signposts, not full audit copies.

import "server-only";

export interface AlertPayload {
	clientName: string;
	clientHost: string;
	actionType?: string | null;
	targetUrl?: string | null;
	status: string;
	severity: "info" | "success" | "warning" | "error" | "critical";
	title: string;
	message?: string | null;
	link: string; // /clients/<id>/execution
}

export type AlertChannel = "slack" | "email" | "both" | "none";

export interface AlertConfig {
	enabled: boolean;
	channel: AlertChannel;
	slackWebhookUrl: string | null;
	emailTo: string | null;
	resendApiKey: string | null;
	includeSuccess: boolean;
	baseUrl: string; // for absolute links in alerts
}

export function readAlertConfig(): AlertConfig {
	const enabled = process.env.EXECUTION_ALERTS_ENABLED === "true";
	const rawChannel = (process.env.EXECUTION_ALERT_CHANNEL ?? "slack").toLowerCase();
	const channel: AlertChannel =
		rawChannel === "slack" || rawChannel === "email" || rawChannel === "both" || rawChannel === "none"
			? rawChannel
			: "slack";
	return {
		enabled,
		channel,
		slackWebhookUrl: process.env.SLACK_WEBHOOK_URL || null,
		emailTo: process.env.EXECUTION_ALERT_EMAIL || null,
		resendApiKey: process.env.RESEND_API_KEY || null,
		includeSuccess: process.env.EXECUTION_ALERT_SUCCESS === "true",
		baseUrl: process.env.PUBLIC_ANALYZER_URL || "https://seo.samp.ninja",
	};
}

// ─── Slack ──────────────────────────────────────────────────

export async function sendSlackAlert(
	cfg: AlertConfig,
	payload: AlertPayload,
): Promise<{ ok: boolean; error?: string }> {
	if (!cfg.slackWebhookUrl) return { ok: false, error: "no_slack_webhook" };
	const emoji = severityEmoji(payload.severity);
	const text =
		`${emoji} *${payload.title}*\n` +
		`*Client:* ${payload.clientName} (${payload.clientHost})\n` +
		(payload.actionType ? `*Action:* ${payload.actionType}\n` : "") +
		`*Status:* ${payload.status}\n` +
		(payload.targetUrl ? `*Target:* ${payload.targetUrl}\n` : "") +
		(payload.message ? `*Detail:* ${truncate(payload.message, 400)}\n` : "") +
		`*Open:* ${absLink(cfg, payload.link)}`;
	try {
		const res = await fetch(cfg.slackWebhookUrl, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ text }),
			cache: "no-store",
		});
		if (!res.ok) {
			const body = await res.text().catch(() => "");
			return { ok: false, error: `slack_${res.status}_${body.slice(0, 120)}` };
		}
		return { ok: true };
	} catch (err) {
		return { ok: false, error: `slack_fetch_${(err as Error).message}` };
	}
}

// ─── Email (Resend) ─────────────────────────────────────────

export async function sendEmailAlert(
	cfg: AlertConfig,
	payload: AlertPayload,
): Promise<{ ok: boolean; error?: string }> {
	if (!cfg.resendApiKey || !cfg.emailTo) return { ok: false, error: "no_email_config" };
	const subject = `[${payload.severity.toUpperCase()}] ${payload.title} · ${payload.clientName}`;
	const html =
		`<div style="font-family: -apple-system, sans-serif; font-size: 14px; color: #1a1a1a; max-width: 560px;">` +
		`<h2 style="margin: 0 0 12px;">${escapeHtml(payload.title)}</h2>` +
		`<p style="margin: 0 0 6px;"><b>Client:</b> ${escapeHtml(payload.clientName)} <span style="color:#666;">(${escapeHtml(payload.clientHost)})</span></p>` +
		(payload.actionType ? `<p style="margin: 0 0 6px;"><b>Action:</b> <code>${escapeHtml(payload.actionType)}</code></p>` : "") +
		`<p style="margin: 0 0 6px;"><b>Status:</b> ${escapeHtml(payload.status)}</p>` +
		(payload.targetUrl ? `<p style="margin: 0 0 6px;"><b>Target:</b> <a href="${escapeHtml(payload.targetUrl)}">${escapeHtml(payload.targetUrl)}</a></p>` : "") +
		(payload.message ? `<p style="margin: 12px 0; padding: 8px 12px; background: #f5f5f5; border-radius: 4px;">${escapeHtml(truncate(payload.message, 800))}</p>` : "") +
		`<p style="margin: 20px 0 0;"><a href="${escapeHtml(absLink(cfg, payload.link))}" style="display:inline-block; padding: 8px 14px; background: #ff2a3c; color: #fff; text-decoration: none; border-radius: 4px;">Open in Analyzer</a></p>` +
		`</div>`;

	try {
		const res = await fetch("https://api.resend.com/emails", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${cfg.resendApiKey}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				from: "NINJA Analyzer <alerts@samp.ninja>",
				to: cfg.emailTo,
				subject,
				html,
			}),
			cache: "no-store",
		});
		if (!res.ok) {
			const body = await res.text().catch(() => "");
			return { ok: false, error: `resend_${res.status}_${body.slice(0, 120)}` };
		}
		return { ok: true };
	} catch (err) {
		return { ok: false, error: `email_fetch_${(err as Error).message}` };
	}
}

// ─── Helpers ────────────────────────────────────────────────

function truncate(s: string, max: number): string {
	if (s.length <= max) return s;
	return s.slice(0, max) + "…";
}

function severityEmoji(s: AlertPayload["severity"]): string {
	switch (s) {
		case "critical":
			return ":rotating_light:";
		case "error":
			return ":x:";
		case "warning":
			return ":warning:";
		case "success":
			return ":white_check_mark:";
		default:
			return ":information_source:";
	}
}

function absLink(cfg: AlertConfig, link: string): string {
	if (/^https?:/i.test(link)) return link;
	return `${cfg.baseUrl}${link.startsWith("/") ? "" : "/"}${link}`;
}

function escapeHtml(s: string): string {
	return s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}
