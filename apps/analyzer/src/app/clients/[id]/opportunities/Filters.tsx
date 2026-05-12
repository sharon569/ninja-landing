"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useTransition } from "react";
import {
	OPPORTUNITY_TYPES,
	STATUS_OPTIONS,
	IMPACT_OPTIONS,
} from "@/lib/opportunities";

export function Filters() {
	const router = useRouter();
	const pathname = usePathname();
	const params = useSearchParams();
	const [, startTransition] = useTransition();

	function update(key: string, value: string | null) {
		const next = new URLSearchParams(params);
		if (value === null || value === "") next.delete(key);
		else next.set(key, value);
		startTransition(() => {
			router.push(`${pathname}?${next.toString()}`);
		});
	}

	return (
		<div className="flex flex-wrap items-center gap-2">
			<Select
				name="type"
				value={params.get("type") ?? ""}
				onChange={(v) => update("type", v)}
				placeholder="כל הסוגים"
			>
				{OPPORTUNITY_TYPES.map((o) => (
					<option key={o.value} value={o.value}>
						{o.label}
					</option>
				))}
			</Select>
			<Select
				name="status"
				value={params.get("status") ?? ""}
				onChange={(v) => update("status", v)}
				placeholder="כל הסטטוסים"
			>
				{STATUS_OPTIONS.map((o) => (
					<option key={o.value} value={o.value}>
						{o.label}
					</option>
				))}
			</Select>
			<Select
				name="impact"
				value={params.get("impact") ?? ""}
				onChange={(v) => update("impact", v)}
				placeholder="כל ההשפעות"
			>
				{IMPACT_OPTIONS.map((o) => (
					<option key={o.value} value={o.value}>
						Impact: {o.label}
					</option>
				))}
			</Select>
			<label className="inline-flex items-center gap-2 text-xs text-ink-dim cursor-pointer">
				<input
					type="checkbox"
					checked={params.get("keywordOnly") === "1"}
					onChange={(e) => update("keywordOnly", e.target.checked ? "1" : null)}
					className="accent-blade"
				/>
				רק מילות יעד
			</label>
			{Array.from(params).length > 0 && (
				<button
					type="button"
					onClick={() => startTransition(() => router.push(pathname))}
					className="text-xs text-ink-mute hover:text-blade underline"
				>
					ניקוי
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
	onChange: (v: string) => void;
	placeholder: string;
	children: React.ReactNode;
}) {
	return (
		<select
			value={value}
			onChange={(e) => onChange(e.target.value)}
			className="bg-ninja-raised border border-ninja-line text-ink text-xs rounded-md px-2.5 py-1.5 focus:outline-none focus:border-blade/60"
		>
			<option value="">{placeholder}</option>
			{children}
		</select>
	);
}
