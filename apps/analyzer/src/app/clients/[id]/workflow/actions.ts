"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { loadActionLog } from "@/lib/workflow-server";
import {
	setOpportunityStatus,
	runImpactReview,
} from "../opportunities/actions";
import { setBriefStatus } from "../briefs/actions";
import { setSuggestionStatus } from "../internal-links/actions";

export interface BulkState {
	ok?: boolean;
	error?: string;
	processed?: number;
	skipped?: number;
}

interface BulkInput {
	itemIds: string[]; // composite "sourceType:sourceId"
}

/** Decode the composite id back to its parts. */
function splitId(composite: string): { sourceType: string; sourceId: string } | null {
	const i = composite.indexOf(":");
	if (i <= 0) return null;
	return {
		sourceType: composite.slice(0, i),
		sourceId: composite.slice(i + 1),
	};
}

function revalAll(clientId: string) {
	revalidatePath(`/clients/${clientId}/workflow`);
	revalidatePath(`/clients/${clientId}/opportunities`);
	revalidatePath(`/clients/${clientId}/approvals`);
	revalidatePath(`/clients/${clientId}/briefs`);
	revalidatePath(`/clients/${clientId}/internal-links`);
	revalidatePath(`/clients/${clientId}`);
}

// ─── Per-item dispatcher ────────────────────────────────────────

export async function workflowItemAction(
	clientId: string,
	compositeId: string,
	action: string,
): Promise<{ ok: boolean; error?: string }> {
	const parts = splitId(compositeId);
	if (!parts) return { ok: false, error: "Invalid id" };
	const { sourceType, sourceId } = parts;

	try {
		if (sourceType === "opportunity") {
			switch (action) {
				case "approve":
					// approveOpportunity needs FormData with optional note. Bulk default: no note.
					await db.opportunity.update({
						where: { id: sourceId },
						data: { status: "approved", approvedAt: new Date(), approvedBy: "bulk" },
					});
					await db.opportunityActionLog.create({
						data: {
							clientId,
							opportunityId: sourceId,
							actionType: "approved",
							fromStatus: null,
							toStatus: "approved",
							note: "Bulk approve from Workflow Center",
							createdBy: "bulk",
						},
					});
					break;
				case "reject":
					await db.opportunity.update({
						where: { id: sourceId },
						data: { status: "rejected", rejectedAt: new Date(), rejectedBy: "bulk" },
					});
					await db.opportunityActionLog.create({
						data: {
							clientId,
							opportunityId: sourceId,
							actionType: "rejected",
							toStatus: "rejected",
							createdBy: "bulk",
						},
					});
					break;
				case "dismiss":
					await setOpportunityStatus(sourceId, "dismissed");
					break;
				case "needs_human_review":
					await setOpportunityStatus(sourceId, "needs_human_review");
					break;
				case "review_7d":
					await runImpactReview(sourceId, "7d");
					break;
				case "review_14d":
					await runImpactReview(sourceId, "14d");
					break;
				case "review_30d":
					await runImpactReview(sourceId, "30d");
					break;
				default:
					return { ok: false, error: `Action ${action} not supported for opportunity` };
			}
		} else if (sourceType === "content_brief") {
			const map: Record<string, string> = {
				approve: "approved",
				reject: "rejected",
				needs_human_review: "needs_human_review",
				mark_used: "used",
			};
			const next = map[action];
			if (!next) return { ok: false, error: `Action ${action} not supported for brief` };
			await setBriefStatus(sourceId, next);
		} else if (sourceType === "internal_link") {
			const map: Record<string, string> = {
				approve: "approved",
				reject: "rejected",
				dismiss: "dismissed",
				needs_human_review: "needs_human_review",
				mark_used: "used",
			};
			const next = map[action];
			if (!next) return { ok: false, error: `Action ${action} not supported for link` };
			await setSuggestionStatus(sourceId, next);
		} else {
			return { ok: false, error: `Unknown sourceType ${sourceType}` };
		}
	} catch (err) {
		return { ok: false, error: (err as Error).message };
	}

	revalAll(clientId);
	return { ok: true };
}

// ─── Bulk operations ────────────────────────────────────────────

const SAFE_BULK_ACTIONS = new Set([
	"approve",
	"needs_human_review",
	"dismiss",
]);

export async function bulkWorkflowAction(
	clientId: string,
	action: string,
	itemIds: string[],
): Promise<BulkState> {
	if (!SAFE_BULK_ACTIONS.has(action)) {
		return { error: `Bulk action ${action} is not permitted.` };
	}

	let processed = 0;
	let skipped = 0;
	const errors: string[] = [];

	for (const compositeId of itemIds) {
		const r = await workflowItemAction(clientId, compositeId, action);
		if (r.ok) processed++;
		else {
			skipped++;
			if (r.error) errors.push(r.error);
		}
	}

	revalAll(clientId);

	if (processed === 0 && skipped > 0) {
		return { error: errors[0] || "All items skipped." };
	}
	return { ok: true, processed, skipped };
}

// ─── Action Log fetch ──────────────────────────────────────────

export async function getActionLog(opportunityId: string) {
	const rows = await loadActionLog(opportunityId);
	return rows.map((r) => ({
		id: r.id,
		actionType: r.actionType,
		fromStatus: r.fromStatus,
		toStatus: r.toStatus,
		note: r.note,
		createdBy: r.createdBy,
		createdAt: r.createdAt.toISOString(),
	}));
}
