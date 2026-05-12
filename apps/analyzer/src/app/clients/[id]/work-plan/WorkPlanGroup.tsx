"use client";

import { useState } from "react";
import { ChevronDown, ExternalLink } from "lucide-react";
import { ITEM_STATUS_LABEL, ITEM_SOURCE_LABEL, type ItemGroup, type ItemDecision, type ItemSourceType, type ItemStatus } from "@/lib/work-plan";
import { ApproveGroupButton } from "./ApproveGroupButton";

interface Item {
	id: string;
	title: string;
	summary: string | null;
	sourceType: string;
	sourceId: string;
	targetUrl: string | null;
	actionType: string | null;
	riskLevel: string;
	confidence: string;
	priorityScore: number;
	status: string;
	decision: string;
	reason: string | null;
	blockedReason: string | null;
	preparedSourceType: string | null;
	preparedSourceId: string | null;
	error: string | null;
}

export function WorkPlanGroup({
	clientId,
	planId,
	group,
	title,
	description,
	tone,
	items,
	approvable,
}: {
	clientId: string;
	planId: string;
	group: ItemGroup;
	title: string;
	description: string;
	tone: "good" | "warn" | "bad" | "neutral";
	items: Item[];
	approvable: boolean;
}) {
	const [open, setOpen] = useState(false);

	if (items.length === 0) return null;

	const plannedAutoCount = items.filter((i) => i.decision === "auto_prepare" && i.status === "planned").length;
	const preparedCount = items.filter((i) => i.status === "prepared").length;

	const borderTone =
		tone === "good"
			? "border-go/30"
			: tone === "warn"
				? "border-gold/30"
				: tone === "bad"
					? "border-blade/30"
					: "border-ninja-line";
	const bgTone =
		tone === "good"
			? "bg-go/5"
			: tone === "warn"
				? "bg-gold/5"
				: tone === "bad"
					? "bg-blade/5"
					: "bg-ninja-panel/40";

	return (
		<section className={`rounded-xl border ${borderTone} ${bgTone}`}>
			<button
				type="button"
				onClick={() => setOpen(!open)}
				className="w-full flex items-start justify-between gap-4 px-5 py-4 text-right"
			>
				<div className="flex-1 min-w-0">
					<div className="flex items-baseline gap-2 mb-1">
						<h3 className="text-base font-bold text-ink">{title}</h3>
						<span className="text-[11px] text-ink-mute font-mono tabular-nums">({items.length})</span>
						{preparedCount > 0 && (
							<span className="text-[10px] font-bold tracking-wider rounded-full border bg-go/10 text-go border-go/30 px-2 py-0.5">
								{preparedCount} הוכנו
							</span>
						)}
						{plannedAutoCount > 0 && approvable && (
							<span className="text-[10px] font-bold tracking-wider rounded-full border bg-gold/10 text-gold border-gold/30 px-2 py-0.5">
								{plannedAutoCount} ממתינים לאישור
							</span>
						)}
					</div>
					<p className="text-xs text-ink-dim leading-relaxed max-w-3xl">{description}</p>
				</div>
				<ChevronDown
					className={`w-4 h-4 mt-1 text-ink-mute transition-transform shrink-0 ${open ? "rotate-180" : ""}`}
				/>
			</button>

			{open && (
				<div className="border-t border-ninja-line px-5 py-4 space-y-3">
					{approvable && plannedAutoCount > 0 && (
						<div className="flex items-center justify-end">
							<ApproveGroupButton
								planId={planId}
								group={group}
								label={`אשר ${plannedAutoCount} פריטים בקבוצה`}
							/>
						</div>
					)}
					<ul className="space-y-2">
						{items.slice(0, 50).map((it) => (
							<ItemRow key={it.id} item={it} clientId={clientId} />
						))}
					</ul>
					{items.length > 50 && (
						<p className="text-xs text-ink-mute pt-2 border-t border-ninja-line">
							מוצגים 50 הראשונים מתוך {items.length} פריטים.
						</p>
					)}
				</div>
			)}
		</section>
	);
}

