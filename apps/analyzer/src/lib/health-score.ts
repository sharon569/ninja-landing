// SEO Health Score — 0..100 heuristic.
// Pure computation: caller provides the inputs already counted.

export interface HealthInputs {
	profileCompletionPct: number;     // 0..100 from calcProfileCompletion()
	openOpportunities: number;         // active count (excludes monitoring/finalised)
	highImpactOpen: number;            // priorityScore ≥ 80, still open
	highSeverityFindings: number;      // 'high' severity findings, last scan
	hasKeywordBank: boolean;
	hasGscSync: boolean;
	gscFreshDays: number | null;       // days since last GSC sync (null = never)
	monitoringCount: number;           // actions currently being measured
	improvedReviews: number;           // count of ImpactReview where result='improved'
}

export interface HealthResult {
	score: number;       // 0..100
	band: "excellent" | "good" | "warn" | "poor";
	bandLabel: string;
	bandColor: string;
	breakdown: { label: string; points: number; max: number }[];
}

/**
 * Heuristic. Higher = healthier.
 *
 *  Profile completion           — up to +15
 *  GSC sync set + recent        — up to +15
 *  Has Keyword Bank             — +5
 *  No high-severity findings    — up to +20 (loses 4 per severe finding, floor 0)
 *  Few open opportunities       — up to +15 (loses 1 per opp over 10)
 *  No high-impact open          — up to +10 (loses 2 per high-impact opp)
 *  Active monitoring            — up to +10 (+2 per monitoring action capped)
 *  Improved impact reviews      — up to +10 (+3 per improved capped)
 */
export function calcHealthScore(input: HealthInputs): HealthResult {
	const breakdown: { label: string; points: number; max: number }[] = [];

	// Profile
	const profilePts = Math.round((input.profileCompletionPct / 100) * 15);
	breakdown.push({ label: "פרופיל SEO", points: profilePts, max: 15 });

	// GSC
	let gscPts = 0;
	if (input.hasGscSync) gscPts += 7;
	if (input.gscFreshDays !== null) {
		if (input.gscFreshDays <= 3) gscPts += 8;
		else if (input.gscFreshDays <= 7) gscPts += 5;
		else if (input.gscFreshDays <= 14) gscPts += 2;
	}
	breakdown.push({ label: "סנכרון GSC", points: gscPts, max: 15 });

	// Keyword bank
	const kwPts = input.hasKeywordBank ? 5 : 0;
	breakdown.push({ label: "Keyword Bank", points: kwPts, max: 5 });

	// High-severity findings (penalty area)
	const findingsPts = Math.max(0, 20 - input.highSeverityFindings * 4);
	breakdown.push({ label: "אין ממצאים קריטיים", points: findingsPts, max: 20 });

	// Opportunity load
	const oppPts = Math.max(0, 15 - Math.max(0, input.openOpportunities - 10));
	breakdown.push({ label: "עומס הזדמנויות סביר", points: oppPts, max: 15 });

	// High-impact open
	const highPts = Math.max(0, 10 - input.highImpactOpen * 2);
	breakdown.push({ label: "אין High Impact ממתינות", points: highPts, max: 10 });

	// Active monitoring
	const monPts = Math.min(10, input.monitoringCount * 2);
	breakdown.push({ label: "פעולות במעקב", points: monPts, max: 10 });

	// Improved reviews
	const impPts = Math.min(10, input.improvedReviews * 3);
	breakdown.push({ label: "פעולות שהשתפרו", points: impPts, max: 10 });

	const score = Math.max(
		0,
		Math.min(100, profilePts + gscPts + kwPts + findingsPts + oppPts + highPts + monPts + impPts),
	);

	let band: HealthResult["band"];
	let bandLabel: string;
	let bandColor: string;
	if (score >= 80) {
		band = "excellent";
		bandLabel = "מצוין";
		bandColor = "#2ee685";
	} else if (score >= 60) {
		band = "good";
		bandLabel = "טוב";
		bandColor = "#ffd166";
	} else if (score >= 40) {
		band = "warn";
		bandLabel = "דורש תשומת לב";
		bandColor = "#ffa600";
	} else {
		band = "poor";
		bandLabel = "דורש טיפול";
		bandColor = "#ff2a3c";
	}

	return { score, band, bandLabel, bandColor, breakdown };
}
