// Internal Linking — client-safe types, labels, helpers.

export const SUGGESTION_STATUS_OPTIONS = [
	{ value: "suggested", label: "מוצעת", tone: "neutral" },
	{ value: "needs_human_review", label: "דורש סקירה", tone: "warn" },
	{ value: "approved", label: "מאושרת", tone: "good" },
	{ value: "used", label: "נוצלה", tone: "good" },
	{ value: "rejected", label: "נדחתה", tone: "mute" },
	{ value: "dismissed", label: "הוסרה", tone: "mute" },
] as const;

export const SUGGESTION_SOURCE_LABELS: Record<string, string> = {
	detectOrphanPageSupport: "תמיכה בעמוד יתום",
	detectTargetPageBoost: "חיזוק עמוד יעד",
	detectKeywordPageSupport: "תמיכה במילת מפתח",
	detectOpportunitySupport: "תמיכה בהזדמנות",
	detectAuthorityRelay: "העברת כוח מעמוד מוביל",
};

export function suggestionStatusLabel(v: string | null | undefined): string {
	if (!v) return "—";
	return SUGGESTION_STATUS_OPTIONS.find((s) => s.value === v)?.label ?? v;
}

export function suggestionStatusTone(v: string | null | undefined): string {
	if (!v) return "neutral";
	return SUGGESTION_STATUS_OPTIONS.find((s) => s.value === v)?.tone ?? "neutral";
}

export function suggestionSourceLabel(v: string | null | undefined): string {
	if (!v) return "—";
	return SUGGESTION_SOURCE_LABELS[v] ?? v;
}

/** Priority bands — reuses the same colour ladder as Opportunities. */
export function linkPriorityBand(score: number): {
	label: string;
	color: string;
	bucket: "high" | "quick" | "medium" | "low";
} {
	if (score >= 80) return { label: "High Impact", color: "#ff2a3c", bucket: "high" };
	if (score >= 60) return { label: "Quick Win", color: "#ffd166", bucket: "quick" };
	if (score >= 40) return { label: "Medium Priority", color: "#a8acb6", bucket: "medium" };
	return { label: "Low Priority", color: "#6a6f7c", bucket: "low" };
}

export function urlPath(url: string): string {
	try {
		return new URL(url).pathname;
	} catch {
		return url;
	}
}
