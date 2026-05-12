import Link from "next/link";
import { notFound } from "next/navigation";
import { Search, RefreshCw, ExternalLink, Plug } from "lucide-react";
import { db } from "@/lib/db";
import { isGscConfigured } from "@/lib/gsc";
import { syncGsc, unassignProperty } from "@/app/actions-gsc";

export const dynamic = "force-dynamic";

interface PageProps {
	params: Promise<{ id: string }>;
}

function timeAgo(date: Date | null): string {
	if (!date) return "never";
	const ms = Date.now() - date.getTime();
	const min = Math.floor(ms / 60_000);
	if (min < 1) return "just now";
	if (min < 60) return `${min} min ago`;
	const hr = Math.floor(min / 60);
	if (hr < 24) return `${hr} hr ago`;
	const d = Math.floor(hr / 24);
	return `${d}d ago`;
}

export default async function SearchConsolePage({ params }: PageProps) {
	const { id } = await params;

	const client = await db.client.findUnique({ where: { id } });
	if (!client) notFound();

	const configured = isGscConfigured();
	const account = await db.gscAccount.findFirst();

	if (!configured) {
		return (
			<EmptyState
				title="Search Console integration not yet active"
				body={
					<>
						Add <Code>GOOGLE_CLIENT_ID</Code>, <Code>GOOGLE_CLIENT_SECRET</Code>, and{" "}
						<Code>GOOGLE_OAUTH_REDIRECT</Code> to <Code>.env</Code> (and to Vercel) to enable.
					</>
				}
			/>
		);
	}

	if (!account) {
		return (
			<EmptyState
				title="חשבון Google לא מחובר עדיין"
				body={
					<>
						לפני שאפשר לשייך property ללקוח הזה, צריך לחבר חשבון Google אחד ברמת הסוכנות.
					</>
				}
				cta={
					<Link
						href="/integrations"
						className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold text-white"
						style={{ background: "linear-gradient(135deg, #ff2a3c, #b3001b)" }}
					>
						<Plug className="w-4 h-4" />
						לעמוד החיבורים
					</Link>
				}
			/>
		);
	}

	if (!client.gscPropertyUrl) {
		return (
			<EmptyState
				title="לא משויך property ללקוח הזה"
				body={
					<>
						חשבון Google מחובר (<span className="text-ink font-mono">{account.googleEmail}</span>),
						אבל צריך לשייך property ספציפי ללקוח הזה מתוך עמוד החיבורים.
					</>
				}
				cta={
					<Link
						href="/integrations"
						className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold text-white"
						style={{ background: "linear-gradient(135deg, #ff2a3c, #b3001b)" }}
					>
						<Search className="w-4 h-4" />
						לשייך property
					</Link>
				}
			/>
		);
	}

	const rows = await db.gscDailyRow.findMany({
		where: { clientId: id },
		orderBy: [{ date: "desc" }],
	});

	const byQuery = new Map<
		string,
		{ clicks: number; impressions: number; positionSum: number; days: number }
	>();
	for (const r of rows) {
		const prev = byQuery.get(r.query) ?? { clicks: 0, impressions: 0, positionSum: 0, days: 0 };
		prev.clicks += r.clicks;
		prev.impressions += r.impressions;
		prev.positionSum += r.position;
		prev.days += 1;
		byQuery.set(r.query, prev);
	}
	const topQueries = Array.from(byQuery.entries())
		.map(([query, v]) => ({
			query,
			clicks: v.clicks,
			impressions: v.impressions,
			ctr: v.impressions > 0 ? v.clicks / v.impressions : 0,
			position: v.days > 0 ? v.positionSum / v.days : 0,
		}))
		.sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions)
		.slice(0, 50);

	const totalClicks = rows.reduce((s, r) => s + r.clicks, 0);
	const totalImpressions = rows.reduce((s, r) => s + r.impressions, 0);
	const avgCtr = totalImpressions > 0 ? totalClicks / totalImpressions : 0;

	const syncWithId = syncGsc.bind(null, id);
	const unassignWithId = unassignProperty.bind(null, id);

	return (
		<div className="space-y-8">
			<div className="flex flex-wrap items-center justify-between gap-4 text-xs text-ink-dim">
				<div className="flex flex-wrap gap-x-6 gap-y-1">
					<span>
						חשבון <span className="text-ink font-mono">{account.googleEmail}</span>
					</span>
					<span>
						Property{" "}
						<span className="text-ink font-mono" dir="ltr">
							{client.gscPropertyUrl}
						</span>
					</span>
					<span>סנכרון אחרון {timeAgo(client.gscLastSyncAt)}</span>
				</div>
				<div className="flex gap-3 shrink-0">
					<form action={syncWithId}>
						<button
							type="submit"
							className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-bold text-white"
							style={{ background: "linear-gradient(135deg, #ff2a3c, #b3001b)" }}
						>
							<RefreshCw className="w-3 h-3" />
							סנכרון
						</button>
					</form>
					<form action={unassignWithId}>
						<button
							type="submit"
							className="text-xs text-ink-mute hover:text-blade underline"
						>
							הסר שיוך
						</button>
					</form>
				</div>
			</div>

			{rows.length === 0 ? (
				<EmptyState
					title="עדיין אין דאטה"
					body={
						<>
							לחץ <span className="text-ink font-bold">סנכרון</span> כדי לשאוב את 28 הימים האחרונים מ-Search Console.
						</>
					}
				/>
			) : (
				<>
					<div className="grid grid-cols-3 gap-4">
						<Metric label="קליקים" value={totalClicks.toLocaleString()} />
						<Metric label="הופעות" value={totalImpressions.toLocaleString()} />
						<Metric label="CTR ממוצע" value={`${(avgCtr * 100).toFixed(2)}%`} />
					</div>

					<section className="space-y-3">
						<div className="flex items-baseline justify-between">
							<h2 className="text-xs font-bold tracking-[0.2em] uppercase text-ink-dim">
								שאילתות מובילות · 28 ימים אחרונים
							</h2>
							<span className="text-xs text-ink-mute">
								{topQueries.length} / {byQuery.size}
							</span>
						</div>
						<div className="overflow-hidden rounded-lg border border-ninja-line bg-ninja-panel/40">
							<div className="max-h-[600px] overflow-y-auto">
								<table className="w-full text-sm">
									<thead className="bg-ninja-raised text-xs uppercase tracking-wider text-ink-dim sticky top-0">
										<tr>
											<th className="px-4 py-2.5 font-bold text-right">שאילתה</th>
											<th className="px-4 py-2.5 font-bold text-left">קליקים</th>
											<th className="px-4 py-2.5 font-bold text-left">הופעות</th>
											<th className="px-4 py-2.5 font-bold text-left">CTR</th>
											<th className="px-4 py-2.5 font-bold text-left">מיקום</th>
										</tr>
									</thead>
									<tbody className="divide-y divide-ninja-line">
										{topQueries.map((q) => (
											<tr key={q.query}>
												<td className="px-4 py-2.5 font-medium text-ink max-w-md truncate">
													{q.query}
												</td>
												<td className="px-4 py-2.5 text-left tabular-nums text-ink">
													{q.clicks.toLocaleString()}
												</td>
												<td className="px-4 py-2.5 text-left tabular-nums text-ink-dim">
													{q.impressions.toLocaleString()}
												</td>
												<td className="px-4 py-2.5 text-left tabular-nums text-ink-dim">
													{(q.ctr * 100).toFixed(1)}%
												</td>
												<td className="px-4 py-2.5 text-left tabular-nums text-ink-dim">
													{q.position.toFixed(1)}
												</td>
											</tr>
										))}
									</tbody>
								</table>
							</div>
						</div>
					</section>

					<p className="text-xs text-ink-mute">
						לדאטה של Google יש עיכוב של ~2 ימים.{" "}
						<a
							href={`https://search.google.com/search-console?resource_id=${encodeURIComponent(client.gscPropertyUrl)}`}
							target="_blank"
							rel="noopener noreferrer"
							className="inline-flex items-center gap-1 text-gold hover:text-blade"
						>
							פתח ב-Search Console
							<ExternalLink className="w-3 h-3" />
						</a>
					</p>
				</>
			)}
		</div>
	);
}

