"use client";

import { useState, useTransition, useEffect } from "react";
import {
	enqueueTestJob,
	drainJobsAction,
	sendTestNotification,
	getJobQueue,
	getNotificationLog,
	getDevConfig,
} from "./actions";
import type { PipelineRunType } from "@/lib/jobs";

// ─── Job Queue Panel ──────────────────────────────────────────

function JobQueuePanel() {
	const [jobs, setJobs] = useState<Awaited<ReturnType<typeof getJobQueue>>>([]);
	const [pending, startTransition] = useTransition();
	const [lastAction, setLastAction] = useState("");

	useEffect(() => {
		refresh();
		const interval = setInterval(() => {
			getJobQueue().then(setJobs);
		}, 3000);
		return () => clearInterval(interval);
	}, []);

	function refresh() {
		startTransition(async () => {
			const result = await getJobQueue();
			setJobs(result);
			setLastAction("Refreshed");
		});
	}

	function enqueue(type: PipelineRunType) {
		startTransition(async () => {
			const result = await enqueueTestJob(type);
			setLastAction(
				result.alreadyQueued
					? `Already queued (${result.id.slice(0, 8)})`
					: `Enqueued ${type} (${result.id.slice(0, 8)})`,
			);
			const updated = await getJobQueue();
			setJobs(updated);
		});
	}

	function drain() {
		startTransition(async () => {
			setLastAction("Draining... (may take up to 60s)");
			const result = await drainJobsAction();
			setLastAction(
				`Drained: ${result.processed} processed, ${result.succeeded} ok, ${result.failed} failed, ${result.skipped} skipped`,
			);
			const updated = await getJobQueue();
			setJobs(updated);
		});
	}

	return (
		<section className="rounded-xl border border-ninja-line bg-ninja-card p-5">
			<h2 className="text-lg font-bold text-ink mb-3">Job Queue (PipelineRun)</h2>

			<div className="flex flex-wrap gap-2 mb-4">
				<button onClick={refresh} disabled={pending} className="dev-btn">
					Refresh
				</button>
				<button onClick={() => enqueue("full_refresh")} disabled={pending} className="dev-btn dev-btn-blue">
					Enqueue: full_refresh
				</button>
				<button onClick={() => enqueue("scan")} disabled={pending} className="dev-btn dev-btn-blue">
					Enqueue: scan
				</button>
				<button onClick={() => enqueue("gsc_sync")} disabled={pending} className="dev-btn dev-btn-blue">
					Enqueue: gsc_sync
				</button>
				<button onClick={() => enqueue("keyword_refresh")} disabled={pending} className="dev-btn dev-btn-blue">
					Enqueue: keyword_refresh
				</button>
				<button onClick={drain} disabled={pending} className="dev-btn dev-btn-green">
					Drain Jobs
				</button>
			</div>

			{lastAction && (
				<p className="text-xs text-gold mb-3 font-mono">{lastAction}</p>
			)}

			{pending && <p className="text-xs text-ink-mute animate-pulse mb-2">Working...</p>}

			<div className="overflow-x-auto">
				<table className="w-full text-xs">
					<thead>
						<tr className="text-ink-mute border-b border-ninja-line">
							<th className="text-start py-1.5 px-2">ID</th>
							<th className="text-start py-1.5 px-2">Type</th>
							<th className="text-start py-1.5 px-2">Status</th>
							<th className="text-start py-1.5 px-2">Client</th>
							<th className="text-start py-1.5 px-2">Triggered By</th>
							<th className="text-start py-1.5 px-2">Created</th>
							<th className="text-start py-1.5 px-2">Error</th>
						</tr>
					</thead>
					<tbody>
						{jobs.map((job) => (
							<tr key={job.id} className="border-b border-ninja-line/50 hover:bg-white/[0.02]">
								<td className="py-1.5 px-2 font-mono text-ink-dim">{job.id.slice(0, 8)}</td>
								<td className="py-1.5 px-2">{job.type}</td>
								<td className="py-1.5 px-2">
									<StatusBadge status={job.status} />
								</td>
								<td className="py-1.5 px-2 text-ink-dim">{job.client?.name || "—"}</td>
								<td className="py-1.5 px-2 text-ink-dim">{job.triggeredBy}</td>
								<td className="py-1.5 px-2 text-ink-dim">{new Date(job.createdAt).toLocaleTimeString("he-IL")}</td>
								<td className="py-1.5 px-2 text-blade truncate max-w-[200px]">{job.error || ""}</td>
							</tr>
						))}
						{jobs.length === 0 && (
							<tr>
								<td colSpan={7} className="py-4 text-center text-ink-mute">
									No jobs yet. Click Refresh or Enqueue one.
								</td>
							</tr>
						)}
					</tbody>
				</table>
			</div>
		</section>
	);
}

// ─── Notification Panel ───────────────────────────────────────

