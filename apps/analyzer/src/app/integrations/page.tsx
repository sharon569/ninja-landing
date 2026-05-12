import Link from "next/link";
import { Search, ExternalLink, AlertCircle, CheckCircle2, Plug, RefreshCw, Trash2 } from "lucide-react";
import { db } from "@/lib/db";
import { isGscConfigured } from "@/lib/gsc";
import {
	assignProperty,
	disconnectGsc,
	loadProperties,
	syncAllGsc,
	unassignProperty,
} from "@/app/actions-gsc";

export const dynamic = "force-dynamic";

function hostOf(url: string): string {
	try {
		return new URL(url).host;
	} catch {
		return url;
	}
}

/** Strip protocol / leading "sc-domain:" / trailing slash so we can fuzzy-match. */
function normalize(s: string): string {
	return s
		.replace(/^sc-domain:/, "")
		.replace(/^https?:\/\//, "")
		.replace(/^www\./, "")
		.replace(/\/.*$/, "")
		.toLowerCase();
}

function timeAgo(d: Date | null): string {
	if (!d) return "אף פעם";
	const ms = Date.now() - d.getTime();
	const min = Math.floor(ms / 60_000);
	if (min < 1) return "ממש עכשיו";
	if (min < 60) return `לפני ${min} דק׳`;
	const hr = Math.floor(min / 60);
	if (hr < 24) return `לפני ${hr} שע׳`;
	const dd = Math.floor(hr / 24);
	return `לפני ${dd} ימים`;
}

export default async function IntegrationsPage({
	searchParams,
}: {
	searchParams: Promise<{ gsc_error?: string }>;
}) {
	const sp = await searchParams;
	const configured = isGscConfigured();
	const account = await db.gscAccount.findFirst();
	const clients = await db.client.findMany({ orderBy: { name: "asc" } });

	let properties: Awaited<ReturnType<typeof loadProperties>> = [];
	let propsError: string | null = null;
	if (account) {
		try {
			properties = await loadProperties();
		} catch (err) {
			propsError = (err as Error).message;
		}
	}

	// Suggest a client for each property based on domain match.
	const clientByDomain = new Map<string, typeof clients[number]>();
	for (const c of clients) clientByDomain.set(normalize(c.baseUrl), c);

	return (
		<div className="space-y-10">
			<div>
				<span className="inline-block text-[10px] font-bold tracking-[0.25em] uppercase text-blade border border-blade/30 bg-blade/10 px-2.5 py-1 rounded-full mb-3">
					INTEGRATIONS
				</span>
				<h1 className="font-display text-4xl text-ink">
					חיבורים ל-<span className="text-brand-gradient">מקורות מידע</span>
				</h1>
				<p className="text-sm text-ink-dim mt-2">
					חבר חשבון Google מרכזי כדי לשאוב נתוני Search Console לכל הלקוחות.
				</p>
			</div>

			{sp.gsc_error && (
				<div className="rounded-lg border border-blade/30 bg-blade/10 px-5 py-4 flex items-start gap-3">
					<AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-blade" />
					<div className="text-sm text-ink">{decodeURIComponent(sp.gsc_error)}</div>
				</div>
			)}

			<section className="rounded-xl border border-ninja-line bg-ninja-panel/60 p-6 space-y-5">
				<div className="flex items-start justify-between gap-4">
					<div className="flex items-center gap-3">
						<div className="w-10 h-10 rounded-lg bg-ninja-raised border border-ninja-line flex items-center justify-center">
							<Search className="w-5 h-5 text-gold" />
						</div>
						<div>
							<h2 className="font-display text-lg text-ink">Google Search Console</h2>
							<p className="text-xs text-ink-dim mt-0.5">
								נתוני הופעות, קליקים, CTR, ומיקום ממוצע — לכל property
							</p>
						</div>
					</div>

					{!configured ? (
						<span className="text-xs text-ink-mute">לא מוגדר ב-env</span>
					) : !account ? (
						<a
							href="/api/gsc/connect"
							className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold text-white shadow-[0_4px_14px_rgba(255,42,60,0.35)]"
							style={{ background: "linear-gradient(135deg, #ff2a3c, #b3001b)" }}
						>
							<Plug className="w-3.5 h-3.5" />
							התחבר עם Google
						</a>
					) : (
						<div className="flex items-center gap-3">
							<form action={syncAllGsc}>
								<button
									type="submit"
									className="inline-flex items-center gap-1.5 rounded-md bg-ninja-raised border border-ninja-line px-3 py-1.5 text-xs text-ink hover:border-gold transition-colors"
								>
									<RefreshCw className="w-3 h-3" />
									סנכרון כל הלקוחות
								</button>
							</form>
							<form action={disconnectGsc}>
								<button
									type="submit"
									className="inline-flex items-center gap-1.5 rounded-md text-xs text-ink-mute hover:text-blade transition-colors"
								>
									<Trash2 className="w-3 h-3" />
									ניתוק
								</button>
							</form>
						</div>
					)}
				</div>

				{!configured && (
					<p className="text-xs text-ink-dim leading-relaxed">
						חסר אחד מהבאים ב-.env: <code className="text-gold">GOOGLE_CLIENT_ID</code>,{" "}
						<code className="text-gold">GOOGLE_CLIENT_SECRET</code>,{" "}
						<code className="text-gold">GOOGLE_OAUTH_REDIRECT</code>.
					</p>
				)}

				{account && (
					<div className="flex items-center gap-2 text-xs text-ink-dim">
						<CheckCircle2 className="w-3.5 h-3.5 text-go" />
						מחובר כ-<span className="text-ink font-mono">{account.googleEmail}</span>
					</div>
				)}
			</section>

			{account && (
				<section className="space-y-4">
					<div className="flex items-baseline justify-between">
						<h2 className="font-display text-xl text-ink">Properties → לקוחות</h2>
						<span className="text-xs text-ink-mute">
							{properties.length} properties · {clients.filter((c) => c.gscPropertyUrl).length} משויכים
						</span>
					</div>

					{propsError && (
						<div className="rounded-lg border border-blade/30 bg-blade/10 px-5 py-4 text-sm text-ink">
							שגיאה בטעינת properties: {propsError}
						</div>
					)}

					{properties.length === 0 && !propsError ? (
						<div className="rounded-xl border-2 border-dashed border-ninja-line bg-ninja-panel/40 px-6 py-12 text-center text-sm text-ink-dim">
							לא נמצאו properties בחשבון Google המחובר.
						</div>
					) : (
						<div className="rounded-xl border border-ninja-line overflow-hidden">
							<table className="w-full text-sm">
								<thead className="bg-ninja-raised text-xs uppercase tracking-wider text-ink-dim text-right">
									<tr>
										<th className="px-4 py-3 font-bold">Property</th>
										<th className="px-4 py-3 font-bold">הרשאה</th>
										<th className="px-4 py-3 font-bold">לקוח משויך</th>
										<th className="px-4 py-3 font-bold"></th>
									</tr>
								</thead>
								<tbody className="divide-y divide-ninja-line">
									{properties.map((p) => {
										const domain = normalize(p.siteUrl);
										const suggested = clientByDomain.get(domain);
										const assigned = clients.find((c) => c.gscPropertyUrl === p.siteUrl);
										return (
											<tr key={p.siteUrl} className="bg-ninja-panel/40">
												<td className="px-4 py-3 font-mono text-xs text-ink truncate max-w-md" dir="ltr">
													{p.siteUrl}
												</td>
												<td className="px-4 py-3 text-xs text-ink-dim">
													{p.permissionLevel.replace("site", "")}
												</td>
												<td className="px-4 py-3">
													{assigned ? (
														<Link
															href={`/clients/${assigned.id}/search`}
															className="text-sm text-gold hover:text-blade"
														>
															{assigned.name}
														</Link>
													) : (
														<form action={assignProperty} className="flex items-center gap-2">
															<input type="hidden" name="propertyUrl" value={p.siteUrl} />
															<select
																name="clientId"
																defaultValue={suggested?.id ?? ""}
																className="bg-ninja-raised border border-ninja-line text-ink text-sm rounded-md px-2 py-1.5 focus:outline-none focus:border-blade/60"
															>
																<option value="">— בחר לקוח —</option>
																{clients.map((c) => (
																	<option key={c.id} value={c.id}>
																		{c.name}
																		{suggested?.id === c.id ? " (מומלץ)" : ""}
																	</option>
																))}
															</select>
															<button
																type="submit"
																className="rounded-md px-3 py-1.5 text-xs font-bold text-white"
																style={{ background: "linear-gradient(135deg, #ff2a3c, #b3001b)" }}
															>
																שייך
															</button>
														</form>
													)}
												</td>
												<td className="px-4 py-3 text-left">
													{assigned && (
														<form
															action={async () => {
																"use server";
																await unassignProperty(assigned.id);
															}}
														>
															<button
																type="submit"
																className="text-xs text-ink-mute hover:text-blade"
																title="הסר שיוך"
															>
																<Trash2 className="w-3.5 h-3.5" />
															</button>
														</form>
													)}
												</td>
											</tr>
										);
									})}
								</tbody>
							</table>
						</div>
					)}

					{/* Sync status per assigned client */}
					{clients.some((c) => c.gscPropertyUrl) && (
						<div className="pt-4">
							<h3 className="text-xs font-bold tracking-[0.2em] uppercase text-ink-dim mb-3">
								סטטוס סנכרון
							</h3>
							<div className="space-y-2">
								{clients
									.filter((c) => c.gscPropertyUrl)
									.map((c) => (
										<div
											key={c.id}
											className="flex items-center justify-between rounded-lg border border-ninja-line bg-ninja-panel/40 px-4 py-2.5"
										>
											<div className="text-sm">
												<span className="text-ink font-semibold">{c.name}</span>
												<span className="text-ink-mute mx-2">·</span>
												<span className="text-xs text-ink-dim font-mono">
													{hostOf(c.baseUrl)}
												</span>
											</div>
											<span className="text-xs text-ink-dim">
												סנכרון אחרון {timeAgo(c.gscLastSyncAt)}
											</span>
										</div>
									))}
							</div>
						</div>
					)}
				</section>
			)}

			{/* OAuth redirect helper for Google */}
			<section className="rounded-xl border border-ninja-line bg-ninja-panel/40 px-5 py-4 text-xs text-ink-dim leading-relaxed">
				<p>
					<a
						href="https://search.google.com/search-console"
						target="_blank"
						rel="noopener noreferrer"
						className="inline-flex items-center gap-1 text-gold hover:text-blade"
					>
						פתח את Search Console
						<ExternalLink className="w-3 h-3" />
					</a>{" "}
					כדי לראות אילו properties יש בחשבון שלך לפני שמחברים.
				</p>
			</section>
		</div>
	);
}
