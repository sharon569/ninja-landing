"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { DecisionSummary } from "@/lib/decision";
import type { PageClassification } from "@/lib/page-scope";
import { DecisionCard } from "./DecisionCard";
import { ScopeBadge, ScopeExplainer } from "@/components/ScopeBadge";
import { getOpportunityDecision } from "./actions";
import {
	ChevronDown,
	Check,
	X,
	Eye,
	Trash2,
	ExternalLink,
	CheckCheck,
	BarChart3,
	FileText,
	Zap,
} from "lucide-react";
import {
	typeLabel,
	statusLabel,
	statusTone,
	impactLabel,
	effortLabel,
	confidenceLabel,
	priorityBand,
	approvedActionTypeLabel,
} from "@/lib/opportunities";
import { canCreateBriefFor } from "@/lib/briefs";
import {
	setOpportunityStatus,
	deleteOpportunity,
	runImpactReview,
} from "./actions";
import { ApproveModal, MarkAppliedModal, RejectModal } from "./ActionModals";
import { PrepareExecutionModal } from "./PrepareExecutionModal";
import { createBriefFromOpportunity } from "../briefs/actions";

interface Row {
	id: string;
	type: string;
	title: string;
	description: string;
	evidence: string;
	recommendedAction: string;
	priorityScore: number;
	impact: string;
	effort: string;
	confidence: string;
	status: string;
	relatedKeyword: string;
	relatedPage: string;
	relatedQuery: string;
	approvedActionType?: string | null;
	approvalNote?: string | null;
	approvedAt?: Date | null;
	manuallyAppliedAt?: Date | null;
	manualActionNote?: string | null;
}

