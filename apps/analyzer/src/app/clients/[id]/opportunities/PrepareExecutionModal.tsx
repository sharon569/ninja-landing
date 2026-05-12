"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X, AlertTriangle, Loader2 } from "lucide-react";
import { ACTION_TYPE_LABELS, type ExecutionActionType } from "@/lib/execution";
import { prepareExecutionForOpportunity } from "../execution/actions";

export function PrepareExecutionModal({
	opportunityId,
	clientId,
	relatedPage,
	onClose,
}: {
	opportunityId: string;
	clientId: string;
	relatedPage: string | null;
	onClose: () => void;
}) {
	const router = useRouter();
	const [pending, startTransition] = useTransition();
	const [error, setError] = useState<string | null>(null);
	const [actionType, setActionType] = useState<ExecutionActionType>("yoast_title_update");
	const [targetUrl, setTargetUrl] = useState(relatedPage ?? "");
	const [title, setTitle] = useState("");
	const [description, setDescription] = useState("");
	const [altText, setAltText] = useState("");
	const [imageUrl, setImageUrl] = useState("");
	const [targetLinkUrl, setTargetLinkUrl] = useState("");
	const [anchorText, setAnchorText] = useState("");
	const [placementHint, setPlacementHint] = useState("");
	const [snippet, setSnippet] = useState("");
	const [placement, setPlacement] = useState("append");

	function submit() {
		setError(null);

		// Per-actionType payload
		const payload: Record<string, unknown> = { targetUrl };
		if (actionType === "yoast_title_update") payload.title = title.trim();
		if (actionType === "yoast_description_update") payload.description = description.trim();
		if (actionType === "image_alt_update") {
			payload.altText = altText.trim();
			if (imageUrl) payload.imageUrl = imageUrl.trim();
		}
		if (actionType === "internal_link_insert") {
			payload.targetLinkUrl = targetLinkUrl.trim();
			payload.anchorText = anchorText.trim();
			payload.placementHint = placementHint.trim();
		}
		if (actionType === "content_snippet_insert") {
			payload.snippet = snippet.trim();
			payload.placement = placement;
		}

		startTransition(async () => {
			const r = await prepareExecutionForOpportunity(opportunityId, actionType, payload);
			if (r.ok) {
				router.push(`/clients/${clientId}/execution`);
				onClose();
			} else {
				setError(r.error ?? "Prepare Execution נכשל");
			}
		});
	}

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-ninja-black/80 backdrop-blur-sm p-4">
			<div className="max-w-2xl w-full rounded-xl border border-blade/40 bg-ninja-panel p-6 shadow-2xl">
				<div className="flex items-start justify-between mb-4">
					<div>
						<h3 className="font-display text-xl text-ink">הכנת Execution</h3>
						<p className="text-xs text-ink-dim mt-1">
							בחר את סוג הפעולה והערכים. אחרי יצירה, נדרש <strong>Dry Run</strong> ואז לחיצה מפורשת על Execute.
						</p>
					</div>
					<button type="button" onClick={onClose} className="text-ink-mute hover:text-ink">
						<X className="w-5 h-5" />
					</button>
				</div>

				<div className="space-y-4">
					<div>
						<label className="block text-xs uppercase tracking-wider text-ink-dim mb-1.5">סוג פעולה</label>
						<select
							value={actionType}
							onChange={(e) => setActionType(e.target.value as ExecutionActionType)}
							className="w-full rounded-md border border-ninja-line bg-ninja-black/60 px-3 py-2 text-sm text-ink"
						>
							{Object.entries(ACTION_TYPE_LABELS).map(([v, l]) => (
								<option key={v} value={v}>
									{l}
								</option>
							))}
						</select>
					</div>

					<div>
						<label className="block text-xs uppercase tracking-wider text-ink-dim mb-1.5">
							URL יעד {actionType === "image_alt_update" ? "(של הפוסט המכיל את התמונה)" : ""}
						</label>
						<input
							value={targetUrl}
							onChange={(e) => setTargetUrl(e.target.value)}
							className="w-full rounded-md border border-ninja-line bg-ninja-black/60 px-3 py-2 text-sm text-ink font-mono"
							dir="ltr"
							placeholder="https://example.com/page/"
						/>
					</div>

					{actionType === "yoast_title_update" && (
						<div>
							<label className="block text-xs uppercase tracking-wider text-ink-dim mb-1.5">Title חדש</label>
							<input
								value={title}
								onChange={(e) => setTitle(e.target.value)}
								className="w-full rounded-md border border-ninja-line bg-ninja-black/60 px-3 py-2 text-sm text-ink"
								maxLength={200}
							/>
							<div className="text-[10px] text-ink-mute mt-1 text-end">{title.length}/200</div>
						</div>
					)}

					{actionType === "yoast_description_update" && (
						<div>
							<label className="block text-xs uppercase tracking-wider text-ink-dim mb-1.5">Description חדש</label>
							<textarea
								value={description}
								onChange={(e) => setDescription(e.target.value)}
								className="w-full rounded-md border border-ninja-line bg-ninja-black/60 px-3 py-2 text-sm text-ink"
								rows={3}
								maxLength={300}
							/>
							<div className="text-[10px] text-ink-mute mt-1 text-end">{description.length}/300</div>
						</div>
					)}

					{actionType === "image_alt_update" && (
						<>
							<div>
								<label className="block text-xs uppercase tracking-wider text-ink-dim mb-1.5">URL התמונה (אופציונלי)</label>
								<input
									value={imageUrl}
									onChange={(e) => setImageUrl(e.target.value)}
									className="w-full rounded-md border border-ninja-line bg-ninja-black/60 px-3 py-2 text-sm text-ink font-mono"
									dir="ltr"
									placeholder="https://example.com/wp-content/uploads/.../img.jpg"
								/>
							</div>
							<div>
								<label className="block text-xs uppercase tracking-wider text-ink-dim mb-1.5">Alt Text חדש</label>
								<input
									value={altText}
									onChange={(e) => setAltText(e.target.value)}
									className="w-full rounded-md border border-ninja-line bg-ninja-black/60 px-3 py-2 text-sm text-ink"
									maxLength={300}
								/>
							</div>
						</>
					)}

					{actionType === "internal_link_insert" && (
						<>
							<div className="rounded-md border border-gold/30 bg-gold/10 text-gold text-xs px-3 py-2">
								<AlertTriangle className="w-3.5 h-3.5 inline-block me-1" />
								<strong>Preview בלבד</strong> ב-Plugin v0.3 — תקבל מסך לפני/אחרי, את הביצוע צריך לעשות ידנית בעורך WordPress.
							</div>
							<div>
								<label className="block text-xs uppercase tracking-wider text-ink-dim mb-1.5">URL יעד הקישור</label>
								<input
									value={targetLinkUrl}
									onChange={(e) => setTargetLinkUrl(e.target.value)}
									className="w-full rounded-md border border-ninja-line bg-ninja-black/60 px-3 py-2 text-sm text-ink font-mono"
									dir="ltr"
								/>
							</div>
							<div>
								<label className="block text-xs uppercase tracking-wider text-ink-dim mb-1.5">Anchor Text</label>
								<input
									value={anchorText}
									onChange={(e) => setAnchorText(e.target.value)}
									className="w-full rounded-md border border-ninja-line bg-ninja-black/60 px-3 py-2 text-sm text-ink"
								/>
							</div>
							<div>
								<label className="block text-xs uppercase tracking-wider text-ink-dim mb-1.5">רמז למיקום</label>
								<input
									value={placementHint}
									onChange={(e) => setPlacementHint(e.target.value)}
									className="w-full rounded-md border border-ninja-line bg-ninja-black/60 px-3 py-2 text-sm text-ink"
									placeholder="לדוגמה: פסקה ראשונה / לפני CTA"
								/>
							</div>
						</>
					)}

					{actionType === "content_snippet_insert" && (
						<>
							<div className="rounded-md border border-gold/30 bg-gold/10 text-gold text-xs px-3 py-2">
								<AlertTriangle className="w-3.5 h-3.5 inline-block me-1" />
								<strong>Preview בלבד</strong> ב-Plugin v0.3 — אין כתיבה לתוכן חי.
							</div>
							<div>
								<label className="block text-xs uppercase tracking-wider text-ink-dim mb-1.5">Snippet</label>
								<textarea
									value={snippet}
									onChange={(e) => setSnippet(e.target.value)}
									className="w-full rounded-md border border-ninja-line bg-ninja-black/60 px-3 py-2 text-sm text-ink"
									rows={5}
								/>
							</div>
							<div>
								<label className="block text-xs uppercase tracking-wider text-ink-dim mb-1.5">מיקום</label>
								<select
									value={placement}
									onChange={(e) => setPlacement(e.target.value)}
									className="rounded-md border border-ninja-line bg-ninja-black/60 px-3 py-2 text-sm text-ink"
								>
									<option value="append">בסוף התוכן</option>
									<option value="prepend">בתחילת התוכן</option>
								</select>
							</div>
						</>
					)}

					{error && (
						<div className="rounded-md border border-blade/30 bg-blade/10 text-blade text-xs px-3 py-2">
							{error}
						</div>
					)}
				</div>

				<div className="flex items-center justify-end gap-2 pt-4 mt-4 border-t border-ninja-line">
					<button
						type="button"
						onClick={onClose}
						className="rounded-md border border-ninja-line bg-ninja-panel/60 hover:bg-ninja-raised text-ink-dim px-4 py-2 text-sm"
					>
						ביטול
					</button>
					<button
						type="button"
						onClick={submit}
						disabled={pending}
						className="inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
						style={{ background: "linear-gradient(135deg, #ff2a3c, #b3001b)" }}
					>
						{pending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
						צור Execution Action
					</button>
				</div>
			</div>
		</div>
	);
}
