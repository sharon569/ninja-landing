import { notFound } from "next/navigation";
import { Printer } from "lucide-react";
import { db } from "@/lib/db";
import type { Finding } from "@/lib/audit/types";

export const dynamic = "force-dynamic";

const SEVERITY_LABEL: Record<string, string> = {
	high: "קריטי",
	medium: "חשוב",
	low: "מינורי",
	info: "מידע",
};

const SEVERITY_BAR: Record<string, string> = {
	high: "bg-blade",
	medium: "bg-gold",
	low: "bg-sky-400",
	info: "bg-zinc-400",
};

const SEVERITY_BG: Record<string, string> = {
	high: "bg-blade/10 border-blade/30",
	medium: "bg-gold/10 border-gold/30",
	low: "bg-sky-50 border-sky-200",
	info: "bg-ninja-raised border-ninja-line",
};

export default async function ReportPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;
	const client = await db.client.findUnique({
		where: { id },
		include: {
			scans: {
				orderBy: { ranAt: "desc" },
				take: 1,
				include: {
					findings: { orderBy: [{ severity: "asc" }, { count: "desc" }] },
				},
			},
		},
	});
	if (!client) notFound();

	const latestScan = client.scans[0];
	if (!latestScan) {
		return (
			<div className="rounded-xl border-2 border-dashed border-ninja-line-strong bg-ninja-panel/60 px-8 py-16 text-center text-sm text-ink-dim">
				אין סריקה עדיין. להריץ סריקה ראשונה מטאב הסקירה כדי לייצר דוח.
			</div>
		);
	}

	// GSC headline (if available, last 28d aggregate)
	const gscRows = await db.gscDailyRow.findMany({ where: { clientId: id } });
	const totalClicks = gscRows.reduce((s, r) => s + r.clicks, 0);
	const totalImpressions = gscRows.reduce((s, r) => s + r.impressions, 0);
	const hasGsc = gscRows.length > 0;

	// Top 5 active opportunities for the client-facing recommendations section
	const topOpps = await db.opportunity.findMany({
		where: {
			clientId: id,
			status: { in: ["detected", "recommended", "needs_human_review", "approved"] },
		},
		orderBy: { priorityScore: "desc" },
		take: 5,
	});

	// Monitoring section (recent actions whose impact we're tracking)
	const monitoringActions = await db.opportunity.findMany({
		where: { clientId: id, status: { in: ["monitoring", "manually_applied", "impact_reviewed"] } },
		orderBy: { manuallyAppliedAt: "desc" },
		take: 5,
		include: { impactReviews: { orderBy: { reviewWindow: "asc" } } },
	});

	// Top approved/used briefs for the client-facing "תוכניות תוכן בהכנה" section
	const upcomingBriefs = await db.contentBrief.findMany({
		where: {
			clientId: id,
			status: { in: ["approved", "needs_human_review"] },
		},
		orderBy: { createdAt: "desc" },
		take: 3,
	});

	// Top internal-link suggestions for the client-facing section
	const topLinkSuggestions = await db.internalLinkSuggestion.findMany({
		where: {
			clientId: id,
			status: { in: ["suggested", "needs_human_review", "approved"] },
		},
		orderBy: { priorityScore: "desc" },
		take: 3,
	});

	const findings = latestScan.findings.map(
		(f) => ({ ...f, parsed: JSON.parse(f.payload) as Finding }),
	);
	const summary = JSON.parse(latestScan.summary) as {
		urls_total?: number;
		products?: number;
	};

	// Severity counts
	const severityBuckets = findings.reduce(
		(acc, f) => {
			acc[f.severity] = (acc[f.severity] ?? 0) + f.count;
			return acc;
		},
		{} as Record<string, number>,
	);
	const totalIssueUrls = Object.values(severityBuckets).reduce((a, b) => a + b, 0);
	const totalUrls = summary.urls_total ?? 0;
	const healthyPercent =
		totalUrls > 0 ? Math.max(0, 100 - (totalIssueUrls / totalUrls) * 100) : 100;
	const reportDate = new Date(latestScan.ranAt);

	return (
		<div className="space-y-10 print:space-y-6">
			{/* Print bar */}
			<div className="flex justify-start print:hidden">
				<a
					href="javascript:window.print()"
					className="inline-flex items-center gap-2 rounded-md border border-ninja-line bg-ninja-panel/60 px-4 py-2 text-sm text-ink hover:bg-ninja-raised"
				>
					<Printer className="w-3.5 h-3.5" />
					הדפסה או שמירה כ-PDF
				</a>
			</div>

			{/* Cover */}
			<header className="space-y-4 border-b border-ninja-line pb-8">
				<div className="text-xs uppercase tracking-widest text-ink-dim">
					דוח בריאות SEO
				</div>
				<h1 className="text-4xl font-semibold tracking-tight text-ink">
					{client.name}
				</h1>
				<div className="flex flex-wrap gap-x-8 gap-y-1 text-sm text-ink-dim">
					<span>
						{reportDate.toLocaleDateString("he-IL", {
							year: "numeric",
							month: "long",
							day: "numeric",
						})}
					</span>
					<span>·</span>
					<span>הוכן על ידי NINJA Digital</span>
				</div>
			</header>

			{/* Executive summary — what a non-technical client needs to know in 10 seconds */}
			<section className="space-y-5">
				<h2 className="text-xs font-medium uppercase tracking-wider text-ink-dim">
					סיכום מנהלים
				</h2>
				<p className="text-lg text-zinc-800 leading-relaxed max-w-3xl">
					{totalIssueUrls === 0 ? (
						<>
							סרקנו <strong>{totalUrls.toLocaleString()} דפים</strong> בחנות שלכם ולא מצאנו ממצאי SEO משמעותיים. האופטימיזציה בעמוד באתר במצב טוב.
						</>
					) : (
						<>
							סרקנו <strong>{totalUrls.toLocaleString()} דפים</strong> בחנות שלכם ומצאנו{" "}
							<strong>{findings.length} סוגי ממצאי SEO</strong> שמשפיעים על{" "}
							<strong>{totalIssueUrls.toLocaleString()} דפים</strong>. רוב הממצאים הם תיקונים מהירים שאחרי שטיפלנו בהם, ישפרו משמעותית את כמות הפעמים שהמוצרים שלכם מופיעים ומקבלים הקלקה ב-Google.
						</>
					)}
				</p>
			</section>

			{/* Headline metrics */}
			<section className="grid grid-cols-2 md:grid-cols-4 gap-4">
				<HeadlineMetric
					label="דפים שנסרקו"
					value={totalUrls.toLocaleString()}
				/>
				<HeadlineMetric
					label="תקינים"
					value={`${healthyPercent.toFixed(0)}%`}
					tone={healthyPercent >= 80 ? "good" : healthyPercent >= 50 ? "warn" : "bad"}
				/>
				<HeadlineMetric
					label="סוגי ממצאים"
					value={String(findings.length)}
				/>
				<HeadlineMetric
					label="דפים שדורשים טיפול"
					value={totalIssueUrls.toLocaleString()}
					tone={totalIssueUrls > 0 ? "warn" : "good"}
				/>
			</section>

			{/* Severity breakdown bar */}
			{totalIssueUrls > 0 && (
				<section className="space-y-3">
					<h2 className="text-xs font-medium uppercase tracking-wider text-ink-dim">
						התפלגות הממצאים
					</h2>
					<div className="flex h-3 w-full overflow-hidden rounded-full bg-ninja-raised">
						{(["high", "medium", "low", "info"] as const).map((sev) => {
							const count = severityBuckets[sev] ?? 0;
							const pct = totalIssueUrls > 0 ? (count / totalIssueUrls) * 100 : 0;
							if (pct === 0) return null;
							return (
								<div
									key={sev}
									className={SEVERITY_BAR[sev]}
									style={{ width: `${pct}%` }}
									title={`${SEVERITY_LABEL[sev]}: ${count}`}
								/>
							);
						})}
					</div>
					<div className="flex flex-wrap gap-x-6 gap-y-1 text-xs">
						{(["high", "medium", "low", "info"] as const).map((sev) => {
							const count = severityBuckets[sev] ?? 0;
							if (count === 0) return null;
							return (
								<div key={sev} className="flex items-center gap-2">
									<span className={`w-2.5 h-2.5 rounded-full ${SEVERITY_BAR[sev]}`} />
									<span className="text-ink">
										<span className="font-medium">{SEVERITY_LABEL[sev]}</span> · {count.toLocaleString()} דפים
									</span>
								</div>
							);
						})}
					</div>
				</section>
			)}

			{/* GSC strip if connected */}
			{hasGsc && (
				<section className="space-y-3">
					<h2 className="text-xs font-medium uppercase tracking-wider text-ink-dim">
						הביצועים שלכם ב-Google ב-28 הימים האחרונים
					</h2>
					<div className="grid grid-cols-2 md:grid-cols-3 gap-4">
						<HeadlineMetric label="הופעות בחיפוש" value={totalImpressions.toLocaleString()} />
						<HeadlineMetric label="הקלקות מחיפוש" value={totalClicks.toLocaleString()} />
						<HeadlineMetric
							label="שיעור הקלקה"
							value={
								totalImpressions > 0
									? `${((totalClicks / totalImpressions) * 100).toFixed(1)}%`
									: "—"
							}
						/>
					</div>
				</section>
			)}

			{/* Issues — each with plain-language explanation + business impact */}
			{findings.length > 0 && (
				<section className="space-y-5">
					<h2 className="text-xs font-medium uppercase tracking-wider text-ink-dim">
						ממצאים לטיפול, בסדר עדיפויות
					</h2>
					<div className="space-y-4">
						{findings.map((f, idx) => (
							<article
								key={f.id}
								className={`rounded-xl border ${SEVERITY_BG[f.severity] ?? SEVERITY_BG.info} p-6`}
							>
								<div className="flex items-start gap-4">
									<div className="flex-shrink-0 w-8 h-8 rounded-full bg-ninja-panel/60 border border-ninja-line flex items-center justify-center text-sm font-semibold text-ink">
										{idx + 1}
									</div>
									<div className="flex-1 min-w-0 space-y-3">
										<div className="flex items-baseline justify-between gap-4">
											<h3 className="text-lg font-semibold text-ink">
												{f.parsed.title}
											</h3>
											<div className="text-left shrink-0">
												<div className="text-2xl font-semibold text-ink tabular-nums leading-none">
													{f.count.toLocaleString()}
												</div>
												<div className="text-xs text-ink-dim uppercase tracking-wider mt-1">
													דפים
												</div>
											</div>
										</div>
										<p className="text-sm text-ink leading-relaxed max-w-3xl">
											{f.parsed.description}
										</p>
										{f.parsed.fixHint && (
											<div className="rounded-md bg-ninja-panel/60/70 border border-ninja-line px-4 py-3">
												<div className="text-xs uppercase tracking-wider text-ink-dim mb-1">
													מה נעשה
												</div>
												<p className="text-sm text-ink leading-relaxed">
													{f.parsed.fixHint}
												</p>
											</div>
										)}
									</div>
								</div>
							</article>
						))}
					</div>
				</section>
			)}

			{/* Opportunities — client-friendly recommendations */}
			{topOpps.length > 0 && (
				<section className="space-y-5">
					<h2 className="text-xs font-medium uppercase tracking-wider text-ink-dim">
						הזדמנויות SEO שזיהינו
					</h2>
					<p className="text-sm text-ink-dim max-w-3xl leading-relaxed">
						אלו ההזדמנויות המובילות שהמערכת זיהתה מתוך ניתוח הנתונים — בסדר עדיפויות, כאשר העליונה היא בעלת הפוטנציאל הגדול ביותר לתוצאות מהירות.
					</p>
					<ol className="space-y-3">
						{topOpps.map((o, i) => (
							<li
								key={o.id}
								className="rounded-xl border border-ninja-line bg-ninja-panel/40 px-6 py-5"
							>
								<div className="flex items-start gap-4">
									<div className="flex-shrink-0 w-7 h-7 rounded-full bg-ninja-raised border border-ninja-line flex items-center justify-center text-sm font-semibold text-ink">
										{i + 1}
									</div>
									<div className="flex-1 min-w-0">
										<h3 className="text-base font-semibold text-ink">{o.title}</h3>
										<p className="text-sm text-ink-dim mt-2 leading-relaxed">{o.description}</p>
										<div className="mt-3 rounded-md bg-ninja-raised/60 border border-ninja-line px-4 py-3">
											<div className="text-[11px] uppercase tracking-wider text-ink-mute mb-1">
												מה אנחנו עומדים לעשות
											</div>
											<p className="text-sm text-ink leading-relaxed">{o.recommendedAction}</p>
										</div>
									</div>
								</div>
							</li>
						))}
					</ol>
				</section>
			)}

			{/* Internal link opportunities — client-friendly */}
			{topLinkSuggestions.length > 0 && (
				<section className="space-y-5">
					<h2 className="text-xs font-medium uppercase tracking-wider text-ink-dim">
						הזדמנויות לקישורים פנימיים
					</h2>
					<p className="text-sm text-ink-dim max-w-3xl leading-relaxed">
						זיהינו עמודים חשובים שיכולים לקבל קישורים פנימיים נוספים מעמודים אחרים באתר. קישורים פנימיים נכונים מחזקים את העמודים הרלוונטיים בעיני גוגל, ועוזרים למשתמשים למצוא את התוכן הנכון.
					</p>
					<ul className="space-y-3">
						{topLinkSuggestions.map((s) => (
							<li
								key={s.id}
								className="rounded-xl border border-ninja-line bg-ninja-panel/40 px-6 py-5"
							>
								<div className="text-sm text-ink leading-relaxed">
									<span className="font-semibold">חיזוק עמוד:</span>{" "}
									<span className="text-ink-dim">{s.targetTitle || s.targetPage}</span>
								</div>
								<p className="text-sm text-ink-dim mt-2 leading-relaxed">
									{s.reason}
								</p>
							</li>
						))}
					</ul>
				</section>
			)}

			{/* Upcoming content plans — friendly preview for the client */}
			{upcomingBriefs.length > 0 && (
				<section className="space-y-5">
					<h2 className="text-xs font-medium uppercase tracking-wider text-ink-dim">
						תוכניות תוכן בהכנה
					</h2>
					<p className="text-sm text-ink-dim max-w-3xl leading-relaxed">
						אלו תוכניות תוכן שהמערכת והצוות מכינים עבורכם. כל תוכנית מבוססת על הזדמנות שזיהינו בנתונים — ופועלת לחזק את העמוד או ליצור תוכן חדש שיביא תנועה רלוונטית.
					</p>
					<ol className="space-y-3">
						{upcomingBriefs.map((b) => (
							<li
								key={b.id}
								className="rounded-xl border border-ninja-line bg-ninja-panel/40 px-6 py-5"
							>
								<div className="flex flex-wrap items-baseline justify-between gap-2">
									<h3 className="text-base font-semibold text-ink">{b.targetKeyword}</h3>
									{b.recommendedTitle && (
										<span className="text-xs text-ink-dim italic max-w-md truncate">
											{b.recommendedTitle}
										</span>
									)}
								</div>
								{b.contentAngle && (
									<p className="text-sm text-ink-dim mt-2 leading-relaxed">
										<span className="text-[11px] uppercase tracking-wider text-ink-mute mr-2">
											המטרה:
										</span>
										{b.contentAngle}
									</p>
								)}
							</li>
						))}
					</ol>
				</section>
			)}

			{/* Monitoring — friendly version for the client */}
			{monitoringActions.length > 0 && (
				<section className="space-y-5">
					<h2 className="text-xs font-medium uppercase tracking-wider text-ink-dim">
						פעולות שנמצאות במעקב
					</h2>
					<p className="text-sm text-ink-dim max-w-3xl leading-relaxed">
						אלו הפעולות שביצענו לאחרונה. אנחנו עוקבים אחרי הביצועים בכל פעולה במשך 7–30 ימים אחרי הביצוע כדי לדעת מה עבד ומה דורש המשך טיפול.
					</p>
					<ol className="space-y-3">
						{monitoringActions.map((m) => {
							const latestReview = m.impactReviews[m.impactReviews.length - 1];
							return (
								<li
									key={m.id}
									className="rounded-xl border border-ninja-line bg-ninja-panel/40 px-6 py-5"
								>
									<div className="flex flex-wrap items-baseline justify-between gap-2">
										<h3 className="text-base font-semibold text-ink">{m.title}</h3>
										{m.manuallyAppliedAt && (
											<span className="text-xs text-ink-dim">
												בוצע ב-{new Date(m.manuallyAppliedAt).toLocaleDateString("he-IL")}
											</span>
										)}
									</div>
									{m.manualActionNote && (
										<p className="text-sm text-ink-dim mt-2 leading-relaxed">
											{m.manualActionNote}
										</p>
									)}
									{latestReview ? (
										<p className="text-sm text-ink mt-3 leading-relaxed">
											<span className="text-[11px] uppercase tracking-wider text-ink-mute mr-2">
												מדידה ({latestReview.reviewWindow}):
											</span>
											{latestReview.summary}
										</p>
									) : (
										<p className="text-xs text-ink-mute mt-3 italic">
											ממתינים לנתוני השפעה — נציג כאן את התוצאה ברגע שהמערכת תאסוף מספיק נתונים מאחרי הביצוע.
										</p>
									)}
								</li>
							);
						})}
					</ol>
				</section>
			)}

			{/* Footer / Next steps */}
			<footer className="border-t border-ninja-line pt-8 space-y-3">
				<h2 className="text-xs font-medium uppercase tracking-wider text-ink-dim">
					הצעדים הבאים
				</h2>
				<p className="text-sm text-ink leading-relaxed max-w-3xl">
					נתחיל מהממצאים בעלי ההשפעה הגדולה ביותר מהרשימה למעלה. כל תיקון נמדד, והדוח הבא, שייוצר אחרי שהשינויים שלנו עלו לאוויר, יראה את השיפור המדיד בכיסוי ובשיעור ההקלקה.
				</p>
				<p className="text-xs text-ink-dim pt-4">
					הדוח נוצר אוטומטית מסריקה עמוקה של כל הדפים הציבוריים בחנות שלכם. הנתונים עדכניים נכון ל-{reportDate.toLocaleString("he-IL")}.
				</p>
			</footer>
		</div>
	);
}

function HeadlineMetric({
	label,
	value,
	tone = "neutral",
}: {
	label: string;
	value: string;
	tone?: "neutral" | "good" | "warn" | "bad";
}) {
	const valueColor =
		tone === "good"
			? "text-go"
			: tone === "warn"
				? "text-amber-700"
				: tone === "bad"
					? "text-red-700"
					: "text-ink";
	return (
		<div className="rounded-lg border border-ninja-line bg-ninja-panel/60 p-5">
			<div className="text-xs text-ink-dim uppercase tracking-wider">{label}</div>
			<div className={`text-3xl font-semibold ${valueColor} mt-2 tabular-nums`}>
				{value}
			</div>
		</div>
	);
}