function NotificationPanel() {
	const [notifications, setNotifications] = useState<Awaited<ReturnType<typeof getNotificationLog>>>([]);
	const [pending, startTransition] = useTransition();
	const [lastAction, setLastAction] = useState("");

	useEffect(() => { refresh(); }, []);

	function refresh() {
		startTransition(async () => {
			const result = await getNotificationLog();
			setNotifications(result);
			setLastAction("Refreshed");
		});
	}

	function sendTest() {
		startTransition(async () => {
			const result = await sendTestNotification();
			setLastAction(
				result.sent
					? `Sent! messageId=${result.messageId}`
					: `Not sent: ${result.error || "Telegram disabled or not configured"}`,
			);
			const updated = await getNotificationLog();
			setNotifications(updated);
		});
	}

	return (
		<section className="rounded-xl border border-ninja-line bg-ninja-card p-5">
			<h2 className="text-lg font-bold text-ink mb-3">Notifications (BotNotification)</h2>

			<div className="flex flex-wrap gap-2 mb-4">
				<button onClick={refresh} disabled={pending} className="dev-btn">
					Refresh
				</button>
				<button onClick={sendTest} disabled={pending} className="dev-btn dev-btn-gold">
					Send Test Notification
				</button>
			</div>

			{lastAction && (
				<p className="text-xs text-gold mb-3 font-mono">{lastAction}</p>
			)}

			{pending && <p className="text-xs text-ink-mute animate-pulse mb-2">Working...</p>}

			<div className="overflow-x-auto">
				<table className="w-full text-xs">
					<thead>
						<tr className="text-ink-mute border-b border-ninja-line">
							<th className="text-start py-1.5 px-2">ID</th>
							<th className="text-start py-1.5 px-2">Type</th>
							<th className="text-start py-1.5 px-2">Status</th>
							<th className="text-start py-1.5 px-2">Chat ID</th>
							<th className="text-start py-1.5 px-2">Message ID</th>
							<th className="text-start py-1.5 px-2">Sent At</th>
						</tr>
					</thead>
					<tbody>
						{notifications.map((n) => (
							<tr key={n.id} className="border-b border-ninja-line/50 hover:bg-white/[0.02]">
								<td className="py-1.5 px-2 font-mono text-ink-dim">{n.id.slice(0, 8)}</td>
								<td className="py-1.5 px-2">{n.type}</td>
								<td className="py-1.5 px-2">
									<StatusBadge status={n.status} />
								</td>
								<td className="py-1.5 px-2 text-ink-dim">{n.chatId?.slice(0, 12) || "—"}</td>
								<td className="py-1.5 px-2 font-mono text-ink-dim">{n.messageId || "—"}</td>
								<td className="py-1.5 px-2 text-ink-dim">{new Date(n.sentAt).toLocaleTimeString("he-IL")}</td>
							</tr>
						))}
						{notifications.length === 0 && (
							<tr>
								<td colSpan={6} className="py-4 text-center text-ink-mute">
									No notifications yet.
								</td>
							</tr>
						)}
					</tbody>
				</table>
			</div>
		</section>
	);
}

// ─── Config Panel ─────────────────────────────────────────────

function ConfigPanel() {
	const [config, setConfig] = useState<Awaited<ReturnType<typeof getDevConfig>> | null>(null);
	const [pending, startTransition] = useTransition();

	useEffect(() => { load(); }, []);

	function load() {
		startTransition(async () => {
			const result = await getDevConfig();
			setConfig(result);
		});
	}

	return (
		<section className="rounded-xl border border-ninja-line bg-ninja-card p-5">
			<h2 className="text-lg font-bold text-ink mb-3">Environment Config</h2>

			<button onClick={load} disabled={pending} className="dev-btn mb-4">
				Load Config
			</button>

			{config && (
				<div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs font-mono">
					{Object.entries(config).map(([key, val]) => (
						<div key={key} className="contents">
							<span className="text-ink-dim">{key}</span>
							<span className={String(val).includes("✗") ? "text-blade" : "text-go"}>
								{String(val)}
							</span>
						</div>
					))}
				</div>
			)}
		</section>
	);
}

// ─── Helpers ──────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
	const colors: Record<string, string> = {
		queued: "bg-gold/20 text-gold",
		running: "bg-gold/20 text-gold",
		success: "bg-go/20 text-go",
		failed: "bg-blade/20 text-blade",
		sent: "bg-go/20 text-go",
		edited: "bg-gold/20 text-gold",
		expired: "bg-ink-mute/20 text-ink-mute",
	};
	return (
		<span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${colors[status] || "bg-ink-mute/20 text-ink-mute"}`}>
			{status}
		</span>
	);
}

// ─── Main ─────────────────────────────────────────────────────

export default function DevPanel() {
	return (
		<div className="space-y-6">
			<ConfigPanel />
			<JobQueuePanel />
			<NotificationPanel />
		</div>
	);
}
