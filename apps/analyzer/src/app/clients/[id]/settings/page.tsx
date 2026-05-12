import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { deleteClient } from "@/app/actions";
import { ProfileForm } from "./ProfileForm";
import { AutomationToggles } from "./AutomationToggles";
import { ExecutionSettings } from "./ExecutionSettings";
import { calcProfileCompletion } from "@/lib/profile";

export const dynamic = "force-dynamic";

export default async function SettingsPage({
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
				take: 10,
				select: {
					id: true,
					ranAt: true,
					sizeBytes: true,
					durationMs: true,
					summary: true,
				},
			},
		},
	});
	if (!client) notFound();

	const completion = calcProfileCompletion(client);
	const deleteWithId = deleteClient.bind(null, client.id);

	return (
		<div className="space-y-10">
			{/* SEO Profile */}
			<section className="space-y-5">
				<div className="flex flex-wrap items-end justify-between gap-3">
					<div>
						<h2 className="font-display text-2xl text-ink">
							פרופיל <span className="text-brand-gradient">SEO</span>
						</h2>
						<p className="text-xs text-ink-dim mt-1">
							ההגדרות שמכוונות את כל מנועי ה-SEO של הלקוח. ערכים מעודכנים נטענים אוטומטית לכל מנוע.
						</p>
					</div>
					<div className="flex items-center gap-3 text-xs">
						<div className="flex items-center gap-2">
							<div className="w-32 h-1.5 rounded-full bg-ninja-raised overflow-hidden">
								<div
									className="h-full transition-all"
									style={{
										width: `${completion.percent}%`,
										background:
											completion.percent >= 100
												? "#2ee685"
												: completion.percent >= 70
													? "#ffd166"
													: "#ff2a3c",
									}}
								/>
							</div>
							<span className="tabular-nums text-ink font-bold">{completion.percent}%</span>
						</div>
						<span className="text-ink-dim">
							{completion.percent === 100 ? "פרופיל מלא" : `${completion.missing.length} שדות חסרים`}
						</span>
					</div>
				</div>

				<ProfileForm
					clientId={client.id}
					initial={{
						vertical: client.vertical,
						language: client.language,
						country: client.country,
						serviceAreas: client.serviceAreas,
						seoGoals: client.seoGoals,
						targetPages: client.targetPages,
						competitors: client.competitors,
						brandVoice: client.brandVoice,
						notes: client.notes,
						automationLevel: client.automationLevel,
						requireApprovalFor: client.requireApprovalFor,
					}}
				/>
			</section>

			{/* Automation */}
			<section className="space-y-5 border-t border-ninja-line pt-10">
				<div>
					<h2 className="font-display text-2xl text-ink">
						אוטומציה <span className="text-brand-gradient">יומית</span>
					</h2>
					<p className="text-xs text-ink-dim mt-1">
						הגדרות הסנכרון האוטומטי שרץ כל יום ב-5:00. כשמשהו כבוי, הלקוח הזה לא נכלל בסנכרון האוטומטי הזה.
					</p>
				</div>
				<AutomationToggles
					clientId={client.id}
					initial={{
						status: client.status ?? "active",
						automationEnabled: client.automationEnabled,
						autoGscSyncEnabled: client.autoGscSyncEnabled,
						autoTechAuditEnabled: client.autoTechAuditEnabled,
						autoOpportunityAnalysisEnabled: client.autoOpportunityAnalysisEnabled,
						autoImpactReviewEnabled: client.autoImpactReviewEnabled,
					}}
				/>
			</section>

			{/* Execution Settings (Phase 12) */}
			<section className="space-y-5 border-t border-ninja-line pt-10">
				<div>
					<h2 className="font-display text-2xl text-ink">
						הגדרות <span className="text-brand-gradient">Execution</span>
					</h2>
					<p className="text-xs text-ink-dim mt-1">
						שליטה מי יכול לבצע שינויים חיים באתר הלקוח דרך ה-Plugin v0.3. שינוי כאן לא משפיע על Dry Runs — רק על
						ביצוע חי.
					</p>
				</div>
				<ExecutionSettings
					clientId={client.id}
					initial={{
						executionEnabled: client.executionEnabled,
						executionPilotMode: client.executionPilotMode,
						allowedExecutionActions: client.allowedExecutionActions ?? [],
					}}
				/>
			</section>

			{/* Connection details */}
			<section className="space-y-3 border-t border-ninja-line pt-10">
				<h2 className="text-sm font-medium uppercase tracking-wider text-ink-dim">
					Connection
				</h2>
				<div className="rounded-lg border border-ninja-line bg-ninja-panel/60 divide-y divide-ninja-line">
					<DetailRow label="Name" value={client.name} />
					<DetailRow label="Base URL" value={client.baseUrl} mono />
					<DetailRow
						label="Token"
						value={`${client.token.slice(0, 8)}…${client.token.slice(-4)}`}
						mono
					/>
					<DetailRow
						label="Connected"
						value={new Date(client.createdAt).toLocaleString()}
					/>
				</div>
				<p className="text-xs text-ink-dim">
					To rotate the token: open the plugin admin on the client&apos;s WP site, click Regenerate, then re-add this client with the new token.
				</p>
			</section>

			{/* Scan history */}
			<section className="space-y-3">
				<h2 className="text-sm font-medium uppercase tracking-wider text-ink-dim">
					Scan history
				</h2>
				{client.scans.length === 0 ? (
					<div className="rounded-lg border border-ninja-line bg-ninja-panel/60 px-5 py-8 text-center text-sm text-ink-dim">
						No scans yet.
					</div>
				) : (
					<div className="overflow-hidden rounded-lg border border-ninja-line bg-ninja-panel/60">
						<table className="w-full text-sm">
							<thead className="bg-ninja-raised text-left text-xs uppercase tracking-wider text-ink-dim">
								<tr>
									<th className="px-4 py-2.5 font-medium">When</th>
									<th className="px-4 py-2.5 font-medium">URLs</th>
									<th className="px-4 py-2.5 font-medium">Size</th>
									<th className="px-4 py-2.5 font-medium">Duration</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-ninja-line">
								{client.scans.map((s) => {
									const summary = JSON.parse(s.summary) as {
										urls_total?: number;
									};
									return (
										<tr key={s.id}>
											<td className="px-4 py-2.5 text-ink">
												{new Date(s.ranAt).toLocaleString()}
											</td>
											<td className="px-4 py-2.5 text-ink-dim tabular-nums">
												{summary.urls_total?.toLocaleString() ?? 0}
											</td>
											<td className="px-4 py-2.5 text-ink-dim tabular-nums">
												{(s.sizeBytes / 1024).toFixed(0)} KB
											</td>
											<td className="px-4 py-2.5 text-ink-dim tabular-nums">
												{(s.durationMs / 1000).toFixed(1)}s
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>
					</div>
				)}
			</section>

			{/* Danger zone */}
			<section className="space-y-3 border-t border-ninja-line pt-8">
				<h2 className="text-sm font-medium uppercase tracking-wider text-blade">
					Danger zone
				</h2>
				<div className="rounded-lg border border-blade/30 bg-blade/10 px-5 py-4 flex items-center justify-between gap-6">
					<div>
						<div className="text-sm font-medium text-ink">
							Disconnect this client
						</div>
						<p className="text-xs text-ink-dim mt-0.5">
							Removes the client from the analyzer. Scan history and saved JSON snapshots on disk are deleted. The plugin on the client&apos;s site is not affected.
						</p>
					</div>
					<form action={deleteWithId}>
						<button
							type="submit"
							className="inline-flex items-center rounded-md border border-blade/30 bg-ninja-panel/60 px-3 py-1.5 text-sm text-blade hover:bg-blade/10"
						>
							Disconnect
						</button>
					</form>
				</div>
			</section>
		</div>
	);
}

function DetailRow({
	label,
	value,
	mono = false,
}: {
	label: string;
	value: string;
	mono?: boolean;
}) {
	return (
		<div className="flex items-baseline gap-6 px-5 py-3">
			<dt className="text-xs uppercase tracking-wider text-ink-dim w-24 shrink-0">
				{label}
			</dt>
			<dd
				className={[
					"text-sm text-ink break-all",
					mono ? "font-mono text-xs" : "",
				].join(" ")}
			>
				{value}
			</dd>
		</div>
	);
}
