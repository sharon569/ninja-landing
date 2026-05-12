"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
	CheckCircle2,
	XCircle,
	AlertTriangle,
	Loader2,
	Plug,
	Settings,
} from "lucide-react";
import type { ExecutionReadiness } from "@/lib/execution";
import { testWriteApi } from "./actions";

const WARNING_LABELS: Record<string, string> = {
	missing_token_or_baseUrl: "חסר Token או Base URL בפרופיל הלקוח",
	execution_disabled_for_client: "Execution כבוי בהגדרות הלקוח",
	no_allowed_actions_selected: "לא נבחרו Allowed Actions",
	plugin_unreachable: "הפלאגין לא נגיש",
	"plugin_version_below_0.3.0": "גרסת הפלאגין מתחת ל-0.3.0",
	write_api_disabled_on_plugin: "Write API כבוי באתר WP (kill switch)",
	dry_run_not_supported_by_plugin: "Dry Run לא נתמך בפלאגין",
	client_not_found: "לקוח לא נמצא",
};

function fmtWarning(w: string): string {
	for (const [k, l] of Object.entries(WARNING_LABELS)) {
		if (w === k || w.startsWith(`${k}:`)) {
			const tail = w.slice(k.length + 1).trim();
			return tail ? `${l} (${tail})` : l;
		}
	}
	return w;
}

export function ReadinessPanel({
	clientId,
	initial,
}: {
	clientId: string;
	initial: ExecutionReadiness;
}) {
	const [readiness, setReadiness] = useState(initial);
	const [pending, startTransition] = useTransition();
	const [probeError, setProbeError] = useState<string | null>(null);

	function refresh() {
		setProbeError(null);
		startTransition(async () => {
			const r = await testWriteApi(clientId);
			if (r.ok && r.readiness) setReadiness(r.readiness);
			else setProbeError(r.error ?? "Probe failed");
		});
	}

	return (
		<div className="rounded-xl border border-ninja-line bg-ninja-panel/60 p-5 space-y-4">
			<div className="flex items-baseline justify-between gap-3 flex-wrap">
				<div>
					<h2 className="font-display text-lg text-ink flex items-center gap-2">
						<Plug className="w-4 h-4 text-gold" />
						Execution Readiness
					</h2>
					<p className="text-xs text-ink-mute mt-0.5">
						מה צריך להיות פעיל כדי שאפשר יהיה לבצע שינוי חי באתר הזה.
					</p>
				</div>
				<div className="flex items-center gap-2">
					<OverallPill ready={readiness.overallReady} />
					<button
						type="button"
						onClick={refresh}
						disabled={pending}
						className="inline-flex items-center gap-1.5 rounded-md border border-gold/30 bg-gold/10 hover:bg-gold/20 text-gold px-3 py-1.5 text-xs disabled:opacity-60"
					>
						{pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plug className="w-3.5 h-3.5" />}
						בדוק חיבור Write API
					</button>
					<Link
						href={`/clients/${clientId}/settings`}
						className="inline-flex items-center gap-1.5 rounded-md border border-ninja-line bg-ninja-panel/60 hover:bg-ninja-raised text-ink-dim px-3 py-1.5 text-xs"
					>
						<Settings className="w-3.5 h-3.5" />
						הגדרות
					</Link>
				</div>
			</div>

			{probeError && (
				<div className="rounded-md border border-blade/30 bg-blade/10 text-blade text-xs px-3 py-2">
					שגיאה בבדיקה: {probeError}
				</div>
			)}

			{/* Status grid */}
			<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 text-xs">
				<StatusRow ok={readiness.executionEnabled} label="Execution Enabled" />
				<StatusRow ok={!readiness.pilotMode} label="Pilot Mode כבוי" hintWhenFalse="Pilot Mode פעיל" />
				<StatusRow ok={readiness.tokenPresent} label="Token + Base URL" />
				<StatusRow ok={readiness.pluginReachable} label="פלאגין נגיש" />
				<StatusRow
					ok={readiness.pluginVersionOk}
					label={`גרסה ≥ 0.3.0`}
					hintWhenFalse={readiness.pluginVersion ? `נמצא v${readiness.pluginVersion}` : "לא ידוע"}
				/>
				<StatusRow ok={readiness.writeApiEnabled} label="Write API פעיל בפלאגין" />
				<StatusRow ok={readiness.dryRunSupported} label="Dry Run נתמך" />
				<StatusRow ok={readiness.yoastActive} label="Yoast פעיל" hintWhenFalse="חסר עבור Yoast title/desc" />
				<StatusRow
					ok={readiness.allowedActions.length > 0}
					label={`Allowed actions (${readiness.allowedActions.length})`}
					hintWhenFalse="הגדר ב-Settings"
				/>
			</div>

			{/* Allowed actions detail */}
			{readiness.allowedActions.length > 0 && (
				<div className="text-xs text-ink-dim">
					<span className="text-ink-mute">מורשים: </span>
					{readiness.allowedActions.map((a) => (
						<span
							key={a}
							className="inline-block mr-1.5 mb-1 rounded-full bg-go/10 text-go border border-go/30 px-2 py-0.5"
						>
							{a}
						</span>
					))}
				</div>
			)}

			{readiness.pluginSupportedActions.length > 0 && (
				<div className="text-[11px] text-ink-mute">
					פלאגין תומך ב: {readiness.pluginSupportedActions.join(" · ")}
				</div>
			)}

			{readiness.warnings.length > 0 && (
				<div className="rounded-md border border-gold/30 bg-gold/10 px-3 py-2 text-xs text-gold space-y-1">
					<div className="font-bold flex items-center gap-1.5">
						<AlertTriangle className="w-3.5 h-3.5" /> מה חסר:
					</div>
					<ul className="space-y-0.5 ms-5 list-disc">
						{readiness.warnings.map((w, i) => (
							<li key={i}>{fmtWarning(w)}</li>
						))}
					</ul>
				</div>
			)}

			<div className="text-[10px] text-ink-mute text-end">
				עודכן לאחרונה: {new Date(readiness.lastCheckedAt).toLocaleString("he-IL")}
			</div>
		</div>
	);
}

function OverallPill({ ready }: { ready: boolean }) {
	return (
		<span
			className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold border ${
				ready
					? "bg-go/10 border-go/30 text-go"
					: "bg-blade/10 border-blade/30 text-blade"
			}`}
		>
			{ready ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
			{ready ? "מוכן לביצוע" : "לא מוכן לביצוע"}
		</span>
	);
}

function StatusRow({
	ok,
	label,
	hintWhenFalse,
}: {
	ok: boolean;
	label: string;
	hintWhenFalse?: string;
}) {
	return (
		<div className="flex items-center gap-2">
			{ok ? (
				<CheckCircle2 className="w-3.5 h-3.5 text-go shrink-0" />
			) : (
				<XCircle className="w-3.5 h-3.5 text-blade shrink-0" />
			)}
			<span className={ok ? "text-ink-dim" : "text-ink"}>{label}</span>
			{!ok && hintWhenFalse && (
				<span className="text-ink-mute text-[10px]">· {hintWhenFalse}</span>
			)}
		</div>
	);
}
