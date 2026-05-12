import Link from "next/link";
import { ArrowLeft, Plus, Globe, AlertTriangle, CheckCircle2 } from "lucide-react";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

function timeAgo(date: Date | null): string {
	if (!date) return "אף פעם";
	const ms = Date.now() - date.getTime();
	const min = Math.floor(ms / 60_000);
	if (min < 1) return "ממש עכשיו";
	if (min < 60) return `לפני ${min} דק׳`;
	const hr = Math.floor(min / 60);
	if (hr < 24) return `לפני ${hr} שע׳`;
	const d = Math.floor(hr / 24);
	return `לפני ${d} ימים`;
}

interface InfoCached {
	plugin_version?: string;
	multisite?: boolean;
	sites_count?: number;
	yoast_active?: boolean;
}

interface ScanSummary {
	findings_count?: number;
	findings_total_affected?: number;
}

export default async function Home() {
	const clients = await db.client.findMany({
		orderBy: { createdAt: "asc" },
		include: {
			scans: {
				orderBy: { ranAt: "desc" },
				take: 1,
				select: { ranAt: true, summary: true },
			},
		},
	});

	if (clients.length === 0) {
		return (
			<div className="max-w-lg mx-auto pt-24 text-center">
				<div className="mx-auto w-16 h-16 rounded-2xl bg-ninja-panel border border-ninja-line flex items-center justify-center mb-6">
					<Plus className="w-7 h-7 text-gold" />
				</div>
				<h1 className="font-display text-3xl text-ink mb-3">
					אין עדיין <span className="text-brand-gradient">לקוחות</span>
				</h1>
				<p className="text-sm text-ink-dim leading-relaxed mb-8 max-w-sm mx-auto">
					התקן את הפלאגאין{" "}
					<code className="text-[12px] bg-ninja-raised border border-ninja-line text-gold px-1.5 py-0.5 rounded">
						agency-seo-scanner
					</code>{" "}
					על אתר וורדפרס, ואז חבר אותו כאן.
				</p>
				<Link
					href="/clients/new"
					className="inline-flex items-center gap-2 rounded-lg px-5 py-3 text-sm font-bold text-white shadow-[0_6px_18px_rgba(255,42,60,0.35)] hover:shadow-[0_8px_22px_rgba(255,42,60,0.45)] transition-shadow"
					style={{ background: "linear-gradient(135deg, #ff2a3c, #b3001b)" }}
				>
					הוספת הלקוח הראשון
					<ArrowLeft className="w-4 h-4" />
				</Link>
			</div>
		);
	}

	const totalIssues = clients.reduce((acc, c) => {
		const s = c.scans[0]?.summary ? (JSON.parse(c.scans[0].summary) as ScanSummary) : null;
		return acc + (s?.findings_count ?? 0);
	}, 0);

	return (
		<div className="space-y-10">
			<div className="flex flex-wrap items-end justify-between gap-4">
				<div>
					<span className="inline-block text-[10px] font-bold tracking-[0.25em] uppercase text-blade border border-blade/30 bg-blade/10 px-2.5 py-1 rounded-full mb-3">
						LIVE
					</span>
					<h1 className="font-display text-4xl text-ink">
						<span className="text-brand-gradient">לקוחות</span> פעילים
					</h1>
					<p className="text-sm text-ink-dim mt-2">
						{clients.length} מחוברים · {totalIssues} ממצאים פתוחים
					</p>
				</div>
			</div>

			<div className="grid gap-3">
				{clients.map((c) => {
					const info: InfoCached = c.lastInfo ? JSON.parse(c.lastInfo) : {};
					const lastScan = c.scans[0];
					const summary: ScanSummary | null = lastScan?.summary
						? JSON.parse(lastScan.summary)
						: null;
					const host = (() => {
						try {
							return new URL(c.baseUrl).host;
						} catch {
							return c.baseUrl;
						}
					})();
					const issues = summary?.findings_count ?? 0;

					return (
						<Link
							key={c.id}
							href={`/clients/${c.id}`}
							className="group relative flex items-center gap-6 rounded-xl border border-ninja-line bg-ninja-panel/60 px-6 py-5 hover:border-ninja-line-strong hover:bg-ninja-panel transition-all"
						>
							<div
								className={`absolute inset-y-0 right-0 w-1 rounded-r-xl ${
									issues > 5 ? "bg-blade" : issues > 0 ? "bg-gold" : "bg-go/60"
								}`}
							/>

							<div className="flex-1 min-w-0">
								<div className="flex items-baseline gap-3 mb-1.5">
									<h2 className="font-display text-lg text-ink">{c.name}</h2>
									<span
										className="text-xs text-ink-mute font-mono truncate"
										dir="ltr"
									>
										{host}
									</span>
								</div>
								<div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-dim">
									<span className="inline-flex items-center gap-1.5">
										<Globe className="w-3 h-3" />
										{info.multisite
											? `${info.sites_count ?? "?"} אתרים`
											: "אתר יחיד"}
									</span>
									{info.yoast_active && (
										<span className="text-gold-deep">Yoast</span>
									)}
									<span>סריקה אחרונה {timeAgo(c.lastScanAt)}</span>
								</div>
							</div>

							<div className="text-left shrink-0 min-w-[80px]">
								{issues > 0 ? (
									<>
										<div className="font-display text-3xl text-ink tabular-nums leading-none">
											{issues}
										</div>
										<div className="flex items-center gap-1.5 mt-1.5">
											<AlertTriangle
												className={`w-3 h-3 ${
													issues > 5 ? "text-blade" : "text-gold"
												}`}
											/>
											<span className="text-[10px] text-ink-mute uppercase tracking-wider">
												ממצאים
											</span>
										</div>
									</>
								) : lastScan ? (
									<div className="inline-flex items-center gap-1.5 text-xs font-bold text-go">
										<CheckCircle2 className="w-3.5 h-3.5" />
										הכל תקין
									</div>
								) : (
									<div className="text-xs text-ink-mute">אין סריקה</div>
								)}
							</div>

							<ArrowLeft className="w-4 h-4 text-ink-mute group-hover:text-gold transition-colors" />
						</Link>
					);
				})}
			</div>
		</div>
	);
}
