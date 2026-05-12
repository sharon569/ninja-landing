"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export interface SubNavItem {
	label: string;
	href: string;
	count?: number;
}

export function SubNav({ items }: { items: SubNavItem[] }) {
	const pathname = usePathname();
	return (
		<nav className="flex items-center gap-1 border-b border-ninja-line overflow-x-auto">
			{items.map((item) => {
				const isActive = pathname === item.href;
				return (
					<Link
						key={item.href}
						href={item.href}
						className={[
							"relative px-4 py-3 text-sm whitespace-nowrap transition-colors",
							isActive
								? "text-ink font-semibold"
								: "text-ink-dim hover:text-ink",
						].join(" ")}
					>
						<span className="flex items-center gap-2">
							{item.label}
							{item.count !== undefined && item.count > 0 && (
								<span
									className={[
										"inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full text-[11px] font-bold tabular-nums",
										isActive
											? "bg-blade text-white"
											: "bg-ninja-raised text-ink-dim border border-ninja-line",
									].join(" ")}
								>
									{item.count}
								</span>
							)}
						</span>
						{isActive && (
							<span
								className="absolute -bottom-px left-0 right-0 h-0.5"
								style={{
									background: "linear-gradient(90deg, #ff2a3c, #ffd166)",
								}}
							/>
						)}
					</Link>
				);
			})}
		</nav>
	);
}
