import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { deleteClient } from "@/app/actions";

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

	const deleteWithId = deleteClient.bind(null, client.id);

	return (
		<div className="space-y-10">
			{/* Connection details */}
			<section className="space-y-3">
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
				<h2 className="text-sm font-medium uppercase tracking-wider text-red-700">
					Danger zone
				</h2>
				<div className="rounded-lg border border-blade/30 bg-blade/10/50 px-5 py-4 flex items-center justify-between gap-6">
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
							className="inline-flex items-center rounded-md border border-red-300 bg-ninja-panel/60 px-3 py-1.5 text-sm text-red-700 hover:bg-blade/10"
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