function ItemRow({ item, clientId }: { item: Item; clientId: string }) {
	const sourceLink = sourceLinkFor(clientId, item.sourceType as ItemSourceType, item.sourceId);
	const preparedLink = preparedLinkFor(clientId, item.preparedSourceType, item.preparedSourceId);

	return (
		<li className="rounded-lg border border-ninja-line bg-ninja-panel/60 px-4 py-3">
			<div className="flex items-start gap-3">
				<div className="flex-1 min-w-0">
					<div className="flex items-baseline gap-2 flex-wrap">
						<span className="text-[10px] font-bold tracking-wider uppercase text-ink-mute">
							{ITEM_SOURCE_LABEL[item.sourceType as ItemSourceType] ?? item.sourceType}
						</span>
						<span className="text-sm font-medium text-ink">{item.title}</span>
						<StatusPill status={item.status as ItemStatus} />
						<DecisionPill decision={item.decision as ItemDecision} />
					</div>
					{item.summary && (
						<p className="text-xs text-ink-dim mt-1 leading-relaxed">{item.summary}</p>
					)}
					<div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5 text-[11px] text-ink-mute">
						<span>סיכון: <span className="text-ink-dim">{item.riskLevel}</span></span>
						<span>· confidence: <span className="text-ink-dim">{item.confidence}</span></span>
						<span>· score: <span className="text-ink-dim tabular-nums">{item.priorityScore}</span></span>
						{item.targetUrl && (
							<a
								href={item.targetUrl}
								target="_blank"
								rel="noopener noreferrer"
								className="text-gold hover:text-blade inline-flex items-center gap-0.5 font-mono"
								dir="ltr"
							>
								{(() => {
									try {
										return new URL(item.targetUrl).pathname;
									} catch {
										return item.targetUrl;
									}
								})()}
								<ExternalLink className="w-3 h-3" />
							</a>
						)}
					</div>
					{item.blockedReason && (
						<p className="text-xs text-gold mt-1">· {item.blockedReason}</p>
					)}
					{item.error && (
						<p className="text-xs text-blade mt-1">· {item.error}</p>
					)}
				</div>
				<div className="flex flex-col items-end gap-1 text-[11px] shrink-0">
					{sourceLink && (
						<a href={sourceLink} className="text-gold hover:text-blade">
							מקור →
						</a>
					)}
					{preparedLink && (
						<a href={preparedLink} className="text-go hover:text-blade">
							מוכן →
						</a>
					)}
				</div>
			</div>
		</li>
	);
}

function StatusPill({ status }: { status: ItemStatus }) {
	const tone =
		status === "prepared" || status === "completed"
			? "good"
			: status === "failed"
				? "bad"
				: status === "preparing" || status === "needs_human_review"
					? "warn"
					: "neutral";
	const cls =
		tone === "good"
			? "bg-go/10 text-go border-go/30"
			: tone === "warn"
				? "bg-gold/10 text-gold border-gold/30"
				: tone === "bad"
					? "bg-blade/10 text-blade border-blade/30"
					: "bg-ninja-raised text-ink-dim border-ninja-line";
	return (
		<span className={`inline-flex items-center text-[9px] font-bold tracking-wider rounded-full border px-1.5 py-0.5 ${cls}`}>
			{ITEM_STATUS_LABEL[status] ?? status}
		</span>
	);
}

function DecisionPill({ decision }: { decision: ItemDecision }) {
	const cls =
		decision === "auto_prepare"
			? "bg-go/10 text-go border-go/30"
			: decision === "human_review"
				? "bg-gold/10 text-gold border-gold/30"
				: decision === "blocked"
					? "bg-blade/10 text-blade border-blade/30"
					: "bg-ninja-raised text-ink-dim border-ninja-line";
	const label =
		decision === "auto_prepare"
			? "auto"
			: decision === "human_review"
				? "review"
				: decision === "blocked"
					? "blocked"
					: decision === "monitor_only"
						? "monitor"
						: "skip";
	return (
		<span className={`inline-flex items-center text-[9px] font-bold tracking-wider rounded-full border px-1.5 py-0.5 ${cls}`}>
			{label}
		</span>
	);
}

function sourceLinkFor(clientId: string, sourceType: ItemSourceType, _sourceId: string): string | null {
	switch (sourceType) {
		case "opportunity":
			return `/clients/${clientId}/opportunities`;
		case "keyword_strategy":
			return `/clients/${clientId}/keyword-strategy`;
		case "content_brief":
			return `/clients/${clientId}/briefs`;
		case "internal_link_suggestion":
			return `/clients/${clientId}/internal-links`;
		default:
			return null;
	}
}

function preparedLinkFor(clientId: string, type: string | null, _id: string | null): string | null {
	if (!type) return null;
	switch (type) {
		case "execution_action":
			return `/clients/${clientId}/execution`;
		case "content_brief":
			return `/clients/${clientId}/briefs`;
		case "internal_link_suggestion":
			return `/clients/${clientId}/internal-links`;
		case "opportunity":
			return `/clients/${clientId}/opportunities`;
		default:
			return null;
	}
}
