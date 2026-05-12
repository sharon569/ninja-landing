"use client";

import { useState, useTransition } from "react";
import {
	ChevronDown,
	ArrowLeft,
	Check,
	X,
	CheckCheck,
	Trash2,
	ExternalLink,
	Eye,
} from "lucide-react";
import {
	suggestionStatusLabel,
	suggestionStatusTone,
	suggestionSourceLabel,
	linkPriorityBand,
	urlPath,
} from "@/lib/internal-links";
import { setSuggestionStatus, deleteSuggestion } from "./actions";

interface Row {
	id: string;
	sourcePage: string;
	sourceTitle: string | null;
	targetPage: string;
	targetTitle: string | null;
	suggestedAnchor: string;
	reason: string;
	evidence: string;
	priorityScore: number;
	impact: string;
	effort: string;
	confidence: string;
	status: string;
	source: string | null;
}

export function SuggestionRow({ row }: { row: Row }) {
	const [open, setOpen] = useState(false);
	const [pending, startTransition] = useTransition();

	const band = linkPriorityBand(row.priorityScore);
	const evidence = (() => {
		try {
			return JSON.parse(row.evidence) as Record<string, unknown>;
		} catch {
			return {};
		}
	})();

	function act(status: string) {
		startTransition(async () => {
			await setSuggestionStatus(row.id, status);
		});
	}

	const toneCls =
		row.status === "approved" || row.status === "used"
			? "border-go/40"
			: row.status === "needs_human_review"
				? "border-gold/40"
				: row.status === "rejected" || row.status === "dismissed"
					? "border-ninja-line opacity-60"
					: "border-ninja-line hover:border-ninja-line-strong";

	return (
		<article className={`rounded-xl border bg-ninja-panel/60 transition-all ${toneCls}`}>
			<button
				type="button"
				onClick={() => setOpen(!open)}
				className="w-full flex items-start gap-4 px-5 py-4 text-right"
			>
				<div className="shrink-0 w-14 text-center">
					<div
						className="font-display text-2xl tabular-nums leading-none"
						style={{ color: band.color }}
					>
						{row.priorityScore}
					</div>
					<div className="text-[10px] font-bold tracking-wider uppercase text-ink-mute mt-1">
						{band.label}
					</div>
				</div>

				<div className="flex-1 min-w-0">
					<div className="flex items-center gap-3 flex-wrap mb-1.5">
						<UrlBadge label="מקור" url={row.sourcePage} title={row.sourceTitle} />
						<ArrowLeft className="w-4 h-4 text-ink-mute shrink-0" />
						<UrlBadge label="יעד" url={row.targetPage} title={row.targetTitle} highlight />
					</div>
					<div className="text-sm text-ink mt-1.5">
						<span className="text-ink-mute">Anchor:</span>{" "}
						<span className="font-semibold">&quot;{row.suggestedAnchor}&quot;</span>
					</div>
					<div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-[11px]">
						<StatusPill value={row.status} />
						<span className="text-ink-dim">
							<span className="text-ink-mute">Impact:</span> <span className="text-ink">{row.impact}</span>
						</span>
						<span className="text-ink-dim">
							<span className="text-ink-mute">Confidence:</span>{" "}
							<span className="text-ink">{row.confidence}</span>
						</span>
						{row.source && (
							<span className="text-ink-mute">· {suggestionSourceLabel(row.source)}</span>
						)}
					</div>
				</div>

				<ChevronDown
					className={`w-4 h-4 mt-1 text-ink-mute transition-transform shrink-0 ${open ? "rotate-180" : ""}`}
				/>
			</button>

			{open && (
				<div className="border-t border-ninja-line px-5 py-5 space-y-4">
					<div className="rounded-lg border border-gold/30 bg-gold/5 p-4">
						<div className="text-[10px] font-bold tracking-wider uppercase text-gold mb-1.5">
							למה ההצעה הזו
						</div>
						<p className="text-sm text-ink leading-relaxed">{row.reason}</p>
					</div>

					<div>
						<div className="text-[10px] font-bold tracking-wider uppercase text-ink-mute mb-2">
							ראיות
						</div>
						<dl className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-2 text-xs">
							{Object.entries(evidence).map(([k, v]) => (
								<EvidenceItem key={k} label={k} value={v} />
							))}
						</dl>
					</div>

					<div className="flex flex-wrap items-center gap-2 pt-3 border-t border-ninja-line">
						{(row.status === "suggested" || row.status === "needs_human_review") && (
							<>
								<ActionBtn
									icon={<Check className="w-3.5 h-3.5" />}
									label="אישור"
									tone="good"
									onClick={() => act("approved")}
									disabled={pending}
								/>
								<ActionBtn
									icon={<Eye className="w-3.5 h-3.5" />}
									label="לסקירה ידנית"
									tone="warn"
									active={row.status === "needs_human_review"}
									onClick={() => act("needs_human_review")}
									disabled={pending}
								/>
								<ActionBtn
									icon={<X className="w-3.5 h-3.5" />}
									label="דחייה"
									tone="bad"
									onClick={() => act("rejected")}
									disabled={pending}
								/>
								<ActionBtn
									icon={<X className="w-3.5 h-3.5" />}
									label="הסרה"
									tone="mute"
									onClick={() => act("dismissed")}
									disabled={pending}
								/>
							</>
						)}
						{row.status === "approved" && (
							<ActionBtn
								icon={<CheckCheck className="w-3.5 h-3.5" />}
								label="סומן כנוצל"
								tone="good"
								onClick={() => act("used")}
								disabled={pending}
							/>
						)}
						<div className="flex-1" />
						<button
							type="button"
							onClick={() => {
								if (!confirm("למחוק את ההצעה לחלוטין?")) return;
								startTransition(async () => {
									await deleteSuggestion(row.id);
								});
							}}
							disabled={pending}
							className="inline-flex items-center gap-1.5 text-xs text-ink-mute hover:text-blade transition-colors"
						>
							<Trash2 className="w-3 h-3" />
							מחק
						</button>
					</div>
				</div>
			)}
		</article>
	);
}

