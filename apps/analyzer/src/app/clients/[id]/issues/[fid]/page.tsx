import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, Lightbulb, EyeOff } from "lucide-react";
import { db } from "@/lib/db";
import type { Finding } from "@/lib/audit/types";
import { classifyPage, type ClientScopeConfig, type PageClassification } from "@/lib/page-scope";
import { ScopeBadge } from "@/components/ScopeBadge";

export const dynamic = "force-dynamic";

const SEVERITY_DOT: Record<string, string> = {
	high: "bg-blade",
	medium: "bg-gold",
	low: "bg-sky-400",
	info: "bg-zinc-400",
};

const SEVERITY_LABEL: Record<string, string> = {
	high: "קריטי",
	medium: "חשוב",
	low: "מינורי",
	info: "מידע",
};

export default async function FindingDetailPage({
	params,
}: {
	params: Promise<{ id: string; fid: string }>;
}) {
	const { id, fid } = await params;
	const row = await db.finding.findUnique({
		where: { id: fid },
		include: { scan: { include: { client: true } } },
	});
	if (!row || row.scan.clientId !== id) notFound();

	const finding = JSON.parse(row.payload) as Finding;

	// Phase 15C.3 — classify every affected URL once so we can badge each row
	// and summarize "X / Y excluded from SEO scope".
	const client = row.scan.client;
	const scopeCfg: ClientScopeConfig = {
		targetPages: client.targetPages,
		seoIgnoredUrls: client.seoIgnoredUrls,
		seoIgnoredPatterns: client.seoIgnoredPatterns,
		seoForcedTargetUrls: client.seoForcedTargetUrls,
	};
	const classifications = new Map<string, PageClassification>();
	for (const u of finding.affectedUrls) {
		if (u.url && !classifications.has(u.url)) {
			classifications.set(u.url, classifyPage(u.url, scopeCfg));
		}
	}
	const ignoredCount = Array.from(classifications.values()).filter(
		(c) => !c.isSeoEligible,
	).length;

	return (
		<div className="space-y-6">
			<Link
				href={`/clients/${id}/issues`}
				className="inline-flex items-center gap-1.5 text-xs text-ink-dim hover:text-ink"
			>
				<ArrowLeft className="w-3.5 h-3.5 rotate-180" />
				כל הממצאים
			</Link>

			<header className="space-y-3">
				<div className="flex items-center gap-2">
					<span className={`w-2 h-2 rounded-full ${SEVERITY_DOT[row.severity]}`} />
					<span className="text-xs font-medium uppercase tracking-wider text-ink-dim">
						{SEVERITY_LABEL[row.severity] ?? row.severity}
					</span>
				</div>
				<h1 className="text-2xl font-semibold tracking-tight text-ink">
					{finding.title}
				</h1>
				<p className="text-sm text-ink-dim max-w-2xl leading-relaxed">
					{finding.description}
				</p>
			</header>

			{finding.fixHint && (
				<aside className="rounded-lg bg-go/10 border border-go/30 px-5 py-4 flex items-start gap-3">
					<Lightbulb className="w-4 h-4 mt-0.5 shrink-0 text-go" />
					<div className="text-sm text-go">
						<div className="font-medium mb-1">הפתרון</div>
						<p className="leading-relaxed">{finding.fixHint}</p>
					</div>
				</aside>
			)}

			{ignoredCount > 0 && (
				<aside className="rounded-lg border border-gold/30 bg-gold/5 px-5 py-3 flex items-start gap-3">
					<EyeOff className="w-4 h-4 mt-0.5 shrink-0 text-gold" />
					<div className="text-xs text-ink leading-relaxed">
						<div className="font-bold text-gold mb-0.5">
							{ignoredCount} מתוך {classifications.size} עמודים מסומנים לא נכללים באסטרטגיית SEO
						</div>
						<p>
							עמודים כמו checkout, cart, my-account, privacy, terms וכו׳ נסרקים לצורך מידע כללי, אך לא נכללים
							באסטרטגיית SEO — לא ייווצרו מהם Opportunities, Briefs או Execution Suggestions. ניתן לעקוף ב-Settings → SEO Crawl Scope.
						</p>
					</div>
				</aside>
			)}

			<section>
				<div className="flex items-baseline justify-between mb-3">
					<h2 className="text-sm font-medium text-ink">
						דפים מושפעים
					</h2>
					<span className="text-sm font-semibold text-ink tabular-nums">
						{row.count.toLocaleString()}
					</span>
				</div>

				<div className="overflow-hidden rounded-lg border border-ninja-line bg-ninja-panel/60">
					<div className="max-h-[600px] overflow-y-auto">
						<table className="w-full text-sm">
							<thead className="bg-ninja-raised text-left text-xs uppercase tracking-wider text-ink-dim sticky top-0">
								<tr>
									<th className="px-4 py-2.5 font-medium">כותרת</th>
									<th className="px-4 py-2.5 font-medium">סוג</th>
									<th className="px-4 py-2.5 font-medium"></th>
								</tr>
							</thead>
							<tbody className="divide-y divide-ninja-line">
								{finding.affectedUrls.slice(0, 500).map((u, idx) => {
									const cls = u.url ? classifications.get(u.url) : null;
									return (
										<tr key={`${u.blog_id}-${u.post_id}-${idx}`}>
											<td className="px-4 py-2.5">
												<div className="flex items-center gap-2 flex-wrap">
													<div className="font-medium text-ink truncate max-w-md">
														{u.title || u.detail || "(ללא כותרת)"}
													</div>
													{cls && <ScopeBadge classification={cls} variant="compact" />}
												</div>
												<div className="text-xs text-ink-dim font-mono truncate max-w-md" dir="ltr">
													{u.url}
												</div>
											</td>
											<td className="px-4 py-2.5 text-ink-dim text-xs">
												{u.post_type}
											</td>
											<td className="px-4 py-2.5 text-left">
												<a
													href={u.url}
													target="_blank"
													rel="noopener noreferrer"
													className="inline-flex items-center gap-1 text-xs text-ink-dim hover:text-ink"
												>
													פתח
													<ExternalLink className="w-3 h-3" />
												</a>
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>
					</div>
					{finding.affectedUrls.length > 500 && (
						<div className="border-t border-zinc-100 px-4 py-2.5 text-xs text-ink-dim bg-ninja-raised">
							מוצגים 500 הראשונים מתוך {finding.affectedUrls.length.toLocaleString()} דפים מושפעים.
						</div>
					)}
				</div>
			</section>
		</div>
	);
}
