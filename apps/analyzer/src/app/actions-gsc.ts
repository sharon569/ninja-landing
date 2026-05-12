"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import {
	listSites,
	searchAnalyticsQuery,
	defaultDateRange,
} from "@/lib/gsc";

/** Update which GSC property is bound to this client. */
export async function pickProperty(clientId: string, formData: FormData): Promise<void> {
	const propertyUrl = String(formData.get("propertyUrl") ?? "").trim();
	if (!propertyUrl) return;
	await db.gscConnection.update({
		where: { clientId },
		data: { propertyUrl },
	});
	revalidatePath(`/clients/${clientId}/search`);
}

/** Disconnect Google account for this client. */
export async function disconnectGsc(clientId: string): Promise<void> {
	await db.gscConnection.deleteMany({ where: { clientId } });
	await db.gscDailyRow.deleteMany({ where: { clientId } });
	revalidatePath(`/clients/${clientId}/search`);
}

/** Pull the last 28 days of top queries from GSC and upsert into GscDailyRow. */
export async function syncGsc(clientId: string): Promise<void> {
	const conn = await db.gscConnection.findUnique({ where: { clientId } });
	if (!conn) throw new Error("Not connected to Google Search Console");
	if (!conn.propertyUrl) throw new Error("No Search Console property selected");

	const { startDate, endDate } = defaultDateRange();

	// Per-day breakdown so we can chart trends. Dimensions: date + query.
	const rows = await searchAnalyticsQuery({
		refreshToken: conn.refreshToken,
		propertyUrl: conn.propertyUrl,
		startDate,
		endDate,
		dimensions: ["date", "query"],
		rowLimit: 25_000,
	});

	// Wipe the same date range before re-inserting — GSC data can change
	// retroactively as Google finalizes counts.
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
				page: null,
				clicks: r.clicks,
				impressions: r.impressions,
				ctr: r.ctr,
				position: r.position,
			})),
		});
	}

	await db.gscConnection.update({
		where: { clientId },
		data: { lastSyncAt: new Date() },
	});

	revalidatePath(`/clients/${clientId}/search`);
	revalidatePath(`/clients/${clientId}/report`);
}

/** Fetch the list of properties the connected Google account has access to. */
export async function loadProperties(clientId: string) {
	const conn = await db.gscConnection.findUnique({ where: { clientId } });
	if (!conn) return [];
	return listSites(conn.refreshToken);
}
