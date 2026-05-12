import Link from "next/link";
import { notFound } from "next/navigation";
import { Search, RefreshCw, ExternalLink, AlertCircle } from "lucide-react";
import { db } from "@/lib/db";
import { isGscConfigured } from "@/lib/gsc";
import {
	syncGsc,
	disconnectGsc,
	pickProperty,
	loadProperties,
} from "@/app/actions-gsc";

export const dynamic = "force-dynamic";

interface PageProps {
	params: Promise<{ id: string }>;
	searchParams: Promise<{ gsc_error?: string }>;
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

export default async function SearchConsolePage({ params, searchParams }: PageProps) {
	const { id } = await params;
	const { gsc_error } = await searchParams;

	const client = await db.client.findUnique({
		where: { id },
		include: { gscConnection: true },
	});
	if (!client) notFound();

	const configured = isGscConfigured();

	// ─── Case 1: server-side OAuth env vars not present (pre-tomorrow setup)
	if (!configured) {
		return (
			<div className="rounded-xl border-2 border-dashed border-ninja-line-strong bg-ninja-panel/60 px-8 py-16 text-center space-y-4">
				<div className="mx-auto w-12 h-12 rounded-full bg-ninja-raised flex items-center justify-center">
					<Search className="w-5 h-5 text-ink-dim" />
				</div>
				<div className="space-y-2 max-w-md mx-auto">
					<h2 className="text-lg font-medium text-ink">
						Search Console integration not yet active
					</h2>
					<p className="text-sm text-ink-dim leading-relaxed">
						Add <code className="text-xs bg-ninja-raised px-1 py-0.5 rounded">GOOGLE_CLIENT_ID</code> and <code className="text-xs bg-ninja-raised px-1 py-0.5 rounded">GOOGLE_CLIENT_SECRET</code> to <code className="text-xs bg-ninja-raised px-1 py-0.5 rounded">.env</code>, plus the three GCP Console steps documented in the handoff (redirect URI, scope, API enablement). Restart the dev server and this tab becomes interactive.
					</p>
				</div>
			</div>
		);
	}

	// ─── Case 2: configured but not yet connected for this client
	if (!client.gscConnection) {
		return (
			<div className="space-y-5">
				{gsc_error && (
					<div className="rounded-md border border-blade/30 bg-blade/10 px-4 py-3 text-sm text-ink flex items-start gap-2">
						<AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
						<div>OAuth error: {decodeURIComponent(gsc_error)}</div>
					</div>
				)}
				<div className="rounded-xl border-2 border-dashed border-ninja-line-strong bg-ninja-panel/60 px-8 py-16 text-center space-y-5">
					<div className="mx-auto w-12 h-12 rounded-full bg-ninja-raised flex items-center justify-center">
						<Search className="w-5 h-5 text-ink-dim" />
					</div>
					<div className="space-y-2 max-w-md mx-auto">
						<h2 className="text-lg font-medium text-ink">
							Connect Search Console
						</h2>
						<p className="text-sm text-ink-dim leading-relaxed">
							Sign in with a Google account that has access to this client&apos;s Search Console property. We&apos;ll pull the last 28 days of queries, impressions, clicks, and positions.
						</p>
					</div>
					<a
						href={`/api/gsc/connect/${id}`}
						className="inline-flex items-center gap-2 rounded-md bg-blade px-5 py-2.5 text-sm text-white hover:opacity-90"
					>
						<Search className="w-3.5 h-3.5" />
						Connect with Google
					</a>
				</div>
			</div>
		);
	}

	const conn = client.gscConnection;

	// ─── Case 3: connected but no property picked yet
	if (!conn.propertyUrl) {
		let properties: Awaited<ReturnType<typeof loadProperties>> = [];
		let loadError: string | null = null;
		try {
			properties = await loadProperties(id);
		} catch (err) {
			loadError = (err as Error).message;
		}
		const pickWithId = pickProperty.bind(null, id);
		const disconnectWithId = disconnectGsc.bind(null, id);

		return (
			<div className="space-y-5">
				<div className="rounded-lg bg-ninja-raised px-4 py-3 text-xs text-ink-dim">
					Connected as <span className="font-medium text-ink">{conn.googleEmail}</span>.{" "}
					<form action={disconnectWithId} className="inline">
						<button type="submit" className="underline hover:text-ink">
							Disconnect
						</button>
					</form>
				</div>

				{loadError && (
					<div className="rounded-md border border-blade/30 bg-blade/10 px-4 py-3 text-sm text-ink">
						Failed to load properties: {loadError}
					</div>
				)}

				<div className="rounded-xl border border-ninja-line bg-ninja-panel/60 p-6 space-y-4">
					<div>
						<h2 className="text-lg font-medium text-ink">Choose a property</h2>
						<p className="text-sm text-ink-dim mt-1">
							Pick the Search Console property to pull data from for this client.
						</p>
					</div>
					{properties.length === 0 ? (
						<p className="text-sm text-ink-dim">
							No Search Console properties found on this Google account.
						</p>
					) : (
						<form action={pickWithId} className="space-y-3">
							<div className="divide-y divide-ninja-line rounded-md border border-ninja-line">
								{properties.map((p) => (
									<label
										key={p.siteUrl}
										className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-ninja-raised"
									>
										<input
											type="radio"
											name="propertyUrl"
											value={p.siteUrl}
											required
										/>
										<div className="flex-1 min-w-0">
											<div className="text-sm font-medium text-ink font-mono truncate">
												{p.siteUrl}
											</div>
											<div className="text-xs text-ink-dim">
												{p.permissionLevel}
											</div>
										</div>
									</label>
								))}
							</div>
							<button
								type="submit"
								className="inline-flex items-center rounded-md bg-blade px-4 py-2 text-sm text-white hover:opacity-90"
							>
								Save selection
							</button>
						</form>
					)}
				</div>
			</div>
		);
	}

	// ─── Case 4: fully connected with a property — show data
	const rows = await db.gscDailyRow.findMany({
		where: { clientId: id },
		orderBy: [{ date: "desc" }],
	});

	// Aggregate to top queries (by clicks) over the full stored range
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
	const disconnectWithId = disconnectGsc.bind(null, id);

	return (
		<div className="space-y-8">
			{/* Connection meta strip */}
			<div className="flex items-center justify-between gap-4 text-xs text-ink-dim">
				<div className="flex flex-wrap gap-x-6 gap-y-1">
					<span>
						Connected as <span className="text-ink font-medium">{conn.googleEmail}</span>
					</span>
					<span>
						Property <span className="text-ink font-mono">{conn.propertyUrl}</span>
					</span>
					<span>Last sync {timeAgo(conn.lastSyncAt)}</span>
				</div>
				<div className="flex gap-3 shrink-0">
					<form action={syncWithId}>
						<button
							type="submit"
							className="inline-flex items-center gap-1.5 rounded-md bg-blade px-3 py-1.5 text-xs text-white hover:opacity-90"
						>
							<RefreshCw className="w-3 h-3" />
							Sync now
						</button>
					</form>
					<form action={disconnectWithId}>
						<button type="submit" className="text-xs text-ink-dim hover:text-ink underline">
							Disconnect
						</button>
					</form>
				</div>
			</div>

			{/* Summary metrics */}
			{rows.length === 0 ? (
				<div className="rounded-xl border-2 border-dashed border-ninja-line-strong bg-ninja-panel/60 px-8 py-16 text-center">
					<div className="space-y-4 max-w-md mx-auto">
						<h2 className="text-lg font-medium text-ink">No data yet</h2>
						<p className="text-sm text-ink-dim">
							Click <span className="font-medium">Sync now</span> to pull the last 28 days from Search Console.
						</p>
					</div>
				</div>
			) : (
				<>
					<div className="grid grid-cols-3 gap-4">
						<Metric label="Clicks" value={totalClicks.toLocaleString()} />
						<Metric label="Impressions" value={totalImpressions.toLocaleString()} />
						<Metric
							label="Avg CTR"
							value={`${(avgCtr * 100).toFixed(2)}%`}
						/>
					</div>

					{/* Top queries table */}
					<section className="space-y-3">
						<div className="flex items-baseline justify-between">
							<h2 className="text-sm font-medium text-ink uppercase tracking-wider">
								Top queries · last 28 days
							</h2>
							<span className="text-xs text-ink-dim">
								{topQueries.length} of {byQuery.size}
							</span>
						</div>
						<div className="overflow-hidden rounded-lg border border-ninja-line bg-ninja-panel/60">
							<div className="max-h-[600px] overflow-y-auto">
								<table className="w-full text-sm">
									<thead className="bg-ninja-raised text-left text-xs uppercase tracking-wider text-ink-dim sticky top-0">
										<tr>
											<th className="px-4 py-2.5 font-medium">Query</th>
											<th className="px-4 py-2.5 font-medium text-right">Clicks</th>
											<th className="px-4 py-2.5 font-medium text-right">Impressions</th>
											<th className="px-4 py-2.5 font-medium text-right">CTR</th>
											<th className="px-4 py-2.5 font-medium text-right">Position</th>
										</tr>
									</thead>
									<tbody className="divide-y divide-ninja-line">
										{topQueries.map((q) => (
											<tr key={q.query}>
												<td className="px-4 py-2.5 font-medium text-ink max-w-md truncate">
													{q.query}
												</td>
												<td className="px-4 py-2.5 text-right tabular-nums">
													{q.clicks.toLocaleString()}
												</td>
												<td className="px-4 py-2.5 text-right tabular-nums text-ink-dim">
													{q.impressions.toLocaleString()}
												</td>
												<td className="px-4 py-2.5 text-right tabular-nums text-ink-dim">
													{(q.ctr * 100).toFixed(1)}%
												</td>
												<td className="px-4 py-2.5 text-right tabular-nums text-ink-dim">
													{q.position.toFixed(1)}
												</td>
											</tr>
										))}
									</tbody>
								</table>
							</div>
						</div>
					</section>

					<p className="text-xs text-ink-dim">
						Data has a ~2-day delay (Google&apos;s standard).{" "}
						<a
							href={`https://search.google.com/search-console?resource_id=${encodeURIComponent(conn.propertyUrl)}`}
							target="_blank"
							rel="noopener noreferrer"
							className="inline-flex items-center gap-1 underline hover:text-ink"
						>
							Open in Search Console
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
			<div className="text-2xl font-semibold text-ink mt-1 tabular-nums">{value}</div>
		</div>
	);
}
