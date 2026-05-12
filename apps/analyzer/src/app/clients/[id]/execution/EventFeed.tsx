"use client";

import { useTransition, useState } from "react";
import { Bell, Loader2, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import {
	eventTypeLabel,
	severityLabel,
	severityTone,
} from "@/lib/execution-events";
import { sendTestAlertAction } from "./actions";

interface FeedEvent {
	id: string;
	eventType: string;
	severity: string;
	title: string;
	message: string | null;
	createdAt: Date | string;
	notifiedAt: Date | string | null;
	notificationStatus: string | null;
	notificationChannel: string | null;
	metadata: string | null;
	executionAction?: {
		id: string;
		actionType: string | null;
		status: string | null;
		targetUrl: string | null;
	} | null;
}

function ago(d: Date | string | null | undefined): string {
	if (!d) return "—";
	const ms = Date.now() - new Date(d).getTime();
	const min = Math.floor(ms / 60_000);
	if (min < 1) return "עכשיו";
	if (min < 60) return `לפני ${min} דק׳`;
	const hr = Math.floor(min / 60);
	if (hr < 24) return `לפני ${hr} שע׳`;
	return `לפני ${Math.floor(hr / 24)} ימים`;
}

function notifBadge(status: string | null, channel: string | null): { label: string; tone: "good" | "warn" | "bad" | "neutral" | "mute" } {
	if (!status) return { label: "—", tone: "mute" };
	switch (status) {
		case "sent":
			return { label: channel ? `נשלח · ${channel}` : "נשלח", tone: "good" };
		case "partial":
			return { label: channel ? `חלקי · ${channel}` : "חלקי", tone: "warn" };
		case "failed":
			return { label: "שליחה נכשלה", tone: "bad" };
		case "no_channel":
			return { label: "בלי ערוץ", tone: "mute" };
		case "skipped_disabled":
			return { label: "alerts כבויים", tone: "mute" };
		case "skipped_severity":
			return { label: "לא דורש alert", tone: "mute" };
		case "skipped_dedupe":
			return { label: "duplicate suppressed", tone: "mute" };
		default:
			return { label: status, tone: "mute" };
	}
}

export function EventFeed({ clientId, events }: { clientId: string; events: FeedEvent[] }) {
	const [pending, startTransition] = useTransition();
	const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);

	function sendTest() {
		setMessage(null);
		startTransition(async () => {
			const r = await sendTestAlertAction(clientId);
			setMessage(
				r.ok ? { type: "ok", text: "התראת בדיקה נוצרה" } : { type: "err", text: r.error ?? "Test alert failed" },
			);
		});
	}

	return (
		<section className="space-y-3">
			<div className="flex items-baseline justify-between flex-wrap gap-3">
				<h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-ink-dim">
					<Bell className="w-4 h-4 text-gold" />
					Execution Events
					<span className="text-[10px] text-ink-mute font-mono">({events.length})</span>
				</h3>
				<div className="flex items-center gap-2">
					{message && (
						<span
							className={`inline-flex items-center gap-1 text-[11px] ${
								message.type === "ok" ? "text-go" : "text-blade"
							}`}
						>
							{message.type === "ok" ? (
								<CheckCircle2 className="w-3.5 h-3.5" />
							) : (
								<XCircle className="w-3.5 h-3.5" />
							)}
							{message.text}
						</span>
					)}
					<button
						type="button"
						onClick={sendTest}
						disabled={pending}
						className="inline-flex items-center gap-1.5 rounded-md border border-gold/30 bg-gold/10 hover:bg-gold/20 text-gold px-3 py-1.5 text-xs disabled:opacity-60"
					>
						{pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Bell className="w-3.5 h-3.5" />}
						שלח התראת בדיקה
					</button>
				</div>
			</div>
			{events.length === 0 ? (
				<div className="rounded-lg border border-dashed border-ninja-line bg-ninja-panel/40 px-5 py-6 text-center text-xs text-ink-mute">
					עוד אין אירועי Execution. הם יופיעו כאן ברגע שמתחילים Dry Runs ו-Executes.
				</div>
			) : (
				<ul className="rounded-lg border border-ninja-line bg-ninja-panel/40 divide-y divide-ninja-line">
					{events.map((e) => (
						<EventRow key={e.id} e={e} />
					))}
				</ul>
			)}
		</section>
	);
}

function EventRow({ e }: { e: FeedEvent }) {
	const tone = severityTone(e.severity);
	const toneIcon =
		tone === "good" ? (
			<CheckCircle2 className="w-3.5 h-3.5 text-go" />
		) : tone === "warn" ? (
			<AlertTriangle className="w-3.5 h-3.5 text-gold" />
		) : tone === "bad" ? (
			<XCircle className="w-3.5 h-3.5 text-blade" />
		) : (
			<Bell className="w-3.5 h-3.5 text-ink-mute" />
		);
	const nb = notifBadge(e.notificationStatus, e.notificationChannel);
	const nbCls =
		nb.tone === "good"
			? "bg-go/10 text-go border-go/30"
			: nb.tone === "warn"
				? "bg-gold/10 text-gold border-gold/30"
				: nb.tone === "bad"
					? "bg-blade/10 text-blade border-blade/30"
					: "bg-ninja-raised text-ink-mute border-ninja-line";

	const meta = (() => {
		if (!e.metadata) return null;
		try {
			return JSON.parse(e.metadata) as Record<string, unknown>;
		} catch {
			return null;
		}
	})();
	const targetUrl = (meta?.targetUrl as string | undefined) ?? e.executionAction?.targetUrl ?? null;

	return (
		<li className="flex items-start gap-3 px-4 py-2.5">
			<span className="shrink-0 mt-1">{toneIcon}</span>
			<div className="flex-1 min-w-0">
				<div className="flex items-baseline gap-2 flex-wrap">
					<span className="text-[10px] font-bold tracking-wider uppercase text-ink-mute">
						{eventTypeLabel(e.eventType)}
					</span>
					<span className="text-[10px] text-ink-mute">· {severityLabel(e.severity)}</span>
					<span className={`text-[10px] rounded-full border px-2 py-0.5 ${nbCls}`}>{nb.label}</span>
				</div>
				<div className="text-sm text-ink mt-0.5">{e.title}</div>
				{e.message && <div className="text-xs text-ink-dim mt-0.5 whitespace-pre-line">{e.message}</div>}
				{targetUrl && (
					<div className="text-[11px] text-ink-mute mt-0.5 font-mono break-all" dir="ltr">
						{targetUrl}
					</div>
				)}
			</div>
			<div className="shrink-0 text-[10px] text-ink-mute whitespace-nowrap">{ago(e.createdAt)}</div>
		</li>
	);
}
