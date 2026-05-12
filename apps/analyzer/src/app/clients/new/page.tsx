"use client";

import { useActionState } from "react";
import Link from "next/link";
import { addClient, type AddClientState } from "@/app/actions";

const initial: AddClientState = {};

export default function NewClientPage() {
	const [state, formAction, pending] = useActionState(addClient, initial);

	return (
		<div className="max-w-xl space-y-6">
			<div>
				<Link href="/" className="text-xs text-ink-dim hover:text-ink">
					← Back to clients
				</Link>
				<h1 className="text-2xl font-semibold tracking-tight mt-2">
					Connect a new client
				</h1>
				<p className="text-sm text-ink-dim mt-1">
					Install the <code className="text-xs bg-ninja-raised px-1 py-0.5 rounded">agency-seo-scanner</code> plugin on the
					client&apos;s WordPress install. The plugin admin page shows the base URL and token to paste below.
				</p>
			</div>

			<form action={formAction} className="space-y-4 rounded-lg border border-ninja-line bg-ninja-panel/60 p-6">
				<div>
					<label className="block text-sm font-medium mb-1.5" htmlFor="name">
						Client name
					</label>
					<input
						type="text"
						id="name"
						name="name"
						required
						placeholder="Levizon Market"
						className="w-full rounded-md border border-ninja-line-strong px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none"
					/>
					{state.fieldErrors?.name && (
						<p className="text-xs text-red-600 mt-1">{state.fieldErrors.name}</p>
					)}
				</div>

				<div>
					<label className="block text-sm font-medium mb-1.5" htmlFor="baseUrl">
						API base URL
					</label>
					<input
						type="url"
						id="baseUrl"
						name="baseUrl"
						required
						placeholder="https://www.example.com/wp-json/aseo/v1"
						className="w-full rounded-md border border-ninja-line-strong px-3 py-2 text-sm font-mono focus:border-zinc-900 focus:outline-none"
					/>
					<p className="text-xs text-ink-dim mt-1">
						Copy from the plugin admin page (&quot;API Base URL&quot;).
					</p>
					{state.fieldErrors?.baseUrl && (
						<p className="text-xs text-red-600 mt-1">{state.fieldErrors.baseUrl}</p>
					)}
				</div>

				<div>
					<label className="block text-sm font-medium mb-1.5" htmlFor="token">
						API token
					</label>
					<input
						type="text"
						id="token"
						name="token"
						required
						placeholder="48-char random token"
						className="w-full rounded-md border border-ninja-line-strong px-3 py-2 text-sm font-mono focus:border-zinc-900 focus:outline-none"
					/>
					{state.fieldErrors?.token && (
						<p className="text-xs text-red-600 mt-1">{state.fieldErrors.token}</p>
					)}
				</div>

				{state.error && (
					<div className="rounded-md bg-blade/10 border border-blade/30 px-3 py-2 text-sm text-ink">
						{state.error}
					</div>
				)}

				<div className="flex items-center gap-3 pt-2">
					<button
						type="submit"
						disabled={pending}
						className="inline-flex items-center rounded-md bg-blade px-4 py-2 text-sm text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
					>
						{pending ? "Verifying…" : "Connect"}
					</button>
					<Link
						href="/"
						className="text-sm text-ink-dim hover:text-ink"
					>
						Cancel
					</Link>
				</div>
				<p className="text-xs text-ink-dim mt-2">
					On submit we&apos;ll call <code className="bg-ninja-raised px-1 py-0.5 rounded">/info</code> to verify the
					connection before saving anything.
				</p>
			</form>
		</div>
	);
}
