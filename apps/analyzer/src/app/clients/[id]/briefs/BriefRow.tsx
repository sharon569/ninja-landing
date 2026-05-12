"use client";

import { useState, useTransition } from "react";
import {
	ChevronDown,
	Pencil,
	Check,
	X,
	CheckCheck,
	Trash2,
	ExternalLink,
} from "lucide-react";
import {
	briefTypeLabel,
	searchIntentLabel,
	briefStatusLabel,
	briefStatusTone,
} from "@/lib/briefs";
import { setBriefStatus, deleteBrief } from "./actions";
import { BriefEditModal } from "./BriefEditModal";

interface Row {
	id: string;
	targetKeyword: string;
	relatedQuery: string | null;
	relatedPage: string | null;
	briefType: string;
	searchIntent: string;
	recommendedTitle: string | null;
	recommendedMetaDescription: string | null;
	recommendedH1: string | null;
	outline: string | null;
	secondaryKeywords: string[];
	internalLinks: string[];
	recommendedCTA: string | null;
	recommendedSchema: string | null;
	contentAngle: string | null;
	notes: string | null;
	status: string;
	createdAt: Date;
	opportunityId: string | null;
}

export function BriefRow({ row }: { row: Row }) {
	const [open, setOpen] = useState(false);
	const [editing, setEditing] = useState(false);
	const [pending, startTransition] = useTransition();

	function act(status: string) {
		startTransition(async () => {
			await setBriefStatus(row.id, status);
		});
	}

	const toneBorder =
		row.status === "approved" || row.status === "used"
			? "border-go/40"
			: row.status === "needs_human_review"
				? "border-gold/40"
				: row.status === "rejected"
					? "border-ninja-line opacity-60"
					: "border-ninja-line hover:border-ninja-line-strong";

	return (
		<>
			<article className={`rounded-xl border bg-ninja-panel/60 transition-all ${toneBorder}`}>
				<button
					type="button"
					onClick={() => setOpen(!open)}
					className="w-full flex items-start gap-4 px-5 py-4 text-right"
				>
					<div className="flex-1 min-w-0">
						<div className="flex flex-wrap items-baseline gap-2 mb-1">
							<h3 className="text-base font-semibold text-ink truncate">
								{row.targetKeyword}
							</h3>
							<span className="text-[10px] font-bold tracking-wider uppercase text-ink-mute">
								{briefTypeLabel(row.briefType)}
							</span>
							<span className="text-[10px] tracking-wider uppercase text-ink-mute">
								· {searchIntentLabel(row.searchIntent)}
							</span>
						</div>
						{row.recommendedTitle && (
							<p className="text-sm text-ink-dim line-clamp-1">{row.recommendedTitle}</p>
						)}
						<div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-[11px]">
							<StatusPill value={row.status} />
							{row.relatedPage && (
								<a
									href={row.relatedPage}
									target="_blank"
									rel="noopener noreferrer"
									onClick={(e) => e.stopPropagation()}
									className="text-gold hover:text-blade inline-flex items-center gap-1 font-mono"
									dir="ltr"
								>
									{(() => {
										try {
											return new URL(row.relatedPage).pathname;
										} catch {
											return row.relatedPage;
										}
									})()}
									<ExternalLink className="w-3 h-3" />
								</a>
							)}
							<span className="text-ink-mute">
								נוצר {new Date(row.createdAt).toLocaleDateString("he-IL")}
							</span>
						</div>
					</div>
					<ChevronDown
						className={`w-4 h-4 mt-1 text-ink-mute transition-transform shrink-0 ${open ? "rotate-180" : ""}`}
					/>
				</button>

				{open && (
					<div className="border-t border-ninja-line px-5 py-5 space-y-5">
						{/* Title / Meta / H1 */}
						<div className="grid sm:grid-cols-2 gap-3 text-sm">
							{row.recommendedTitle && (
								<Card label="Title">{row.recommendedTitle}</Card>
							)}
							{row.recommendedH1 && <Card label="H1">{row.recommendedH1}</Card>}
							{row.recommendedMetaDescription && (
								<div className="sm:col-span-2">
									<Card label="Meta Description">{row.recommendedMetaDescription}</Card>
								</div>
							)}
						</div>

						{/* Outline */}
						{row.outline && (
							<Section title="מבנה (Outline)">
								<pre className="whitespace-pre-wrap font-mono text-xs text-ink leading-relaxed">
									{row.outline}
								</pre>
							</Section>
						)}

						{/* Keywords + Internal Links */}
						<div className="grid sm:grid-cols-2 gap-3">
							{row.secondaryKeywords.length > 0 && (
								<Section title="מילות מפתח משניות">
									<ul className="text-xs text-ink-dim space-y-1">
										{row.secondaryKeywords.map((k, i) => (
											<li key={i}>· {k}</li>
										))}
									</ul>
								</Section>
							)}
							{row.internalLinks.length > 0 && (
								<Section title="קישורים פנימיים מומלצים">
									<ul className="text-xs space-y-2">
										{row.internalLinks.map((l, i) => {
											const [url, anchor, reason] = l.split("|");
											return (
												<li key={i} className="space-y-0.5">
													<a
														href={url}
														target="_blank"
														rel="noopener noreferrer"
														className="text-gold hover:text-blade font-mono text-[11px] block"
														dir="ltr"
													>
														{url}
													</a>
													{anchor && (
														<div className="text-ink">
															<span className="text-ink-mute">anchor:</span> {anchor}
														</div>
													)}
													{reason && <div className="text-ink-dim">{reason}</div>}
												</li>
											);
										})}
									</ul>
								</Section>
							)}
						</div>

						{/* Other fields */}
						{row.recommendedCTA && <Section title="CTA">{row.recommendedCTA}</Section>}
						{row.recommendedSchema && <Section title="Schema">{row.recommendedSchema}</Section>}
						{row.contentAngle && <Section title="זווית תוכן">{row.contentAngle}</Section>}
						{row.notes && <Section title="הערות">{row.notes}</Section>}

						{/* Actions */}
						<div className="flex flex-wrap items-center gap-2 pt-3 border-t border-ninja-line">
							<ActionButton
								icon={<Pencil className="w-3.5 h-3.5" />}
								label="עריכה"
								tone="warn"
								onClick={() => setEditing(true)}
							/>
							{(row.status === "draft" || row.status === "needs_human_review") && (
								<>
									<ActionButton
										icon={<Check className="w-3.5 h-3.5" />}
										label="אישור"
										tone="good"
										onClick={() => act("approved")}
										disabled={pending}
									/>
									<ActionButton
										icon={<X className="w-3.5 h-3.5" />}
										label="דחייה"
										tone="bad"
										onClick={() => act("rejected")}
										disabled={pending}
									/>
								</>
							)}
							{row.status === "approved" && (
								<ActionButton
									icon={<CheckCheck className="w-3.5 h-3.5" />}
									label="סומן כנוצל"
									tone="good"
									onClick={() => act("used")}
									disabled={pending}
								/>
							)}
							{row.status === "draft" && (
								<ActionButton
									icon={<Check className="w-3.5 h-3.5" />}
									label="לסקירה"
									tone="warn"
									onClick={() => act("needs_human_review")}
									disabled={pending}
								/>
							)}
							<div className="flex-1" />
							<button
								type="button"
								onClick={() => {
									if (!confirm("למחוק את הבריף?")) return;
									startTransition(async () => {
										await deleteBrief(row.id);
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

			{editing && (
				<BriefEditModal brief={row} onClose={() => setEditing(false)} />
			)}
		</>
	);
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
	return (
		<div>
			<div className="text-[10px] font-bold tracking-wider uppercase text-ink-mute mb-2">
				{title}
			</div>
			<div className="rounded-md border border-ninja-line bg-ninja-raised/30 px-4 py-3 text-sm text-ink leading-relaxed">
				{children}
			</div>
		</div>
	);
}

function Card({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<div className="rounded-md border border-ninja-line bg-ninja-raised/30 px-3 py-2">
			<div className="text-[10px] font-bold tracking-wider uppercase text-ink-mute mb-1">
				{label}
			</div>
			<div className="text-ink">{children}</div>
		</div>
	);
}

function StatusPill({ value }: { value: string }) {
	const tone = briefStatusTone(value);
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
			{briefStatusLabel(value)}
		</span>
	);
}

function ActionButton({
	icon,
	label,
	tone,
	onClick,
	disabled,
}: {
	icon: React.ReactNode;
	label: string;
	tone: "good" | "warn" | "bad" | "mute";
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
	return (
		<button
			type="button"
			onClick={onClick}
			disabled={disabled}
			className={`inline-flex items-center gap-1.5 text-xs font-medium rounded-md border px-3 py-1.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${cls}`}
		>
			{icon}
			{label}
		</button>
	);
}
