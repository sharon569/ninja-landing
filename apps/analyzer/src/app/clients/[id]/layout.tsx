import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, ExternalLink } from "lucide-react";
import { db } from "@/lib/db";
import { SubNav } from "@/components/SubNav";

export const dynamic = "force-dynamic";

export default async function ClientLayout({
	children,
	params,
}: {
	children: React.ReactNode;
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;
	const client = await db.client.findUnique({
		where: { id },
		include: {
			scans: {
				orderBy: { ranAt: "desc" },
				take: 1,
				include: { findings: { select: { id: true } } },
			},
			targetKeywords: { select: { id: true } },
			opportunities: {
				where: { status: { in: ["detected", "recommended", "needs_human_review", "approved"] } },
				select: { id: true },
			},
		},
	});
	if (!client) notFound();

	const host = (() => {
		try {
			return new URL(client.baseUrl).host;
		} catch {
			return client.baseUrl;
		}
	})();
	const homeUrl = client.baseUrl.replace(/\/wp-json.*/, "");
	const findingsCount = client.scans[0]?.findings.length ?? 0;
	const keywordsCount = client.targetKeywords.length;
	const opportunitiesCount = client.opportunities.length;

	return (
		<div className="space-y-7">
			<div>
				<Link
					href="/"
					className="inline-flex items-center gap-1.5 text-xs text-ink-mute hover:text-gold transition-colors"
				>
					<ArrowRight className="w-3.5 h-3.5" />
					כל הלקוחות
				</Link>
				<div className="mt-3 flex flex-wrap items-baseline gap-4">
					<h1 className="font-display text-4xl text-ink">{client.name}</h1>
					<a
						href={homeUrl}
						target="_blank"
						rel="noopener noreferrer"
						className="inline-flex items-center gap-1.5 text-sm text-ink-dim hover:text-gold font-mono transition-colors"
						dir="ltr"
					>
						{host}
						<ExternalLink className="w-3 h-3" />
					</a>
				</div>
			</div>

			<SubNav
				items={[
					{ label: "סקירה", href: `/clients/${id}` },
					{ label: "הזדמנויות", href: `/clients/${id}/opportunities`, count: opportunitiesCount },
					{ label: "אודיט", href: `/clients/${id}/issues`, count: findingsCount },
					{ label: "מילות מפתח", href: `/clients/${id}/keywords`, count: keywordsCount },
					{ label: "Search Console", href: `/clients/${id}/search` },
					{ label: "דוח", href: `/clients/${id}/report` },
					{ label: "הגדרות", href: `/clients/${id}/settings` },
				]}
			/>

			<div className="pt-2">{children}</div>
		</div>
	);
}