function Metric({ label, value }: { label: string; value: string }) {
	return (
		<div className="rounded-lg border border-ninja-line bg-ninja-panel/60 p-5">
			<div className="text-xs text-ink-dim uppercase tracking-wider">{label}</div>
			<div className="font-display text-3xl text-ink mt-1 tabular-nums">{value}</div>
		</div>
	);
}

function Code({ children }: { children: React.ReactNode }) {
	return (
		<code className="text-xs bg-ninja-raised border border-ninja-line text-gold px-1.5 py-0.5 rounded">
			{children}
		</code>
	);
}

function EmptyState({
	title,
	body,
	cta,
}: {
	title: string;
	body: React.ReactNode;
	cta?: React.ReactNode;
}) {
	return (
		<div className="rounded-xl border-2 border-dashed border-ninja-line bg-ninja-panel/40 px-8 py-16 text-center space-y-5">
			<div className="mx-auto w-12 h-12 rounded-full bg-ninja-raised border border-ninja-line flex items-center justify-center">
				<Search className="w-5 h-5 text-gold" />
			</div>
			<div className="space-y-2 max-w-md mx-auto">
				<h2 className="font-display text-xl text-ink">{title}</h2>
				<p className="text-sm text-ink-dim leading-relaxed">{body}</p>
			</div>
			{cta}
		</div>
	);
}
