import { Calendar, Clock } from "lucide-react";
import { getCalendar, getUpcomingWeek } from "@/lib/calendar-server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const STATUS_COLORS: Record<string, string> = {
	scheduled: "bg-blue-500/20 text-blue-400 border-blue-500/30",
	published: "bg-go/20 text-go border-go/30",
	skipped: "bg-ink-mute/20 text-ink-mute border-ink-mute/30",
	cancelled: "bg-blade/20 text-blade border-blade/30",
};

const STATUS_LABELS: Record<string, string> = {
	scheduled: "מתוזמן",
	published: "פורסם",
	skipped: "דולג",
	cancelled: "בוטל",
};

const DAY_NAMES = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

export default async function CalendarPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;

	const now = new Date();
	const entries = await getCalendar(id, now.getMonth(), now.getFullYear());
	const upcoming = await getUpcomingWeek(id);

	const client = await db.client.findUnique({
		where: { id },
		select: { publishingCadence: true, publishingDays: true },
	});

	return (
		<div className="space-y-6">
			<div className="flex items-center gap-3">
				<Calendar className="w-5 h-5 text-gold" />
				<h2 className="text-xl font-bold text-ink">לוח תוכן</h2>
			</div>

			{/* Cadence Info */}
			<div className="rounded-xl border border-ninja-line bg-ninja-card p-4">
				<p className="text-sm text-ink-dim">
					קצב פרסום: <b className="text-ink">{client?.publishingCadence ?? 2} פוסטים/שבוע</b>
					{" · "}
					ימים: <b className="text-ink">{client?.publishingDays?.join(", ") || "ראשון, רביעי"}</b>
				</p>
			</div>

			{/* Upcoming Week */}
			<div className="rounded-xl border border-ninja-line bg-ninja-card p-5">
				<div className="flex items-center gap-2 mb-4">
					<Clock className="w-4 h-4 text-gold" />
					<h3 className="text-sm font-semibold text-ink">השבוע הקרוב</h3>
				</div>

				{upcoming.length === 0 ? (
					<p className="text-sm text-ink-mute">אין תוכן מתוזמן לשבוע הקרוב.</p>
				) : (
					<div className="space-y-3">
						{upcoming.map((item) => {
							const date = new Date(item.scheduledDate);
							const dayName = DAY_NAMES[date.getDay()];
							const dateStr = date.toLocaleDateString("he-IL", { day: "numeric", month: "numeric" });
							return (
								<div key={item.id} className="flex items-start gap-3 p-3 rounded-lg bg-ninja-panel border border-ninja-line/50">
									<div className="text-center min-w-[50px]">
										<p className="text-xs text-ink-mute">{dayName}</p>
										<p className="text-lg font-bold text-ink">{dateStr}</p>
									</div>
									<div className="flex-1">
										<p className="text-sm font-medium text-ink">
											{item.brief.recommendedTitle || item.brief.targetKeyword}
										</p>
										<p className="text-xs text-ink-mute">{item.brief.briefType.replace(/_/g, " ")}</p>
									</div>
									<span className={`text-xs px-2 py-0.5 rounded border ${STATUS_COLORS[item.status] || ""}`}>
										{STATUS_LABELS[item.status] || item.status}
									</span>
								</div>
							);
						})}
					</div>
				)}
			</div>

			{/* Monthly Calendar */}
			<div className="rounded-xl border border-ninja-line bg-ninja-card p-5">
				<h3 className="text-sm font-semibold text-ink mb-4">
					{now.toLocaleDateString("he-IL", { month: "long", year: "numeric" })}
				</h3>

				{entries.length === 0 ? (
					<p className="text-sm text-ink-mute">אין תוכן מתוזמן לחודש הזה.</p>
				) : (
					<div className="space-y-2">
						{entries.map((item) => {
							const date = new Date(item.scheduledDate);
							const dayName = DAY_NAMES[date.getDay()];
							const dateStr = date.toLocaleDateString("he-IL", { day: "numeric", month: "numeric" });
							return (
								<div key={item.id} className="flex items-center gap-3 py-2 border-b border-ninja-line/30 last:border-0">
									<span className="text-xs text-ink-mute min-w-[80px]">{dayName} {dateStr}</span>
									<span className="text-sm text-ink flex-1">
										{item.brief.recommendedTitle || item.brief.targetKeyword}
									</span>
									<span className={`text-[10px] px-1.5 py-0.5 rounded ${STATUS_COLORS[item.status] || ""}`}>
										{STATUS_LABELS[item.status] || item.status}
									</span>
								</div>
							);
						})}
					</div>
				)}
			</div>
		</div>
	);
}
