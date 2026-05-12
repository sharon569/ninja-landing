import Link from "next/link";
import { Settings, AlertTriangle, CheckCircle2, MapPin, Globe, ShieldCheck } from "lucide-react";
import {
	calcProfileCompletion,
	verticalLabel,
	languageLabel,
	automationLabel,
	type ProfileLike,
} from "@/lib/profile";

interface Props {
	clientId: string;
	profile: ProfileLike;
}

export function ClientProfileCard({ clientId, profile }: Props) {
	const c = calcProfileCompletion(profile);
	const complete = c.percent === 100;

	return (
		<section className="rounded-xl border border-ninja-line bg-ninja-panel/60 overflow-hidden">
			<header className="flex items-center justify-between gap-3 px-5 py-3 border-b border-ninja-line bg-ninja-raised/40">
				<div className="flex items-center gap-2">
					<span className="text-[10px] font-bold tracking-[0.25em] uppercase text-ink-dim">
						SEO Profile
					</span>
					{complete ? (
						<span className="inline-flex items-center gap-1 text-[10px] font-bold tracking-wider uppercase text-go bg-go/10 border border-go/30 rounded-full px-2 py-0.5">
							<CheckCircle2 className="w-3 h-3" />
							מלא
						</span>
					) : (
						<span className="inline-flex items-center gap-1 text-[10px] font-bold tracking-wider uppercase text-blade bg-blade/10 border border-blade/30 rounded-full px-2 py-0.5">
							<AlertTriangle className="w-3 h-3" />
							לא הושלם
						</span>
					)}
				</div>
				<Link
					href={`/clients/${clientId}/settings`}
					className="inline-flex items-center gap-1.5 text-xs text-ink-dim hover:text-gold transition-colors"
				>
					<Settings className="w-3 h-3" />
					ערוך
				</Link>
			</header>

			<div className="px-5 py-4 space-y-4">
				<div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-3">
					<MetaCell label="סוג עסק" value={verticalLabel(profile.vertical)} />
					<MetaCell label="שפה" value={languageLabel(profile.language)} icon={<Globe className="w-3 h-3" />} />
					<MetaCell label="מדינה" value={profile.country ?? "—"} />
					<MetaCell
						label="אזורי שירות"
						value={profile.serviceAreas?.length ? `${profile.serviceAreas.length}` : "—"}
						icon={<MapPin className="w-3 h-3" />}
					/>
					<MetaCell
						label="מתחרים"
						value={profile.competitors?.length ? `${profile.competitors.length}` : "—"}
					/>
					<MetaCell
						label="עמודים חשובים"
						value={profile.targetPages?.length ? `${profile.targetPages.length}` : "—"}
					/>
					<MetaCell
						label="אוטומציה"
						value={automationLabel(profile.automationLevel)}
						icon={<ShieldCheck className="w-3 h-3" />}
					/>
					<MetaCell
						label="השלמה"
						value={`${c.percent}%`}
						valueClass={c.percent === 100 ? "text-go" : c.percent >= 70 ? "text-gold" : "text-blade"}
					/>
				</div>

				{!complete && (
					<div className="text-[11px] text-ink-dim border-t border-ninja-line pt-3">
						שדות חסרים:{" "}
						<span className="text-blade">
							{c.missing
								.map((m) => MISSING_LABEL[m] ?? m)
								.join(" · ")}
						</span>
					</div>
				)}
			</div>
		</section>
	);
}

function MetaCell({
	label,
	value,
	icon,
	valueClass,
}: {
	label: string;
	value: string;
	icon?: React.ReactNode;
	valueClass?: string;
}) {
	return (
		<div className="flex flex-col">
			<dt className="text-[10px] font-bold tracking-[0.18em] uppercase text-ink-mute flex items-center gap-1.5">
				{icon}
				{label}
			</dt>
			<dd className={`text-sm font-semibold tabular-nums mt-1 ${valueClass ?? "text-ink"}`}>
				{value}
			</dd>
		</div>
	);
}

const MISSING_LABEL: Record<string, string> = {
	vertical: "סוג עסק",
	language: "שפה",
	country: "מדינה",
	seoGoals: "מטרות SEO",
	targetPages: "עמודים חשובים",
	competitors: "מתחרים",
	automationLevel: "רמת אוטומציה",
};
