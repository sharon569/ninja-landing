"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import {
	listSites,
	searchAnalyticsQuery,
	defaultDateRange,
} from "@/lib/gsc";

async function getAccount() {
	return db.gscAccount.findFirst();
}

/** Assign a GSC property to a client. */
export async function assignProperty(formData: FormData): Promise<void> {
	const clientId = String(formData.get("clientId") ?? "").trim();
	const propertyUrl = String(formData.get("propertyUrl") ?? "").trim();
	if (!clientId) return;
	await db.client.update({
		where: { id: clientId },
		data: { gscPropertyUrl: propertyUrl || null },
	});
	revalidatePath("/integrations");
	revalidatePath(`/clients/${clientId}/search`);
}

/** Remove a client's GSC property assignment + its synced rows. */
export async function unassignProperty(clientId: string): Promise<void> {
	await db.client.update({
		where: { id: clientId },
		data: { gscPropertyUrl: null, gscLastSyncAt: null },
	});
	await db.gscDailyRow.deleteMany({ where: { clientId } });
	revalidatePath("/integrations");
	revalidatePath(`/clients/${clientId}/search`);
}

/** Disconnect the agency Google account entirely + wipe all GSC data. */
export async function disconnectGsc(): Promise<void> {
	await db.gscDailyRow.deleteMany({});
	await db.client.updateMany({
		data: { gscPropertyUrl: null, gscLastSyncAt: null },
	});
	await db.gscAccount.deleteMany({});
	revalidatePath("/integrations");
}

/** Pull the last 28 days of top queries for a single client. */
export async function syncGsc(clientId: string): Promise<void> {
	const account = await getAccount();
	if (!account) throw new Error("Google account not connected. Go to /integrations.");

	const client = await db.client.findUnique({ where: { id: clientId } });
	if (!client) throw new Error(`Client ${clientId} not found`);
	if (!client.gscPropertyUrl) throw new Error("No GSC property assigned to this client.");

	const { startDate, endDate } = defaultDateRange();

	// Phase 3: pull page dimension too so we can detect cannibalization,
	// per-page declines, and which page is ranking for a given keyword.
	const rows = await searchAnalyticsQuery({
		refreshToken: account.refreshToken,
		propertyUrl: client.gscPropertyUrl,
		startDate,
		endDate,
		dimensions: ["date", "query", "page"],
		rowLimit: 25_000,
	});

	await db.gscDailyRow.deleteMany({
		where: {
			clientId,
			date: { gte: startDate, lte: endDate },
		},
	});

	if (rows.length > 0) {
		await db.gscDailyRow.createMany({
			data: rows.map((r) => ({
				clientId,
				date: r.keys[0],
				query: r.keys[1],
				page: r.keys[2] ?? null,
				clicks: r.clicks,
				impressions: r.impressions,
				ctr: r.ctr,
				position: r.position,
			})),
		});
	}

	await db.client.update({
		where: { id: clientId },
		data: { gscLastSyncAt: new Date() },
	});

	revalidatePath(`/clients/${clientId}/search`);
	revalidatePath(`/clients/${clientId}/report`);
	revalidatePath("/integrations");
}

/** Sync all clients that have a GSC property assigned. */
export async function syncAllGsc(): Promise<void> {
	const clients = await db.client.findMany({
		where: { gscPropertyUrl: { not: null } },
		select: { id: true },
	});
	for (const c of clients) {
		try {
			await syncGsc(c.id);
		} catch (err) {
			console.error(`Sync failed for ${c.id}:`, err);
		}
	}
	revalidatePath("/integrations");
}

/** List GSC properties the connected account has access to. */
export async function loadProperties() {
	const account = await getAccount();
	if (!account) return [];
	return listSites(account.refreshToken);
}