export function OpportunityRow({
	row,
	clientId,
	pageScope,
}: {
	row: Row;
	clientId: string;
	pageScope: PageClassification | null;
}) {
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [modal, setModal] = useState<"approve" | "applied" | "reject" | "execution" | null>(null);
	const [pending, startTransition] = useTransition();
	// Phase 14C — lazy-load Decision on first expand
	const [decision, setDecision] = useState<DecisionSummary | null>(null);
	const [decisionLoaded, setDecisionLoaded] = useState(false);
	const [decisionLoading, setDecisionLoading] = useState(false);
	const [decisionError, setDecisionError] = useState<string | null>(null);
	const [alreadyReviewed, setAlreadyReviewed] = useState(false);

	useEffect(() => {
		if (open && !decisionLoaded && !decisionLoading) {
			setDecisionLoading(true);
			getOpportunityDecision(row.id).then((r) => {
				if (r.ok && r.decision) {
					setDecision(r.decision);
					setAlreadyReviewed(!!r.alreadyReviewed);
				} else {
					setDecisionError(r.error ?? "Failed to compute decision");
				}
				setDecisionLoaded(true);
				setDecisionLoading(false);
			});
		}
	}, [open, decisionLoaded, decisionLoading, row.id]);

	const band = priorityBand(row.priorityScore);
	const evidence = (() => {
		try {
			return JSON.parse(row.evidence) as Record<string, unknown>;
		} catch {
			return {};
		}
	})();

	function setStatus(status: string) {
		startTransition(async () => {
			await setOpportunityStatus(row.id, status);
		});
	}

	function impactReview(window: "7d" | "14d" | "30d") {
		startTransition(async () => {
			await runImpactReview(row.id, window);
		});
	}

	return (
		<>
			<article
				className={`rounded-xl border bg-ninja-panel/60 transition-all ${
					row.status === "dismissed" || row.status === "rejected"
						? "border-ninja-line opacity-60"
						: row.status === "approved"
							? "border-go/40"
							: row.status === "monitoring" || row.status === "manually_applied"
								? "border-gold/40"
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
							{pageScope && <ScopeBadge classification={pageScope} variant="compact" />}
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
						{pageScope && !pageScope.isSeoEligible && (
							<ScopeExplainer classification={pageScope} />
						)}
						{/* Phase 14C — Decision Intelligence card */}
						{decisionLoading && (
							<div className="text-xs text-ink-mute italic">טוען Decision Summary…</div>
						)}
						{decisionError && (
							<div className="text-xs text-blade">{decisionError}</div>
						)}
						{decision && (
							<DecisionCard
								decision={decision}
								opportunityId={row.id}
								alreadyReviewed={alreadyReviewed}
							/>
						)}
						{/* Approval / apply metadata */}
						{(row.approvedAt || row.manuallyAppliedAt) && (
							<div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
								{row.approvedAt && (
									<MetaCard
										label={`אושר · ${approvedActionTypeLabel(row.approvedActionType)}`}
										value={`${new Date(row.approvedAt).toLocaleString("he-IL")}${row.approvalNote ? ` · ${row.approvalNote}` : ""}`}
									/>
								)}
								{row.manuallyAppliedAt && (
									<MetaCard
										label="בוצע ידנית"
										value={`${new Date(row.manuallyAppliedAt).toLocaleString("he-IL")}${row.manualActionNote ? ` · ${row.manualActionNote}` : ""}`}
									/>
								)}
							</div>
						)}

						{/* Recommended action */}
						<div className="rounded-lg border border-gold/30 bg-gold/5 p-4">
							<div className="text-[10px] font-bold tracking-wider uppercase text-gold mb-1.5">
								הפעולה המומלצת
							</div>
							<p className="text-sm text-ink leading-relaxed">{row.recommendedAction}</p>
						</div>

						{/* Related */}
						{(row.relatedKeyword || row.relatedPage || row.relatedQuery) && (
							<div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
								{row.relatedKeyword && <MetaCard label="מילת יעד" value={row.relatedKeyword} />}
								{row.relatedQuery && <MetaCard label="שאילתת חיפוש" value={row.relatedQuery} />}
								{row.relatedPage && (
									<MetaCard label="עמוד" value={row.relatedPage} href={row.relatedPage} mono />
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
							{(row.status === "detected" ||
								row.status === "recommended" ||
								row.status === "needs_human_review") && (
								<>
									<ActionButton
										icon={<Check className="w-3.5 h-3.5" />}
										label="אישור"
										tone="good"
										onClick={() => setModal("approve")}
										disabled={pending}
									/>
									<ActionButton
										icon={<Eye className="w-3.5 h-3.5" />}
										label="לסקירה ידנית"
										tone="warn"
										active={row.status === "needs_human_review"}
										onClick={() => setStatus("needs_human_review")}
										disabled={pending}
									/>
									<ActionButton
										icon={<X className="w-3.5 h-3.5" />}
										label="דחייה"
										tone="bad"
										onClick={() => setModal("reject")}
										disabled={pending}
									/>
									<ActionButton
										icon={<X className="w-3.5 h-3.5" />}
										label="הסרה"
										tone="mute"
										onClick={() => setStatus("dismissed")}
										disabled={pending}
									/>
								</>
							)}

							{row.status === "approved" && (
								<>
									<ActionButton
										icon={<Zap className="w-3.5 h-3.5" />}
										label="הכנת Execution"
										tone="bad"
										onClick={() => setModal("execution")}
										disabled={pending}
									/>
									<ActionButton
										icon={<CheckCheck className="w-3.5 h-3.5" />}
										label="סומן כבוצע ידנית"
										tone="good"
										onClick={() => setModal("applied")}
										disabled={pending}
									/>
								</>
							)}

							{(row.status === "monitoring" || row.status === "manually_applied" || row.status === "impact_reviewed") && (
								<>
									<ActionButton
										icon={<BarChart3 className="w-3.5 h-3.5" />}
										label="בדוק 7d"
										tone="warn"
										onClick={() => impactReview("7d")}
										disabled={pending}
									/>
									<ActionButton
										icon={<BarChart3 className="w-3.5 h-3.5" />}
										label="בדוק 14d"
										tone="warn"
										onClick={() => impactReview("14d")}
										disabled={pending}
									/>
									<ActionButton
										icon={<BarChart3 className="w-3.5 h-3.5" />}
										label="בדוק 30d"
										tone="warn"
										onClick={() => impactReview("30d")}
										disabled={pending}
									/>
								</>
							)}

							{canCreateBriefFor(row.type) && row.status !== "rejected" && row.status !== "dismissed" && (
								<ActionButton
									icon={<FileText className="w-3.5 h-3.5" />}
									label="צור בריף תוכן"
									tone="warn"
									onClick={() =>
										startTransition(async () => {
											const r = await createBriefFromOpportunity(row.id);
											if (r.ok) {
												router.push(`/clients/${clientId}/briefs`);
											} else if (r.error) {
												alert(r.error);
											}
										})
									}
									disabled={pending}
								/>
							)}

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

			{modal === "approve" && <ApproveModal opportunityId={row.id} onClose={() => setModal(null)} />}
			{modal === "applied" && <MarkAppliedModal opportunityId={row.id} onClose={() => setModal(null)} />}
			{modal === "reject" && <RejectModal opportunityId={row.id} onClose={() => setModal(null)} />}
			{modal === "execution" && (
				<PrepareExecutionModal
					opportunityId={row.id}
					clientId={clientId}
					relatedPage={row.relatedPage || null}
					onClose={() => setModal(null)}
				/>
			)}
		</>
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
	active?: boolean;
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
