// Phase 16.6 — PageSpeed types (client-safe).

export interface SpeedSummary {
	clientId: string;
	avgMobileScore: number | null;
	avgDesktopScore: number | null;
	pagesAudited: number;
	worstPages: { url: string; mobileScore: number }[];
	cwvStatus: {
		lcp: "good" | "needs-improvement" | "poor" | null;
		inp: "good" | "needs-improvement" | "poor" | null;
		cls: "good" | "needs-improvement" | "poor" | null;
	};
	lastFetchedAt: string | null;
}

// Core Web Vitals thresholds (Google 2024)
export const CWV_THRESHOLDS = {
	lcp: { good: 2.5, poor: 4.0 },     // seconds
	inp: { good: 200, poor: 500 },      // ms
	cls: { good: 0.1, poor: 0.25 },     // score
} as const;

export function cwvRating(metric: "lcp" | "inp" | "cls", value: number): "good" | "needs-improvement" | "poor" {
	const t = CWV_THRESHOLDS[metric];
	if (value <= t.good) return "good";
	if (value <= t.poor) return "needs-improvement";
	return "poor";
}

export const CWV_LABELS: Record<string, string> = {
	good: "תקין",
	"needs-improvement": "דורש שיפור",
	poor: "גרוע",
};

export const CWV_COLORS: Record<string, string> = {
	good: "text-go",
	"needs-improvement": "text-gold",
	poor: "text-blade",
};
