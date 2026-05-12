"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { RefreshCw, Loader2, CheckCircle2, AlertTriangle, X } from "lucide-react";
import { refreshClientAction } from "./refresh-actions";
import type { RefreshResult } from "@/lib/refresh-server";

export function RefreshAllButton({ clientId }: { clientId: string }) {
	const router = useRouter();
	const [pending, startTransition] = useTransition();
	const [open, setOpen] = useState(false);
	const [result, setResult] = useState<RefreshResult | null>(null);
	const [error, setError] = useState<string | null>(null);

	function go() {
		setError(null);
		setResult(null);
		setOpen(true);
		startTransition(async () => {
			const r = await refreshClientAction(clientId);
			if (r.error) {
				setError(r.error);
			} else if (r.result) {
				setResult(r.result);
				router.refresh();
			}
		});
	}

	return (
		<>
			<button
				type="button"
				onClick={go}
				disabled={pending}
				className="inline-flex items-center gap-1.5 rounded-md border border-blade/30 bg-blade/10 hover:bg-blade/20 text-blade px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
				title="GSC sync, אודיט טכני, ניתוח הזדמנויות, אסטרטגיות, ובניית תוכנית עבודה חדשה"
			>
				{pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
				רענן הכל
			</button>

			{open && (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-ninja-black/80 backdrop-blur-sm p-4">
					<div className="max-w-lg w-full rounded-xl border border-blade/40 bg-ninja-panel p-6 shadow-2xl">
						<div className="flex items-start justify-between mb-4">
							<h3 className="font-display text-xl text-ink flex items-center gap-2">
								<RefreshCw className={`w-5 h-5 text-blade ${pending ? "animate-spin" : ""}`} />
								רענון מלא
							</h3>
							{!pending && (
								<button type="button" onClick={() => setOpen(false)} className="text-ink-mute hover:text-ink">
									<X className="w-4 h-4" />
								</button>
							)}
						</div>

						{pending && (
							<div className="space-y-3">
								<div className="text-sm text-ink-dim leading-relaxed">
									<Loader2 className="w-4 h-4 inline-block me-2 animate-spin text-blade" />
									מסנכרן GSC → אודיט טכני → הזדמנויות → אסטרטגיות → תוכנית עבודה…
								</div>
								<div className="text-xs text-ink-mute">זה יכול לקחת 30-90 שניות.</div>
							</div>
						)}

						{error && (
							<div className="rounded-md border border-blade/30 bg-blade/10 px-3 py-2 text-sm text-blade flex items-start gap-2">
								<AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
								{error}
							</div>
						)}

						{result && (
							<div className="space-y-3 text-xs">
								<div className="rounded-md border border-go/30 bg-go/10 px-3 py-2 text-sm text-go flex items-start gap-2">
									<CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
									הרענון הסתיים ב-{(result.durationMs / 1000).toFixed(1)} שניות
								</div>

								<Step
									label="GSC sync"
									ok={result.gsc.ran && !result.gsc.error}
									detail={
										result.gsc.error
											? result.gsc.error
											: result.gsc.ran
												? `${result.gsc.rowsFetched.toLocaleString("he-IL")} שורות · ${result.gsc.rowsWithPage.toLocaleString("he-IL")} עם page dim`
												: "דולג"
									}
								/>
								<Step
									label="אודיט טכני"
									ok={result.techAudit.ran && !result.techAudit.error}
									detail={
										result.techAudit.skippedReason ||
										result.techAudit.error ||
										(result.techAudit.ran
											? `${result.techAudit.findings} ממצאים · ${result.techAudit.opps} הזדמנויות`
											: "דולג")
									}
								/>
								<Step
									label="ניתוח הזדמנויות"
									ok={result.opportunities.ran && !result.opportunities.error}
									detail={
										result.opportunities.error ||
										(result.opportunities.ran
											? `${result.opportunities.detected} זוהו · ${result.opportunities.created} חדשות · ${result.opportunities.updated} עודכנו`
											: "דולג")
									}
								/>
								<Step
									label="Impact Reviews"
									ok={result.impactReviews.failed === 0}
									detail={
										result.impactReviews.ran === 0 && result.impactReviews.failed === 0
											? "אין reviews שמגיעים זמן"
											: `${result.impactReviews.ran} רצו · ${result.impactReviews.failed} נכשלו`
									}
								/>
								<Step
									label="אסטרטגיות"
									ok={result.strategies.failed === 0}
									detail={
										`${result.strategies.ran} חושבו מחדש${
											result.strategies.ineligibleRankingPage > 0
												? ` · ${result.strategies.ineligibleRankingPage} עם ranking page לא נכלל ב-SEO`
												: ""
										}${result.strategies.failed > 0 ? ` · ${result.strategies.failed} נכשלו` : ""}`
									}
								/>
								<Step
									label="תוכנית עבודה"
									ok={result.workPlan.ran && !result.workPlan.error}
									detail={
										result.workPlan.error ||
										(result.workPlan.ran
											? `${result.workPlan.totalItems} פריטים · ${result.workPlan.safeItemsCount} בטוחים · ${result.workPlan.reviewItemsCount} סקירה · ${result.workPlan.blockedItemsCount} חסומים`
											: "דולג")
									}
								/>

								<div className="pt-3 border-t border-ninja-line flex items-center justify-between flex-wrap gap-2">
									<Link
										href="/automation"
										className="text-xs text-gold hover:text-blade"
									>
										צפה ב-AutomationRuns →
									</Link>
									<Link
										href={`/clients/${clientId}/work-plan`}
										className="text-xs text-gold hover:text-blade"
									>
										פתח תוכנית עבודה →
									</Link>
								</div>
							</div>
						)}

						{(result || error) && (
							<div className="flex items-center justify-end pt-3 mt-3 border-t border-ninja-line">
								<button
									type="button"
									onClick={() => setOpen(false)}
									className="rounded-md border border-ninja-line bg-ninja-panel/60 hover:bg-ninja-raised text-ink-dim px-4 py-2 text-sm"
								>
									סגור
								</button>
							</div>
						)}
					</div>
				</div>
			)}
		</>
	);
}

function Step({ label, ok, detail }: { label: string; ok: boolean; detail: string }) {
	return (
		<div className="flex items-start gap-2.5">
			<span
				className={`w-4 h-4 rounded border flex items-center justify-center text-[10px] shrink-0 mt-0.5 ${
					ok ? "bg-go/20 border-go/40 text-go" : "bg-gold/10 border-gold/40 text-gold"
				}`}
			>
				{ok ? "✓" : "•"}
			</span>
			<div className="flex-1">
				<div className="text-ink">{label}</div>
				<div className="text-ink-mute text-[11px] mt-0.5">{detail}</div>
			</div>
		</div>
	);
}
