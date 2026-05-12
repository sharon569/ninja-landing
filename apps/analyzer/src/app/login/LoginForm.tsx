"use client";

import { useActionState } from "react";
import { signIn, type LoginState } from "./actions";

export function LoginForm({ next }: { next: string }) {
	const [state, formAction, pending] = useActionState<LoginState | undefined, FormData>(
		signIn,
		undefined
	);

	return (
		<form action={formAction} className="space-y-4">
			<input type="hidden" name="next" value={next} />

			<label className="block">
				<span className="text-xs font-bold tracking-[0.15em] uppercase text-ink-dim mb-1.5 block">
					אימייל
				</span>
				<input
					type="email"
					name="email"
					required
					autoComplete="email"
					placeholder="sharon@samp.ninja"
					dir="ltr"
					className="w-full bg-ninja-raised border border-ninja-line rounded-lg px-4 py-2.5 text-ink placeholder:text-ink-mute focus:outline-none focus:border-blade/60 focus:ring-2 focus:ring-blade/20 transition-colors"
				/>
			</label>

			<label className="block">
				<span className="text-xs font-bold tracking-[0.15em] uppercase text-ink-dim mb-1.5 block">
					סיסמה
				</span>
				<input
					type="password"
					name="password"
					required
					minLength={6}
					autoComplete="current-password"
					placeholder="לפחות 6 תווים"
					className="w-full bg-ninja-raised border border-ninja-line rounded-lg px-4 py-2.5 text-ink placeholder:text-ink-mute focus:outline-none focus:border-blade/60 focus:ring-2 focus:ring-blade/20 transition-colors"
				/>
			</label>

			{state?.error && (
				<div className="rounded-lg border border-blade/40 bg-blade/10 px-4 py-2.5 text-sm text-ink">
					{state.error}
				</div>
			)}

			<button
				type="submit"
				disabled={pending}
				className="w-full inline-flex items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-bold text-white shadow-[0_6px_18px_rgba(255,42,60,0.35)] hover:shadow-[0_8px_22px_rgba(255,42,60,0.45)] disabled:opacity-60 disabled:cursor-not-allowed transition-shadow"
				style={{ background: "linear-gradient(135deg, #ff2a3c, #b3001b)" }}
			>
				{pending ? "בודק…" : "כניסה"}
			</button>
		</form>
	);
}
