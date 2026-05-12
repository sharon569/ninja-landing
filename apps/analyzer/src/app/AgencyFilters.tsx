"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";

export function AgencyFilters() {
	const router = useRouter();
	const pathname = usePathname();
	const params = useSearchParams();

	function setParam(key: string, value: string | null) {
		const next = new URLSearchParams(params);
		if (!value) next.delete(key);
		else next.set(key, value);
		router.push(`${pathname}?${next.toString()}`);
	}

	return (
		<div className="flex flex-wrap items-center gap-2 text-xs">
			<input
				type="search"
				placeholder="חיפוש לקוח / דומיין…"
				defaultValue={params.get("q") ?? ""}
				onChange={(e) => setParam("q", e.target.value || null)}
				className="bg-ninja-raised border border-ninja-line text-ink rounded-md px-3 py-1.5 w-56 focus:outline-none focus:border-blade/60"
			/>
			<Select
				name="health"
				value={params.get("health") ?? ""}
				onChange={(v) => setParam("health", v)}
				placeholder="Health"
			>
				<option value="excellent">Excellent</option>
				<option value="good">Good</option>
				<option value="warn">Warn</option>
				<option value="poor">Poor</option>
			</Select>
			<Select
				name="vertical"
				value={params.get("vertical") ?? ""}
				onChange={(v) => setParam("vertical", v)}
				placeholder="כל הvertical-ים"
			>
				<option value="service">שירות</option>
				<option value="ecommerce">eCommerce</option>
				<option value="local_business">עסק מקומי</option>
				<option value="restaurant">מסעדה</option>
				<option value="real_estate">נדל״ן</option>
				<option value="medical">רפואה</option>
				<option value="beauty">יופי</option>
				<option value="automotive">רכב</option>
				<option value="education">חינוך</option>
				<option value="legal">משפטים</option>
				<option value="finance">פיננסים</option>
				<option value="professional_services">שירותים מקצועיים</option>
				<option value="home_services">שירותי בית</option>
				<option value="saas">SaaS</option>
				<option value="content_site">אתר תוכן</option>
				<option value="other">אחר</option>
			</Select>
			<label className="inline-flex items-center gap-2 text-ink-dim cursor-pointer">
				<input
					type="checkbox"
					checked={params.get("pending") === "1"}
					onChange={(e) => setParam("pending", e.target.checked ? "1" : null)}
					className="accent-blade"
				/>
				רק עם פריטים פתוחים
			</label>
			<label className="inline-flex items-center gap-2 text-ink-dim cursor-pointer">
				<input
					type="checkbox"
					checked={params.get("high") === "1"}
					onChange={(e) => setParam("high", e.target.checked ? "1" : null)}
					className="accent-blade"
				/>
				רק High Impact
			</label>
			<label className="inline-flex items-center gap-2 text-ink-dim cursor-pointer">
				<input
					type="checkbox"
					checked={params.get("staleGsc") === "1"}
					onChange={(e) => setParam("staleGsc", e.target.checked ? "1" : null)}
					className="accent-blade"
				/>
				GSC ישן (14+ ימים)
			</label>
			{Array.from(params).length > 0 && (
				<button
					type="button"
					onClick={() => router.push(pathname)}
					className="text-xs text-ink-mute hover:text-blade underline"
				>
					ניקוי סינון
				</button>
			)}
		</div>
	);
}

function Select({
	value,
	onChange,
	placeholder,
	children,
}: {
	name: string;
	value: string;
	onChange: (v: string | null) => void;
	placeholder: string;
	children: React.ReactNode;
}) {
	return (
		<select
			value={value}
			onChange={(e) => onChange(e.target.value || null)}
			className="bg-ninja-raised border border-ninja-line text-ink rounded-md px-2.5 py-1.5 focus:outline-none focus:border-blade/60"
		>
			<option value="">{placeholder}</option>
			{children}
		</select>
	);
}
