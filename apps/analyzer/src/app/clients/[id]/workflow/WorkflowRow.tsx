"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
	Check,
	X,
	Eye,
	History,
	ExternalLink,
	CheckCheck,
	BarChart3,
	Loader2,
} from "lucide-react";
import {
	type WorkflowItem,
	type WorkflowAction,
	SOURCE_LABEL,
	actionLabel,
} from "@/lib/workflow";
import { priorityBand } from "@/lib/opportunities";
import { workflowItemAction } from "./actions";
import { ActionLogDrawer } from "./ActionLogDrawer";

interface Props {
	item: WorkflowItem;
	selected: boolean;
	onSelectChange: (selected: boolean) => void;
}

export function WorkflowRow({ item, selected, onSelectChange }: Props) {
	const [pending, startTransition] = useTransition();
	const [logOpen, setLogOpen] = useState(false);

	const band = priorityBand(item.priorityScore);

	function doAction(action: WorkflowAction) {
		startTransition(async () => {
			await workflowItemAction(item.clientId, item.id, action);
		});
	}

	const sourceLink = (() => {
		switch (item.sourceType) {
			case "opportunity":
				return `/clients/${item.clientId}/opportunities`;
			case "content_brief":
				return `/clients/${item.clientId}/briefs`;
			case "internal_link":
				return `/clients/${item.clientId}/internal-links`;
			case "impact_review":
				return `/clients/${item.clientId}/impact`;
		}
	})();

	const showLogButton = item.sourceType === "opportunity";

	return (
		<>
			<article
				className={`rounded-xl border bg-ninja-panel/60 transition-all ${
					selected
						? "border-blade/60 bg-blade/5"
						: item.needsDecision
							? "border-gold/40"
							: item.isMonitoring
								? "border-go/30"
								: "border-ninja-line hover:border-ninja-line-strong"
				}`}
			>
				<div className="flex items-start gap-4 px-5 py-4">
					{/* Checkbox */}
					<input
						type="checkbox"
						checked={selected}
						onChange={(e) => onSelectChange(e.target.checked)}
						className="accent-blade mt-1 shrink-0"
						title="בחר לפעולה קבוצתית"
					/>

					{/* Priority score */}
					<div className="shrink-0 w-12 text-center pt-0.5">
						<div
							className="font-display text-xl tabular-nums leading-none"
							style={{ color: band.color }}
						>
							{item.priorityScore}
						</div>
					</div>

					{/* Body */}
					<div className="flex-1 min-w-0">
						<div className="flex flex-wrap items-baseline gap-2 mb-1">
							<SourceBadge source={item.sourceType} isTechnical={item.sourceMeta?.isTechnical === true} />
							<h3 className="text-base font-semibold text-ink truncate">{item.title}</h3>
						</div>
						{item.subtitle && (
							<p className="text-xs text-ink-dim line-clamp-1">{item.subtitle}</p>
						)}
						{item.description && (
							<p className="text-sm text-ink-dim leading-relaxed line-clamp-2 mt-1">
								{item.description}
							</p>
						)}
						<div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-[11px]">
							<StatusPill value={item.status} needsDecision={item.needsDecision} isMonitoring={item.isMonitoring} />
							<Tag label="Impact" value={item.impact} />
							<Tag label="Confidence" value={item.confidence} />
							{item.relatedKeyword && (
								<Tag label="Keyword" value={item.relatedKeyword} />
							)}
							{item.relatedPage && (
								<a
									href={item.relatedPage}
									target="_blank"
									rel="noopener noreferrer"
									dir="ltr"
									className="text-gold hover:text-blade font-mono inline-flex items-center gap-1 truncate max-w-[160px]"
								>
									{(() => {
										try {
											return new URL(item.relatedPage).pathname;
										} catch {
											return item.relatedPage;
										}
									})()}
									<ExternalLink className="w-3 h-3 shrink-0" />
								</a>
							)}
						</div>
					</div>

					{/* Actions */}
					<div className="flex flex-col items-end gap-1.5 shrink-0">
						<div className="flex flex-wrap items-center gap-1 justify-end">
							{item.availableActions.slice(0, 3).map((a) => (
								<ActionButton key={a} action={a} onClick={() => doAction(a)} disabled={pending} />
							))}
						</div>
						<div className="flex items-center gap-2">
							<Link
								href={sourceLink}
								className="inline-flex items-center gap-1 text-[10px] text-ink-mute hover:text-gold"
							>
								<ExternalLink className="w-3 h-3" />
								פתח ב-{SOURCE_LABEL[item.sourceType]}
							</Link>
							{showLogButton && (
								<button
									type="button"
									onClick={() => setLogOpen(true)}
									className="inline-flex items-center gap-1 text-[10px] text-ink-mute hover:text-gold"
								>
									<History className="w-3 h-3" />
									Log
								</button>
							)}
						</div>
						{pending && <Loader2 className="w-3 h-3 animate-spin text-ink-mute" />}
					</div>
				</div>

				{/* Recommended action under fold */}
				{item.recommendedAction && (
					<div className="border-t border-ninja-line px-5 py-3">
						<div className="text-[10px] font-bold tracking-wider uppercase text-ink-mute mb-1">
							הפעולה המומלצת
						</div>
						<p className="text-sm text-ink-dim leading-relaxed">{item.recommendedAction}</p>
					</div>
				)}
			</article>

			{logOpen && (
				<ActionLogDrawer
					opportunityId={item.sourceId}
					onClose={() => setLogOpen(false)}
				/>
			)}
		</>
	);
}

