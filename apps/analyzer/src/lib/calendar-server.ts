// Phase 16.5 — Content Calendar (server-only).
//
// Schedules content briefs for publishing with a controlled cadence.
// autoSchedule() fills slots over the next 4 weeks based on the
// client's preferred publishing days and cadence.

import "server-only";

import { db } from "@/lib/db";

// ─── Day mapping ──────────────────────────────────────────────

const DAY_MAP: Record<string, number> = {
	sunday: 0,
	monday: 1,
	tuesday: 2,
	wednesday: 3,
	thursday: 4,
	friday: 5,
	saturday: 6,
};

// ─── Auto-Schedule ────────────────────────────────────────────

export interface AutoScheduleResult {
	scheduled: number;
	skipped: number;
	slots: number;
}

export async function autoSchedule(clientId: string): Promise<AutoScheduleResult> {
	const client = await db.client.findUnique({
		where: { id: clientId },
		select: { publishingCadence: true, publishingDays: true },
	});

	if (!client) throw new Error("Client not found");

	const cadence = client.publishingCadence;
	const days = client.publishingDays
		.map((d) => DAY_MAP[d.toLowerCase()])
		.filter((d) => d !== undefined);

	if (cadence <= 0 || days.length === 0) {
		return { scheduled: 0, skipped: 0, slots: 0 };
	}

	// Generate slots for next 4 weeks
	const slots: Date[] = [];
	const now = new Date();
	const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

	for (let week = 0; week < 4; week++) {
		for (const dayOfWeek of days) {
			const date = new Date(today);
			date.setDate(today.getDate() + (week * 7) + ((dayOfWeek - today.getDay() + 7) % 7));
			// Skip past dates
			if (date <= today) {
				if (week === 0) continue;
			}
			slots.push(date);
		}
	}

	// Sort chronologically
	slots.sort((a, b) => a.getTime() - b.getTime());

	// Filter out slots that already have content scheduled
	const existingSchedules = await db.contentSchedule.findMany({
		where: {
			clientId,
			status: { in: ["scheduled", "published"] },
		},
		select: { scheduledDate: true },
	});

	const filledDates = new Set(
		existingSchedules.map((s) => s.scheduledDate.toISOString().split("T")[0]),
	);

	const openSlots = slots.filter(
		(s) => !filledDates.has(s.toISOString().split("T")[0]),
	);

	// Get eligible briefs (approved, no schedule yet)
	const allBriefs = await db.contentBrief.findMany({
		where: {
			clientId,
			status: { in: ["approved", "used"] },
		},
		orderBy: { createdAt: "asc" },
		select: { id: true },
	});

	// Filter out briefs that already have a schedule
	const scheduledBriefIds = new Set(
		(await db.contentSchedule.findMany({
			where: { clientId },
			select: { briefId: true },
		})).map((s) => s.briefId),
	);
	const briefs = allBriefs.filter((b) => !scheduledBriefIds.has(b.id));

	// Assign briefs to slots
	let scheduled = 0;
	const toSchedule = Math.min(briefs.length, openSlots.length);

	for (let i = 0; i < toSchedule; i++) {
		await db.contentSchedule.create({
			data: {
				clientId,
				briefId: briefs[i].id,
				scheduledDate: openSlots[i],
			},
		});
		scheduled++;
	}

	return {
		scheduled,
		skipped: briefs.length - scheduled,
		slots: openSlots.length,
	};
}

// ─── Queries ──────────────────────────────────────────────────

export async function getCalendar(clientId: string, month?: number, year?: number) {
	const now = new Date();
	const m = month ?? now.getMonth();
	const y = year ?? now.getFullYear();

	const start = new Date(y, m, 1);
	const end = new Date(y, m + 1, 0, 23, 59, 59);

	return db.contentSchedule.findMany({
		where: {
			clientId,
			scheduledDate: { gte: start, lte: end },
		},
		include: {
			brief: {
				select: {
					id: true,
					targetKeyword: true,
					briefType: true,
					recommendedTitle: true,
					status: true,
				},
			},
		},
		orderBy: { scheduledDate: "asc" },
	});
}

export async function getUpcomingWeek(clientId: string) {
	const now = new Date();
	const weekLater = new Date(now.getTime() + 7 * 86_400_000);

	return db.contentSchedule.findMany({
		where: {
			clientId,
			scheduledDate: { gte: now, lte: weekLater },
			status: "scheduled",
		},
		include: {
			brief: {
				select: {
					id: true,
					targetKeyword: true,
					briefType: true,
					recommendedTitle: true,
				},
			},
		},
		orderBy: { scheduledDate: "asc" },
	});
}

export async function publishScheduledContent(
	scheduleId: string,
	actor: string,
): Promise<void> {
	await db.contentSchedule.update({
		where: { id: scheduleId },
		data: {
			status: "published",
			publishedAt: new Date(),
			publishedBy: actor,
		},
	});
}

export async function cancelScheduledContent(scheduleId: string): Promise<void> {
	await db.contentSchedule.update({
		where: { id: scheduleId },
		data: { status: "cancelled" },
	});
}
