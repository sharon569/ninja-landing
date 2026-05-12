"use client";

import { useState, useTransition } from "react";
import { ChevronDown, Check, X, Eye, Trash2, ExternalLink } from "lucide-react";
import {
	typeLabel,
	statusLabel,
	statusTone,
	impactLabel,
	effortLabel,
	confidenceLabel,
	priorityBand,
} from "@/lib/opportunities";
import { setOpportunityStatus, deleteOpportunity } from "./actions";

interface Row {
	id: string;
	type: string;
	title: string;
	description: string;
	evidence: string; // JSON
	recommendedAction: string;
	priorityScore: number;
	impact: string;
	effort: string;
	confidence: string;
	status: string;
	relatedKeyword: string;
	relatedPage: string;
	relatedQuery: string;
}

export function OpportunityRow({ row }: { row: Row }) {
	const [open, setOpen] = useState(false);
	const [pending, startTransition] = useTransition();

	const band = priorityBand(row.priorityScore);
	const evidence = (() => {
		try {
			return JSON.parse(row.evidence) as Record<string, unknown>;
		} catch {
			return {};
		}
	})();

	function act(status: string) {
		startTransition(async () => {
			await setOpportunityStatus(row.id, status);
		});
	}

	return (
		<article
			className={`rounded-xl border bg-ninja-panel/60 transition-all ${
				row.status === "dismissed" || row.status === "rejected"
					? "border-ninja-line opacity-60"
					: row.status === "approved"
						? "border-go/40"
						: row.status === "needs_human_review"
							? "border-gold/40"
							: "border-ninja-line hover:border-ninja-line-strong"
			}`}
		>
			{/* Header */}
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
					<div className="flex flex-wrap items-baseline gap-2 mb-1">
						<h3 className="text-base font-semibold text-ink truncate">{row.title}</h3>
						<span className="text-[10px] font-bold tracking-wider uppercase text-ink-mute">
							{typeLabel(row.type)}
						</span>
					</div>
					<p className="text-sm text-ink-dim leading-relaxed line-clamp-2">
						{row.description}
					</p>
					<div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[11px]">
						<Pill label="Impact" value={impactLabel(row.impact)} />
						<Pill label="Effort" value={effortLabel(row.effort)} />
						<Pill label="Confidence" value={confidenceLabel(row.confidence)} />
						<StatusPill value={row.status} />
					</div>
				</div>

				<ChevronDown
					className={`w-4 h-4 mt-1 text-ink-mute transition-transform shrink-0 ${open ? "rotate-180" : ""}`}
				/>
			</button>

			{/* Body */}
			{open && (
				<div className="border-t border-ninja-line px-5 py-5 space-y-5">
					{/* Recommended action */}
					<div className="rounded-lg border border-gold/30 bg-gold/5 p-4">
						<div className="text-[10px] font-bold tracking-wider uppercase text-gold mb-1.5">
							הפעולה המומלצת
						</div>
						<p className="text-sm text-ink leading-relaxed">{row.recommendedAction}</p>
					</div>

					{/* Related metadata */}
					{(row.relatedKeyword || row.relatedPage || row.relatedQuery) && (
						<div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
							{row.relatedKeyword && (
								<MetaCard label="מילת יעד" value={row.relatedKeyword} />
							)}
							{row.relatedQuery && (
								<MetaCard label="שאילתת חיפוש" value={row.relatedQuery} />
							)}
							{row.relatedPage && (
								<MetaCard
									label="עמוד"
									value={row.relatedPage}
									href={row.relatedPage}
									mono
								/>
							)}
						</div>
					)}

					{/* Evidence */}
					<div>
						<div className="text-[10px] font-bold tracking-wider uppercase text-ink-mute mb-2">
							הראיות שזיהו את ההזדמנות
						</div>
						<dl className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-2 text-xs">
							{Object.entries(evidence).map(([k, v]) => (
								<EvidenceItem key={k} label={k} value={v} />
							))}
						</dl>
					</div>

					{/* Actions */}
					<div className="flex flex-wrap items-center gap-2 pt-3 border-t border-ninja-line">
						<ActionButton
							icon={<Check className="w-3.5 h-3.5" />}
							label="אישור"
							tone="good"
							active={row.status === "approved"}
							onClick={() => act("approved")}
							disabled={pending}
						/>
						<ActionButton
							icon={<Eye className="w-3.5 h-3.5" />}
							label="לסקירה ידנית"
							tone="warn"
							active={row.status === "needs_human_review"}
							onClick={() => act("needs_human_review")}
							disabled={pending}
						/>
						<ActionButton
							icon={<X className="w-3.5 h-3.5" />}
							label="דחייה"
							tone="bad"
							active={row.status === "rejected"}
							onClick={() => act("rejected")}
							disabled={pending}
						/>
						<ActionButton
							icon={<X className="w-3.5 h-3.5" />}
							label="הסרה"
							tone="mute"
							active={row.status === "dismissed"}
							onClick={() => act("dismissed")}
							disabled={pending}
						/>
						<div className="flex-1" />
						<button
							type="button"
							onClick={() => {
								if (!confirm("למחוק את ההזדמנות לחלוטין?")) return;
								startTransition(async () => {
									await deleteOpportunity(row.id);
								});
							}}
							disabled={pending}
							className="inline-flex items-center gap-1.5 text-xs text-ink-mute hover:text-blade transition-colors"
							title="מחיקה לצמיתות"
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

function Pill({ label, value }: { label: string; value: string }) {
	return (
		<span className="text-ink-dim">
			<span className="text-ink-mute">{label}:</span> <span className="text-ink">{value}</span>
		</span>
	);
}

function StatusPill({ value }: { value: string }) {
	const tone = statusTone(value);
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
		<span className={`inline-flex items-center text-[10px] font-bold tracking-wider rounded-full border px-2 py-0.5 ${cls}`}>
			{statusLabel(value)}
		</span>
	);
}

function MetaCard({
	label,
	value,
	href,
	mono = false,
}: {
	label: string;
	value: string;
	href?: string;
	mono?: boolean;
}) {
	const body = (
		<span className={mono ? "font-mono text-[11px]" : "text-sm"} dir={mono ? "ltr" : undefined}>
			{value}
		</span>
	);
	return (
		<div className="rounded-md border border-ninja-line bg-ninja-raised/40 px-3 py-2">
			<div className="text-[10px] font-bold tracking-wider uppercase text-ink-mute mb-1">{label}</div>
			{href ? (
				<a
					href={href}
					target="_blank"
					rel="noopener noreferrer"
					className="text-gold hover:text-blade inline-flex items-center gap-1 break-all"
				>
					{body}
					<ExternalLink className="w-3 h-3 flex-shrink-0" />
				</a>
			) : (
				<div className="text-ink break-words">{body}</div>
			)}
		</div>
	);
}

function EvidenceItem({ label, value }: { label: string; value: unknown }) {
	let display: string;
	if (value === null || value === undefined) display = "—";
	else if (typeof value === "number")
		display = label.toLowerCase().includes("position")
			? value.toFixed(1)
			: label.toLowerCase().includes("ctr") || label.toLowerCase().includes("pct")
				? `${(value * 100).toFixed(2)}%`
				: value.toLocaleString();
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

function ActionButton({
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
	active: boolean;
	onClick: () => void;
	disabled?: boolean;
}) {
	const baseColor =
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
			className={`inline-flex items-center gap-1.5 text-xs font-medium rounded-md border px-3 py-1.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${baseColor} ${active ? activeBg : ""}`}
		>
			{icon}
			{label}
		</button>
	);
}
