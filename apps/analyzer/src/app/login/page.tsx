import { redirect } from "next/navigation";
import { ShurikenMark, NinjaWordmark } from "@/components/Logo";
import { getAdminUser } from "@/lib/supabase";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

const ERROR_MESSAGES: Record<string, string> = {
	not_admin: "המשתמש הזה אינו אדמין. פנה לעצמך 😉",
};

export default async function LoginPage({
	searchParams,
}: {
	searchParams: Promise<{ next?: string; error?: string }>;
}) {
	const sp = await searchParams;
	const existing = await getAdminUser();
	if (existing) redirect(sp.next && sp.next.startsWith("/") ? sp.next : "/");

	const urlError = sp.error ? (ERROR_MESSAGES[sp.error] ?? sp.error) : null;

	return (
		<div className="min-h-screen flex items-center justify-center px-6 py-16 relative overflow-hidden">
			<div
				className="absolute inset-0 pointer-events-none select-none flex items-center justify-center"
				aria-hidden="true"
			>
				<span
					className="font-black text-[clamp(20rem,40vw,40rem)] leading-none"
					style={{
						color: "rgba(255,42,60,0.04)",
						fontFamily: "'Noto Serif JP', serif",
					}}
				>
					忍
				</span>
			</div>

			<div className="relative w-full max-w-md">
				<div className="rounded-2xl border border-ninja-line-strong bg-ninja-panel/80 backdrop-blur-md p-8 shadow-[0_30px_80px_rgba(0,0,0,0.5)]">
					<div className="flex items-center gap-3 mb-6">
						<ShurikenMark size={40} />
						<div className="flex flex-col">
							<NinjaWordmark height={22} />
							<span className="text-[10px] font-medium text-ink-mute tracking-[0.3em] mt-0.5">
								ORGANIC OPS
							</span>
						</div>
					</div>

					<div className="space-y-1.5 mb-7">
						<span className="inline-block text-[10px] font-bold tracking-[0.25em] uppercase text-blade border border-blade/30 bg-blade/10 px-2.5 py-1 rounded-full">
							INTERNAL · ADMIN
						</span>
						<h1 className="font-display text-2xl text-ink">
							מערכת ניהול קידום אורגני
						</h1>
						<p className="text-sm text-ink-dim">
							כניסה לאדמינים בלבד. פנימי. מאובטח.
						</p>
					</div>

					{urlError && (
						<div className="mb-4 rounded-lg border border-blade/40 bg-blade/10 px-4 py-3 text-sm text-ink">
							{urlError}
						</div>
					)}

					<LoginForm next={sp.next ?? "/"} />

					<div className="mt-8 pt-6 border-t border-ninja-line text-center">
						<p className="text-[11px] text-ink-mute italic tracking-wider">
							שקטים בעבודה. קולניים בתוצאות.
						</p>
					</div>
				</div>
			</div>
		</div>
	);
}
