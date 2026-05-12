import type { Metadata } from "next";
import Link from "next/link";
import { Rubik, Heebo } from "next/font/google";
import { ShurikenMark, NinjaWordmark } from "@/components/Logo";
import { LogoutButton } from "@/components/LogoutButton";
import { getSession } from "@/lib/auth";
import "./globals.css";

const rubik = Rubik({
	subsets: ["latin", "hebrew"],
	weight: ["500", "700", "800", "900"],
	variable: "--font-rubik",
	display: "swap",
});

const heebo = Heebo({
	subsets: ["latin", "hebrew"],
	weight: ["300", "400", "500", "700"],
	variable: "--font-heebo",
	display: "swap",
});

export const metadata: Metadata = {
	title: "מערכת ניהול קידום אורגני · NINJA",
	description: "פלטפורמת ניהול לקוחות SEO של NINJA Digital",
	robots: { index: false, follow: false },
};

export default async function RootLayout({
	children,
}: Readonly<{ children: React.ReactNode }>) {
	const session = await getSession();

	return (
		<html
			lang="he"
			dir="rtl"
			className={`${rubik.variable} ${heebo.variable} h-full antialiased`}
		>
			<body className="min-h-full flex flex-col bg-ninja-black text-ink">
				{session ? (
					<header className="sticky top-0 z-30 backdrop-blur-md bg-ninja-black/85 border-b border-ninja-line">
						<div className="mx-auto max-w-7xl px-6 py-3.5 flex items-center justify-between gap-6">
							<Link href="/" className="flex items-center gap-3 group">
								<ShurikenMark size={34} />
								<div className="flex flex-col">
									<NinjaWordmark height={20} />
									<span className="text-[10px] font-medium text-ink-mute tracking-[0.3em] mt-0.5">
										ORGANIC OPS
									</span>
								</div>
							</Link>

							<div className="flex-1" />

							<nav className="flex items-center gap-2 text-sm">
								<Link
									href="/"
									className="px-3 py-1.5 rounded-md text-ink-dim hover:text-ink transition-colors"
								>
									לקוחות
								</Link>
								<Link
									href="/clients/new"
									className="inline-flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-sm font-semibold text-white shadow-[0_4px_14px_rgba(255,42,60,0.35)] hover:shadow-[0_6px_18px_rgba(255,42,60,0.45)] transition-shadow"
									style={{
										background: "linear-gradient(135deg, #ff2a3c, #b3001b)",
									}}
								>
									הוספת לקוח
								</Link>
								<div className="mx-1 h-5 w-px bg-ninja-line" />
								<span className="text-[11px] tracking-[0.2em] uppercase text-ink-mute">
									v0.1
								</span>
								<LogoutButton />
							</nav>
						</div>
					</header>
				) : null}

				<main className="flex-1">
					<div className={session ? "mx-auto max-w-7xl px-6 py-10" : ""}>
						{children}
					</div>
				</main>

				{session ? (
					<footer className="border-t border-ninja-line bg-ninja-black">
						<div className="mx-auto max-w-7xl px-6 py-5 flex items-center justify-between text-xs text-ink-mute">
							<span>
								NINJA Digital · מערכת ניהול קידום אורגני · v0.1
							</span>
							<span className="italic text-gold-deep">
								שקטים בעבודה. קולניים בתוצאות.
							</span>
						</div>
					</footer>
				) : null}
			</body>
		</html>
	);
}