function SourceBadge({ source, isTechnical }: { source: string; isTechnical: boolean }) {
	const cls =
		isTechnical
			? "bg-blade/10 text-blade border-blade/30"
			: source === "opportunity"
				? "bg-blade/10 text-blade border-blade/30"
				: source === "content_brief"
					? "bg-gold/10 text-gold border-gold/30"
					: source === "internal_link"
						? "bg-go/10 text-go border-go/30"
						: "bg-ninja-raised text-ink-dim border-ninja-line";
	const label = isTechnical ? "טכני" : SOURCE_LABEL[source as keyof typeof SOURCE_LABEL] ?? source;
	return (
		<span className={`inline-flex items-center text-[10px] font-bold tracking-wider rounded-full border px-2 py-0.5 ${cls}`}>
			{label}
		</span>
	);
}

function StatusPill({
	value,
	needsDecision,
	isMonitoring,
}: {
	value: string;
	needsDecision: boolean;
	isMonitoring: boolean;
}) {
	const cls = needsDecision
		? "bg-gold/10 text-gold border-gold/30"
		: isMonitoring
			? "bg-go/10 text-go border-go/30"
			: value === "approved"
				? "bg-go/10 text-go border-go/30"
				: "bg-ninja-raised text-ink-dim border-ninja-line";
	return (
		<span className={`inline-flex items-center text-[10px] font-bold tracking-wider rounded-full border px-2 py-0.5 ${cls}`}>
			{value}
		</span>
	);
}

function Tag({ label, value }: { label: string; value: string }) {
	return (
		<span className="text-ink-dim">
			<span className="text-ink-mute">{label}:</span> <span className="text-ink">{value}</span>
		</span>
	);
}

function ActionButton({
	action,
	onClick,
	disabled,
}: {
	action: WorkflowAction;
	onClick: () => void;
	disabled?: boolean;
}) {
	const tone =
		action === "approve" || action === "mark_used" || action === "mark_manual_applied"
			? "good"
			: action === "reject" || action === "dismiss"
				? "bad"
				: action === "needs_human_review"
					? "warn"
					: "mute";
	const icon =
		action === "approve"
			? <Check className="w-3 h-3" />
			: action === "reject" || action === "dismiss"
				? <X className="w-3 h-3" />
				: action === "needs_human_review"
					? <Eye className="w-3 h-3" />
					: action === "mark_manual_applied" || action === "mark_used"
						? <CheckCheck className="w-3 h-3" />
						: <BarChart3 className="w-3 h-3" />;
	const cls =
		tone === "good"
			? "text-go border-go/30 hover:bg-go/10"
			: tone === "bad"
				? "text-blade border-blade/30 hover:bg-blade/10"
				: tone === "warn"
					? "text-gold border-gold/30 hover:bg-gold/10"
					: "text-ink-mute border-ninja-line hover:bg-ninja-raised";
	return (
		<button
			type="button"
			onClick={onClick}
			disabled={disabled}
			className={`inline-flex items-center gap-1 text-[11px] font-medium rounded-md border px-2 py-1 transition-colors disabled:opacity-50 ${cls}`}
		>
			{icon}
			{actionLabel(action)}
		</button>
	);
}
