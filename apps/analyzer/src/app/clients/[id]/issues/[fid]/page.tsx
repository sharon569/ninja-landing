import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, Lightbulb } from "lucide-react";
import { db } from "@/lib/db";
import type { Finding } from "@/lib/audit/types";

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
								{finding.affectedUrls.slice(0, 500).map((u, idx) => (
									<tr key={`${u.blog_id}-${u.post_id}-${idx}`}>
										<td className="px-4 py-2.5">
											<div className="font-medium text-ink truncate max-w-md">
												{u.title || u.detail || "(ללא כותרת)"}
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
								))}
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