function UrlBadge({
	label,
	url,
	title,
	highlight,
}: {
	label: string;
	url: string;
	title: string | null;
	highlight?: boolean;
}) {
	return (
		<div
			className={`inline-flex flex-col rounded-md border px-2.5 py-1 max-w-[200px] ${
				highlight ? "border-blade/40 bg-blade/10" : "border-ninja-line bg-ninja-raised/40"
			}`}
		>
			<span className="text-[9px] font-bold tracking-wider uppercase text-ink-mute">
				{label}
			</span>
			<a
				href={url}
				target="_blank"
				rel="noopener noreferrer"
				onClick={(e) => e.stopPropagation()}
				className="text-xs font-mono text-gold hover:text-blade truncate inline-flex items-center gap-1"
				dir="ltr"
			>
				{urlPath(url)}
				<ExternalLink className="w-3 h-3 shrink-0" />
			</a>
			{title && <span className="text-[11px] text-ink-dim truncate">{title}</span>}
		</div>
	);
}

function StatusPill({ value }: { value: string }) {
	const tone = suggestionStatusTone(value);
	const cls =
		tone === "good"
			? "bg-go/10 text-go border-go/30"
			: tone === "warn"
				? "bg-gold/10 text-gold border-gold/30"
				: tone === "bad"
					? "bg-blade/10 text-blade border-blade/30"
					: tone === "mute"
						? "bg-ninja-raised text-ink-mute border-ninja-line"
						: "bg-ninja-raised text-ink-dim border-ninja-line";
	return (
		<span
			className={`inline-flex items-center text-[10px] font-bold tracking-wider rounded-full border px-2 py-0.5 ${cls}`}
		>
			{suggestionStatusLabel(value)}
		</span>
	);
}

function EvidenceItem({ label, value }: { label: string; value: unknown }) {
	let display: string;
	if (value === null || value === undefined) display = "—";
	else if (typeof value === "boolean") display = value ? "כן" : "לא";
	else if (typeof value === "number") display = value.toLocaleString();
	else if (typeof value === "object") display = JSON.stringify(value);
	else display = String(value);
	return (
		<div>
			<dt className="text-ink-mute uppercase tracking-wider text-[10px]">{label}</dt>
			<dd className="text-ink mt-0.5 break-words" dir="auto">
				{display}
			</dd>
		</div>
	);
}

function ActionBtn({
	icon,
	label,
	tone,
	active,
	onClick,
	disabled,
}: {
	icon: React.ReactNode;
	label: string;
	tone: "good" | "warn" | "bad" | "mute";
	active?: boolean;
	onClick: () => void;
	disabled?: boolean;
}) {
	const cls =
		tone === "good"
			? "text-go border-go/30 hover:bg-go/10"
			: tone === "warn"
				? "text-gold border-gold/30 hover:bg-gold/10"
				: tone === "bad"
					? "text-blade border-blade/30 hover:bg-blade/10"
					: "text-ink-mute border-ninja-line hover:bg-ninja-raised";
	const activeBg =
		tone === "good"
			? "bg-go/20"
			: tone === "warn"
				? "bg-gold/20"
				: tone === "bad"
					? "bg-blade/20"
					: "bg-ninja-raised";
	return (
		<button
			type="button"
			onClick={onClick}
			disabled={disabled}
			className={`inline-flex items-center gap-1.5 text-xs font-medium rounded-md border px-3 py-1.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${cls} ${active ? activeBg : ""}`}
		>
			{icon}
			{label}
		</button>
	);
}
