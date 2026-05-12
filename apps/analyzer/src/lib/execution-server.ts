// Phase 11 — Execution Engine orchestrator (server-only).
//
// Public surface:
//   - createExecutionActionFromOpportunity(opp, actionType, payload, actor)
//   - runDryRun(actionId)
//   - executeAction(actionId, actor)
//   - cancelExecutionAction(actionId, actor)
//   - rollbackAction(actionId, actor)  // only Yoast title/desc + image alt
//   - loadExecutionActionsForClient(clientId)
//   - getWpCapabilities(clientId)
//
// Safety invariants (enforced top-of-function in every mutator):
//   1. Client exists, has baseUrl + token.
//   2. Plugin reports writeApiEnabled=true + actionType in supported set.
//   3. Source item must exist and be in 'approved' state for Opportunities.
//   4. executeAction requires status=dry_run_ready AND dryRunAt set.
//   5. Dry-run-only actionTypes can NEVER reach executing.
//   6. Concurrency: an action already in {executing, dry_run_ready} blocks
//      a second create from the same (sourceType, sourceId, actionType).

import "server-only";
import { db } from "./db";
import { getWpInfo, callWriteEndpoint, type WriteResponse } from "./wp-client";
import {
	EXECUTABLE_ACTIONS,
	DRY_RUN_ONLY_ACTIONS,
	ROLLBACK_SUPPORTED_ACTIONS,
	DRY_RUN_MAX_AGE_HOURS,
	type ExecutionActionType,
	type ExecutionReadiness,
} from "./execution";
import { createBaseline } from "./impact-server";
import { logExecutionEvent } from "./execution-events-server";
import { computeDecisionForOpportunity } from "./decision-server";
import { decisionAllowsExecution } from "./decision";
import { classifyPage, type ClientScopeConfig } from "./page-scope";

// ─── Types ────────────────────────────────────────────────────

export interface CreatePayload {
	// One of these targets is required (per actionType):
	targetUrl?: string;
	targetPostId?: number;
	attachmentId?: number;
	imageUrl?: string;
	// Per-action body:
	title?: string;
	description?: string;
	altText?: string;
	targetLinkUrl?: string;
	anchorText?: string;
	placementHint?: string;
	snippet?: string;
	placement?: string;
}

export interface DiffPreview {
	before: string | null;
	after: string | null;
	// Plugin v0.3.3+ — the title/description actually rendered to visitors
	// today, even when `before` (stored meta) is empty (template-rendered).
	currentRendered?: string | null;
	changed: boolean;
	warnings: string[];
	note: string | null;
}

// ─── Capability check ────────────────────────────────────────

export async function getWpCapabilities(clientId: string) {
	const client = await db.client.findUnique({ where: { id: clientId } });
	if (!client) throw new Error("Client not found");
	if (!client.baseUrl || !client.token) {
		return { ok: false, reason: "Client missing baseUrl or token" };
	}
	try {
		const info = await getWpInfo(client.baseUrl, client.token);
		return {
			ok: true,
			pluginVersion: info.plugin_version,
			writeApiEnabled: info.write_api_enabled,
			supportedActions: info.supported_write_actions ?? [],
			dryRunOnlyActions: info.dry_run_only_actions ?? [],
			yoastActive: info.yoast_active,
		};
	} catch (err) {
		return { ok: false, reason: (err as Error).message };
	}
}

// ─── Phase 12 — Execution Readiness ──────────────────────────

/** Semver compare for the 0.3.0+ check. */
function pluginVersionAtLeast(v: string | null, min: [number, number, number]): boolean {
	if (!v) return false;
	const parts = v.split(".").map((s) => parseInt(s, 10));
	for (let i = 0; i < 3; i++) {
		const a = parts[i] ?? 0;
		const b = min[i];
		if (a > b) return true;
		if (a < b) return false;
	}
	return true;
}

/**
 * Aggregate everything the Execution page needs to know whether the client
 * is ready to execute. Always returns — never throws. Use this to drive the
 * Readiness Panel and to gate ExecutionAction creation.
 */
export async function getExecutionReadiness(clientId: string): Promise<ExecutionReadiness> {
	const client = await db.client.findUnique({
		where: { id: clientId },
		select: {
			baseUrl: true,
			token: true,
			executionEnabled: true,
			executionPilotMode: true,
			allowedExecutionActions: true,
		},
	});
	const now = new Date().toISOString();
	const warnings: string[] = [];

	if (!client) {
		return {
			overallReady: false,
			executionEnabled: false,
			pilotMode: false,
			allowedActions: [],
			tokenPresent: false,
			pluginReachable: false,
			pluginVersion: null,
			pluginVersionOk: false,
			writeApiEnabled: false,
			dryRunSupported: false,
			yoastActive: false,
			pluginSupportedActions: [],
			lastCheckedAt: now,
			warnings: ["client_not_found"],
		};
	}

	const tokenPresent = !!(client.baseUrl && client.token);
	if (!tokenPresent) warnings.push("missing_token_or_baseUrl");
	if (!client.executionEnabled) warnings.push("execution_disabled_for_client");
	if ((client.allowedExecutionActions ?? []).length === 0 && client.executionEnabled) {
		warnings.push("no_allowed_actions_selected");
	}

	let pluginReachable = false;
	let pluginVersion: string | null = null;
	let writeApiEnabled = false;
	let dryRunSupported = false;
	let yoastActive = false;
	let pluginSupported: string[] = [];

	if (tokenPresent) {
		try {
			const info = await getWpInfo(client.baseUrl, client.token);
			pluginReachable = true;
			pluginVersion = info.plugin_version ?? null;
			writeApiEnabled = !!info.write_api_enabled;
			dryRunSupported = !!info.dry_run_supported;
			yoastActive = !!info.yoast_active;
			pluginSupported = info.supported_write_actions ?? [];
		} catch (err) {
			warnings.push(`plugin_unreachable: ${(err as Error).message}`);
		}
	}

	const versionOk = pluginVersionAtLeast(pluginVersion, [0, 3, 0]);
	if (pluginReachable && !versionOk) warnings.push("plugin_version_below_0.3.0");
	if (pluginReachable && !writeApiEnabled) warnings.push("write_api_disabled_on_plugin");
	if (pluginReachable && !dryRunSupported) warnings.push("dry_run_not_supported_by_plugin");

	const overallReady =
		client.executionEnabled &&
		tokenPresent &&
		pluginReachable &&
		versionOk &&
		writeApiEnabled &&
		dryRunSupported &&
		(client.allowedExecutionActions ?? []).length > 0;

	return {
		overallReady,
		executionEnabled: client.executionEnabled,
		pilotMode: client.executionPilotMode,
		allowedActions: client.allowedExecutionActions ?? [],
		tokenPresent,
		pluginReachable,
		pluginVersion,
		pluginVersionOk: versionOk,
		writeApiEnabled,
		dryRunSupported,
		yoastActive,
		pluginSupportedActions: pluginSupported,
		lastCheckedAt: now,
		warnings,
	};
}

/**
 * Centralised gate for "can we even *prepare* an ExecutionAction for this
 * (client, actionType)?" — used by createExecutionActionFromOpportunity and
 * by the Settings UI to short-circuit form submission.
 */
export async function canCreateExecutionAction(clientId: string, actionType: ExecutionActionType) {
	const r = await getExecutionReadiness(clientId);
	const missing: string[] = [];
	if (!r.executionEnabled) missing.push("execution_disabled_for_client");
	if (!r.tokenPresent) missing.push("missing_token_or_baseUrl");
	if (!r.pluginReachable) missing.push("plugin_unreachable");
	if (!r.pluginVersionOk) missing.push("plugin_version_below_0.3.0");
	if (!r.writeApiEnabled) missing.push("write_api_disabled_on_plugin");
	if (!r.dryRunSupported) missing.push("dry_run_not_supported_by_plugin");
	if (!r.pluginSupportedActions.includes(actionType)) missing.push("action_not_supported_by_plugin");
	// Allowed-actions check applies only to actions that can actually execute.
	// Dry-run-only ones (internal-link, content-snippet) bypass the allowlist
	// because they never mutate anything anyway.
	if (
		!DRY_RUN_ONLY_ACTIONS.includes(actionType) &&
		!r.allowedActions.includes(actionType)
	) {
		missing.push("action_not_allowed_for_client");
	}
	return { ok: missing.length === 0, missing, readiness: r };
}

// ─── Create ──────────────────────────────────────────────────

export async function createExecutionActionFromOpportunity(args: {
	opportunityId: string;
	actionType: ExecutionActionType;
	payload: CreatePayload;
	actor: string;
}) {
	const { opportunityId, actionType, payload, actor } = args;

	const opp = await db.opportunity.findUnique({ where: { id: opportunityId } });
	if (!opp) throw new Error("Opportunity not found");
	if (opp.status !== "approved") {
		throw new Error(`Opportunity must be approved (current: ${opp.status})`);
	}

	if (![...EXECUTABLE_ACTIONS, ...DRY_RUN_ONLY_ACTIONS].includes(actionType)) {
		throw new Error(`Unsupported actionType: ${actionType}`);
	}

	// Phase 15C.2 — SEO Crawl Scope guard. The target URL has to be an SEO-
	// eligible page; we refuse to push Yoast Title / Meta / Alt updates onto
	// checkout, cart, terms, privacy etc. unless the operator explicitly
	// added that URL to seoForcedTargetUrls. Dry-run-only actions (internal
	// link insert / content snippet) bypass — they never mutate.
	if (!DRY_RUN_ONLY_ACTIONS.includes(actionType)) {
		const targetUrl = payload.targetUrl ?? opp.relatedPage ?? null;
		if (targetUrl) {
			const c = await db.client.findUnique({
				where: { id: opp.clientId },
				select: {
					targetPages: true,
					seoIgnoredUrls: true,
					seoIgnoredPatterns: true,
					seoForcedTargetUrls: true,
				},
			});
			if (c) {
				const scopeCfg: ClientScopeConfig = {
					targetPages: c.targetPages,
					seoIgnoredUrls: c.seoIgnoredUrls,
					seoIgnoredPatterns: c.seoIgnoredPatterns,
					seoForcedTargetUrls: c.seoForcedTargetUrls,
				};
				const cls = classifyPage(targetUrl, scopeCfg);
				if (!cls.isSeoEligible) {
					throw new Error(
						`לא ניתן לבצע שינוי על עמוד מסוג ${cls.scope} (${cls.reason}). אם זה עמוד שכן צריך לקדם, הוסף אותו ל-Forced SEO Target URLs בהגדרות הלקוח.`,
					);
				}
			}
		}
	}

	// Phase 12 — Execution Readiness gate. Even if Plugin v0.3 is installed,
	// the agency must explicitly opt this client in.
	const gate = await canCreateExecutionAction(opp.clientId, actionType);
	if (!gate.ok) {
		// Friendly Hebrew error matched to the most relevant missing item.
		if (gate.missing.includes("execution_disabled_for_client")) {
			throw new Error("ביצוע אוטומטי לא מופעל עבור הלקוח הזה.");
		}
		if (gate.missing.includes("action_not_allowed_for_client")) {
			throw new Error("סוג הפעולה הזה לא מורשה ללקוח. עדכן את Allowed Actions בהגדרות.");
		}
		if (gate.missing.includes("write_api_disabled_on_plugin")) {
			throw new Error("Write API כבוי באתר הלקוח. הפעל את ה-kill switch באדמין WP.");
		}
		throw new Error(`Execution לא מוכן: ${gate.missing.join(", ")}`);
	}

	// Phase 14C — Decision Intelligence guard. The engine refuses to back
	// an executable recommendation that it cannot substantively justify.
	// `humanReviewedAt` on the Opportunity acts as the explicit override:
	// if Sharon manually marked the opp as reviewed, we trust him to know
	// what he's doing even if the engine would have blocked.
	const decision = await computeDecisionForOpportunity(opportunityId);
	if (!DRY_RUN_ONLY_ACTIONS.includes(actionType)) {
		const reviewed = opp.humanReviewedAt;
		if (!decisionAllowsExecution(decision, reviewed ?? null)) {
			const headline =
				decision.recommendedNextStep === "no_change"
					? "המערכת לא ממליצה לבצע שינוי בעמוד הזה כרגע."
					: decision.recommendedNextStep === "research_needed"
						? "אין מספיק נתונים להמליץ על שינוי. נדרש מחקר נוסף."
						: decision.recommendedNextStep === "monitor"
							? "המערכת ממליצה להמשיך לעקוב ולא לשנות כרגע."
							: decision.recommendedNextStep === "human_review"
								? "ההמלצה דורשת סקירה אנושית. סמן את ה-Opportunity כ-Reviewed להפעלת ביצוע."
								: "המערכת לא יכולה להמליץ על שינוי כי אין הסבר עם נתונים שמצדיק אותו.";
			const reason = decision.whyNot.possibleRisks.length
				? ` סיכונים: ${decision.whyNot.possibleRisks.join("; ")}.`
				: "";
			throw new Error(`${headline}${reason}`);
		}
	}

	// Concurrency guard — block a second open ExecutionAction for the same source+action
	const existingOpen = await db.executionAction.findFirst({
		where: {
			sourceType: "opportunity",
			sourceId: opportunityId,
			actionType,
			status: {
				in: ["draft", "dry_run_ready", "awaiting_execution_approval", "executing", "preview_only"],
			},
		},
	});
	if (existingOpen) return existingOpen; // idempotent: reuse the in-flight action

	const initialStatus = DRY_RUN_ONLY_ACTIONS.includes(actionType) ? "preview_only" : "draft";

	const created = await db.executionAction.create({
		data: {
			clientId: opp.clientId,
			sourceType: "opportunity",
			sourceId: opportunityId,
			actionType,
			status: initialStatus,
			targetUrl: payload.targetUrl ?? opp.relatedPage ?? null,
			targetPostId: payload.targetPostId ?? null,
			payload: JSON.stringify(payload),
			// Phase 14C — snapshot the decision so Impact Review can compare
			// actual outcomes against the measurement plan that was in effect
			// when the action was created, even if the Opportunity gets
			// recomputed later.
			decisionSnapshot: JSON.stringify(decision),
		},
	});

	await db.opportunityActionLog.create({
		data: {
			clientId: opp.clientId,
			opportunityId,
			createdBy: actor,
			actionType: "execution_prepared",
			fromStatus: opp.status,
			toStatus: opp.status,
			note: `Prepared ExecutionAction ${created.id} for ${actionType}`,
		},
	});

	return created;
}

// ─── Dry Run ─────────────────────────────────────────────────

export async function runDryRun(actionId: string, actor: string): Promise<{
	ok: boolean;
	status: string;
	diff: DiffPreview;
	error?: string;
}> {
	const action = await db.executionAction.findUnique({
		where: { id: actionId },
		include: { client: true },
	});
	if (!action) throw new Error("Action not found");
	if (action.status === "executing") throw new Error("Action is already executing");
	if (action.status === "executed") throw new Error("Action already executed");
	if (action.status === "cancelled" || action.status === "rolled_back") {
		throw new Error("Action is closed");
	}

	const client = action.client;
	if (!client.baseUrl || !client.token) {
		await db.executionAction.update({
			where: { id: actionId },
			data: { status: "dry_run_failed", error: "Client missing baseUrl/token" },
		});
		await logExecutionEvent({
			clientId: action.clientId,
			executionActionId: actionId,
			eventType: "dry_run_failed",
			title: "Dry Run נכשל — חסר Token/Base URL",
			message: "ה-Client בלי baseUrl או token. עדכן בפרופיל הלקוח.",
			metadata: { actionType: action.actionType, status: "dry_run_failed" },
		});
		return { ok: false, status: "dry_run_failed", diff: emptyDiff(), error: "Client missing baseUrl/token" };
	}

	const caps = await getWpCapabilities(client.id);
	if (!caps.ok) {
		await db.executionAction.update({
			where: { id: actionId },
			data: { status: "dry_run_failed", error: `Plugin not reachable: ${caps.reason}` },
		});
		await logExecutionEvent({
			clientId: action.clientId,
			executionActionId: actionId,
			eventType: "plugin_unreachable",
			title: "פלאגין לא נגיש",
			message: caps.reason ?? null,
			metadata: { actionType: action.actionType, status: "dry_run_failed" },
		});
		return { ok: false, status: "dry_run_failed", diff: emptyDiff(), error: caps.reason };
	}
	if (!caps.writeApiEnabled) {
		await db.executionAction.update({
			where: { id: actionId },
			data: { status: "dry_run_failed", error: "Write API disabled on plugin" },
		});
		await logExecutionEvent({
			clientId: action.clientId,
			executionActionId: actionId,
			eventType: "write_api_disabled",
			title: "Write API כבוי בפלאגין",
			message: "ה-kill switch באדמין WordPress מכבה את כל הכתיבה.",
			metadata: { actionType: action.actionType, status: "dry_run_failed" },
		});
		return { ok: false, status: "dry_run_failed", diff: emptyDiff(), error: "Write API disabled on plugin" };
	}
	if (!caps.supportedActions?.includes(action.actionType)) {
		await db.executionAction.update({
			where: { id: actionId },
			data: { status: "dry_run_failed", error: `actionType ${action.actionType} not supported by plugin` },
		});
		await logExecutionEvent({
			clientId: action.clientId,
			executionActionId: actionId,
			eventType: "dry_run_failed",
			title: "סוג פעולה לא נתמך בפלאגין",
			message: `actionType ${action.actionType} לא ב-supported_write_actions של הפלאגין.`,
			metadata: { actionType: action.actionType, status: "dry_run_failed" },
		});
		return { ok: false, status: "dry_run_failed", diff: emptyDiff(), error: "actionType not supported by plugin" };
	}

	const payload: CreatePayload = JSON.parse(action.payload);
	let resp: WriteResponse;
	try {
		resp = await callPluginForAction(action.actionType as ExecutionActionType, client.baseUrl, client.token, payload, /*dryRun*/ true, action.id);
	} catch (err) {
		await db.executionAction.update({
			where: { id: actionId },
			data: { status: "dry_run_failed", error: (err as Error).message },
		});
		await logExecutionEvent({
			clientId: action.clientId,
			executionActionId: actionId,
			eventType: "dry_run_failed",
			title: "Dry Run נכשל",
			message: (err as Error).message,
			metadata: { actionType: action.actionType, status: "dry_run_failed" },
		});
		return { ok: false, status: "dry_run_failed", diff: emptyDiff(), error: (err as Error).message };
	}

	const diff = extractDiff(resp);
	const isPreviewOnly = DRY_RUN_ONLY_ACTIONS.includes(action.actionType as ExecutionActionType);
	const nextStatus = isPreviewOnly ? "preview_only" : "dry_run_ready";

	await db.executionAction.update({
		where: { id: actionId },
		data: {
			status: nextStatus,
			dryRunResult: JSON.stringify(resp),
			diff: JSON.stringify(diff),
			dryRunAt: new Date(),
			auditLogId: resp.auditLogId ?? null,
			targetUrl: action.targetUrl ?? (resp.target?.url as string | undefined) ?? null,
			targetPostId:
				action.targetPostId ?? (resp.target?.postId as number | undefined) ?? null,
			error: null,
		},
	});

	if (action.sourceType === "opportunity") {
		await db.opportunityActionLog.create({
			data: {
				clientId: action.clientId,
				opportunityId: action.sourceId,
				createdBy: actor,
				actionType: "dry_run_completed",
				fromStatus: "approved",
				toStatus: "approved",
				note: `Dry Run OK · ${action.actionType} · changed=${diff.changed}`,
			},
		});
	}

	await logExecutionEvent({
		clientId: action.clientId,
		executionActionId: actionId,
		eventType: "dry_run_completed",
		title: `Dry Run הסתיים · ${action.actionType}`,
		message: `changed=${diff.changed}${diff.warnings.length ? ` · warnings=${diff.warnings.join(",")}` : ""}`,
		metadata: {
			actionType: action.actionType,
			targetUrl: action.targetUrl,
			status: nextStatus,
			changed: diff.changed,
			isPreviewOnly,
		},
	});

	return { ok: true, status: nextStatus, diff };
}

// ─── Execute ─────────────────────────────────────────────────

export async function executeAction(actionId: string, actor: string): Promise<{
	ok: boolean;
	status: string;
	error?: string;
}> {
	const action = await db.executionAction.findUnique({
		where: { id: actionId },
		include: { client: true },
	});
	if (!action) throw new Error("Action not found");

	// Safety invariants
	if (DRY_RUN_ONLY_ACTIONS.includes(action.actionType as ExecutionActionType)) {
		throw new Error("This action type is preview-only in plugin v0.3");
	}
	if (!action.dryRunAt) {
		throw new Error("Dry Run must run successfully before Execute");
	}
	if (action.status !== "dry_run_ready" && action.status !== "awaiting_execution_approval") {
		throw new Error(`Cannot execute from status=${action.status}`);
	}

	const client = action.client;
	if (!client.baseUrl || !client.token) {
		throw new Error("Client missing baseUrl/token");
	}

	// Phase 12 — Pilot Mode gate re-checked at execute time. If Sharon flipped
	// executionEnabled=false between Dry Run and Execute, we abort.
	const gate = await canCreateExecutionAction(client.id, action.actionType as ExecutionActionType);
	if (!gate.ok) {
		await db.executionAction.update({
			where: { id: actionId },
			data: { status: "dry_run_failed", error: `Readiness lost: ${gate.missing.join(", ")}` },
		});
		await logExecutionEvent({
			clientId: action.clientId,
			executionActionId: actionId,
			eventType: "readiness_failed",
			title: "Readiness אבד בין Dry Run ל-Execute",
			message: `Missing: ${gate.missing.join(", ")}`,
			metadata: { actionType: action.actionType, status: "dry_run_failed" },
		});
		throw new Error("Execution is not enabled for this client (state changed since Dry Run).");
	}

	// Phase 12 — Dry Run freshness. Anything older than DRY_RUN_MAX_AGE_HOURS
	// is rejected outright; the user must re-run dry run.
	const ageHours = (Date.now() - action.dryRunAt.getTime()) / (1000 * 60 * 60);
	if (ageHours > DRY_RUN_MAX_AGE_HOURS) {
		await db.executionAction.update({
			where: { id: actionId },
			data: { status: "dry_run_stale", error: `Dry Run הוא מלפני ${Math.floor(ageHours)} שעות (מעל ${DRY_RUN_MAX_AGE_HOURS}). הרץ Dry Run חדש.` },
		});
		await logExecutionEvent({
			clientId: action.clientId,
			executionActionId: actionId,
			eventType: "dry_run_stale",
			title: "Dry Run ישן — נדרש Dry Run חדש",
			message: `Dry Run מלפני ${Math.floor(ageHours)} שעות (מעל ${DRY_RUN_MAX_AGE_HOURS} שעות).`,
			metadata: { actionType: action.actionType, targetUrl: action.targetUrl, ageHours: Math.floor(ageHours), status: "dry_run_stale" },
		});
		throw new Error(`Dry Run ישן (${Math.floor(ageHours)} שעות) — נדרש Dry Run חדש.`);
	}

	// Phase 12 — Before-value freshness. Re-run a dry run now, compare its
	// `before` to the saved one. If the editor touched the page in between,
	// we don't want to silently overwrite their work.
	const savedDiff = action.diff ? (JSON.parse(action.diff) as DiffPreview) : null;
	if (savedDiff && savedDiff.before !== null) {
		try {
			const freshPayload: CreatePayload = JSON.parse(action.payload);
			const freshResp = await callPluginForAction(
				action.actionType as ExecutionActionType,
				client.baseUrl,
				client.token,
				freshPayload,
				/*dryRun*/ true,
				`${action.id}-freshness`,
			);
			const freshDiff = extractDiff(freshResp);
			if ((freshDiff.before ?? "") !== (savedDiff.before ?? "")) {
				await db.executionAction.update({
					where: { id: actionId },
					data: {
						status: "dry_run_stale",
						error: "הערך באתר השתנה מאז ה-Dry Run. יש להריץ Dry Run מחדש.",
						// Persist the fresh diff so the UI shows the user what's actually live now
						diff: JSON.stringify(freshDiff),
						dryRunResult: JSON.stringify(freshResp),
						dryRunAt: new Date(),
					},
				});
				await logExecutionEvent({
					clientId: action.clientId,
					executionActionId: actionId,
					eventType: "dry_run_stale",
					title: "ערך באתר השתנה מאז Dry Run",
					message: "Freshness probe גילה drift — Execute נחסם.",
					metadata: {
						actionType: action.actionType,
						targetUrl: action.targetUrl,
						status: "dry_run_stale",
					},
				});
				throw new Error("הערך באתר השתנה מאז ה-Dry Run. יש להריץ Dry Run מחדש.");
			}
		} catch (err) {
			// Distinguish freshness drift (already updated above + rethrown) from
			// a network/plugin error in the freshness probe — only the latter
			// goes here.
			const msg = (err as Error).message;
			if (msg.includes("Dry Run מחדש")) throw err;
			await db.executionAction.update({
				where: { id: actionId },
				data: { status: "dry_run_failed", error: `Freshness probe failed: ${msg}` },
			});
			throw new Error(`Freshness probe failed: ${msg}`);
		}
	}

	// Optimistic lock — only the row currently in dry_run_ready may flip to executing
	const lockResult = await db.executionAction.updateMany({
		where: {
			id: actionId,
			status: { in: ["dry_run_ready", "awaiting_execution_approval"] },
			executedAt: null,
		},
		data: { status: "executing" },
	});
	if (lockResult.count === 0) {
		throw new Error("Concurrent execute — action state changed");
	}

	await logExecutionEvent({
		clientId: action.clientId,
		executionActionId: actionId,
		eventType: "execution_started",
		title: `Execute התחיל · ${action.actionType}`,
		message: `מבוצע ע״י ${actor}.`,
		metadata: { actionType: action.actionType, targetUrl: action.targetUrl, status: "executing" },
	});

	const payload: CreatePayload = JSON.parse(action.payload);
	let resp: WriteResponse;
	try {
		resp = await callPluginForAction(action.actionType as ExecutionActionType, client.baseUrl, client.token, payload, /*dryRun*/ false, action.id);
	} catch (err) {
		await db.executionAction.update({
			where: { id: actionId },
			data: { status: "failed", error: (err as Error).message },
		});
		await logExecutionEvent({
			clientId: action.clientId,
			executionActionId: actionId,
			eventType: "execution_failed",
			title: "Execute נכשל",
			message: (err as Error).message,
			metadata: { actionType: action.actionType, targetUrl: action.targetUrl, status: "failed" },
		});
		return { ok: false, status: "failed", error: (err as Error).message };
	}

	const success = resp.ok && (resp.executed === true || resp.changed === false);
	const wasNoOp = resp.changed === false;

	if (!success) {
		await db.executionAction.update({
			where: { id: actionId },
			data: {
				status: "failed",
				executionResult: JSON.stringify(resp),
				auditLogId: resp.auditLogId ?? null,
				error: resp.error ?? "Plugin returned ok=false or executed=false",
			},
		});
		await logExecutionEvent({
			clientId: action.clientId,
			executionActionId: actionId,
			eventType: "execution_failed",
			title: "Execute נכשל מהפלאגין",
			message: resp.error ?? "Plugin returned ok=false or executed=false",
			metadata: { actionType: action.actionType, targetUrl: action.targetUrl, status: "failed" },
		});
		return { ok: false, status: "failed", error: resp.error ?? "execute failed" };
	}

	const isRollback = ROLLBACK_SUPPORTED_ACTIONS.includes(action.actionType as ExecutionActionType);
	const nextStatus = wasNoOp ? "executed" : (isRollback ? "rollback_available" : "executed");

	await db.executionAction.update({
		where: { id: actionId },
		data: {
			status: nextStatus,
			executedAt: new Date(),
			executedBy: actor,
			executionResult: JSON.stringify(resp),
			auditLogId: resp.auditLogId ?? null,
			error: null,
		},
	});

	// Post-execute hooks: only if source is opportunity AND something actually changed
	if (action.sourceType === "opportunity" && !wasNoOp) {
		await onOpportunityExecuted(action.sourceId, actor, action.actionType);
	}

	await logExecutionEvent({
		clientId: action.clientId,
		executionActionId: actionId,
		eventType: "execution_succeeded",
		title: `Execute הצליח · ${action.actionType}`,
		message: wasNoOp
			? "no-op (before == after) — לא בוצע שינוי בפועל."
			: `שינוי חי בוצע בהצלחה ע״י ${actor}.`,
		metadata: {
			actionType: action.actionType,
			targetUrl: action.targetUrl,
			status: nextStatus,
			wasNoOp,
		},
	});

	return { ok: true, status: nextStatus };
}

// ─── Finalize (Phase 14B) ─────────────────────────────────────

/**
 * Mark an ExecutionAction as finalized — the operator has reviewed it and
 * declares no rollback intent. Pure Analyzer state change; no WP call, no
 * meta changes, no plugin contact. The audit history (Yoast meta value,
 * executionResult, events) is preserved.
 */
export async function finalizeExecutionAction(actionId: string, actor: string): Promise<{
	ok: boolean;
	status: string;
	error?: string;
}> {
	const action = await db.executionAction.findUnique({ where: { id: actionId } });
	if (!action) throw new Error("Action not found");
	if (!["executed", "rollback_available"].includes(action.status)) {
		throw new Error(`Cannot finalize from status=${action.status}. Only executed/rollback_available are allowed.`);
	}
	await db.executionAction.update({
		where: { id: actionId },
		data: {
			status: "finalized",
			finalizedAt: new Date(),
			finalizedBy: actor,
		},
	});
	if (action.sourceType === "opportunity") {
		await db.opportunityActionLog.create({
			data: {
				clientId: action.clientId,
				opportunityId: action.sourceId,
				createdBy: actor,
				actionType: "finalized",
				fromStatus: action.status,
				toStatus: action.status,
				note: "ExecutionAction סומנה כסופית — אין rollback מתוכנן.",
			},
		});
	}
	return { ok: true, status: "finalized" };
}

// ─── Rollback ────────────────────────────────────────────────

export async function rollbackAction(actionId: string, actor: string): Promise<{
	ok: boolean;
	status: string;
	error?: string;
}> {
	const action = await db.executionAction.findUnique({
		where: { id: actionId },
		include: { client: true },
	});
	if (!action) throw new Error("Action not found");
	if (!ROLLBACK_SUPPORTED_ACTIONS.includes(action.actionType as ExecutionActionType)) {
		throw new Error("Rollback not supported for this action type");
	}
	if (action.status !== "rollback_available" && action.status !== "executed") {
		throw new Error(`Cannot rollback from status=${action.status}`);
	}
	if (!action.diff) throw new Error("No diff stored — cannot rollback");

	const diff = JSON.parse(action.diff) as DiffPreview;
	if (diff.before === null) throw new Error("No before-value captured");

	const client = action.client;

	// Phase 12 — Rollback drift check. We saved `diff.after` as the value we
	// pushed live. If the current value on WP is *not* `diff.after`, someone
	// else has edited it since — auto-rolling-back to `diff.before` would
	// silently overwrite their newer edit. Bail with a clear message.
	try {
		const probePayload: CreatePayload = JSON.parse(action.payload);
		const probeResp = await callPluginForAction(
			action.actionType as ExecutionActionType,
			client.baseUrl,
			client.token,
			probePayload,
			/*dryRun*/ true,
			`${action.id}-rollback-probe`,
		);
		const probeDiff = extractDiff(probeResp);
		if ((probeDiff.before ?? "") !== (diff.after ?? "")) {
			throw new Error("הערך הנוכחי באתר שונה מהערך שהמערכת ביצעה. Rollback אוטומטי לא בטוח.");
		}
	} catch (err) {
		const msg = (err as Error).message;
		// Bubble the drift message verbatim; only convert true probe failures.
		if (msg.includes("Rollback אוטומטי לא בטוח")) {
			await logExecutionEvent({
				clientId: action.clientId,
				executionActionId: actionId,
				eventType: "rollback_blocked_drift",
				title: "Rollback נחסם — drift",
				message: msg,
				metadata: { actionType: action.actionType, targetUrl: action.targetUrl, status: action.status },
			});
			return { ok: false, status: action.status, error: msg };
		}
		await logExecutionEvent({
			clientId: action.clientId,
			executionActionId: actionId,
			eventType: "rollback_failed",
			title: "Rollback drift probe נכשל",
			message: msg,
			metadata: { actionType: action.actionType, status: action.status },
		});
		return { ok: false, status: action.status, error: `Rollback drift probe failed: ${msg}` };
	}

	// Build a rollback payload by swapping before/after.
	const payload: CreatePayload = JSON.parse(action.payload);
	const rollbackPayload: CreatePayload = { ...payload };
	switch (action.actionType) {
		case "yoast_title_update":
			rollbackPayload.title = diff.before;
			break;
		case "yoast_description_update":
			rollbackPayload.description = diff.before;
			break;
		case "image_alt_update":
			rollbackPayload.altText = diff.before;
			break;
		default:
			throw new Error("Rollback not implemented for this actionType");
	}

	let resp: WriteResponse;
	try {
		// allowEmpty=true tells the plugin (v0.3.2+) to accept an empty
		// rollback value and DELETE the Yoast/alt meta key, restoring the
		// page to its pre-execute state (Yoast template fallback).
		resp = await callPluginForAction(
			action.actionType as ExecutionActionType,
			client.baseUrl,
			client.token,
			rollbackPayload,
			/*dryRun*/ false,
			`${action.id}-rollback`,
			/*allowEmpty*/ true,
		);
	} catch (err) {
		await logExecutionEvent({
			clientId: action.clientId,
			executionActionId: actionId,
			eventType: "rollback_failed",
			title: "Rollback נכשל",
			message: (err as Error).message,
			metadata: { actionType: action.actionType, status: action.status },
		});
		return { ok: false, status: action.status, error: (err as Error).message };
	}
	if (!resp.ok) {
		await logExecutionEvent({
			clientId: action.clientId,
			executionActionId: actionId,
			eventType: "rollback_failed",
			title: "Rollback נכשל מהפלאגין",
			message: resp.error ?? "Rollback failed",
			metadata: { actionType: action.actionType, status: action.status },
		});
		return { ok: false, status: action.status, error: resp.error ?? "Rollback failed" };
	}
	await db.executionAction.update({
		where: { id: actionId },
		data: {
			status: "rolled_back",
			rolledBackAt: new Date(),
			executionResult: JSON.stringify({ ...JSON.parse(action.executionResult ?? "{}"), rollback: resp }),
		},
	});
	await logExecutionEvent({
		clientId: action.clientId,
		executionActionId: actionId,
		eventType: "rollback_succeeded",
		title: "Rollback הצליח",
		message: `הערך הקודם הוחזר לאתר ע״י ${actor}.`,
		metadata: { actionType: action.actionType, targetUrl: action.targetUrl, status: "rolled_back" },
	});
	if (action.sourceType === "opportunity") {
		await db.opportunityActionLog.create({
			data: {
				clientId: action.clientId,
				opportunityId: action.sourceId,
				createdBy: actor,
				actionType: "rolled_back",
				fromStatus: "monitoring",
				toStatus: "approved",
				note: "Rollback של פעולת Execution",
			},
		});
		await db.opportunity.update({
			where: { id: action.sourceId },
			data: {
				status: "approved",
				manuallyAppliedAt: null,
				monitoringStartedAt: null,
			},
		});
	}
	return { ok: true, status: "rolled_back" };
}

// ─── Cancel ──────────────────────────────────────────────────

export async function cancelExecutionAction(actionId: string, actor: string) {
	const action = await db.executionAction.findUnique({ where: { id: actionId } });
	if (!action) throw new Error("Action not found");
	if (action.status === "executed" || action.status === "rolled_back") {
		throw new Error("Cannot cancel — action already completed");
	}
	if (action.status === "executing") {
		throw new Error("Cannot cancel an action mid-execution");
	}
	await db.executionAction.update({
		where: { id: actionId },
		data: { status: "cancelled", cancelledAt: new Date() },
	});
	if (action.sourceType === "opportunity") {
		await db.opportunityActionLog.create({
			data: {
				clientId: action.clientId,
				opportunityId: action.sourceId,
				createdBy: actor,
				actionType: "execution_cancelled",
				fromStatus: action.status,
				toStatus: action.status,
				note: "ExecutionAction בוטלה",
			},
		});
	}
	return { ok: true };
}

// ─── List for client ─────────────────────────────────────────

export async function loadExecutionActionsForClient(clientId: string) {
	return await db.executionAction.findMany({
		where: { clientId },
		orderBy: { updatedAt: "desc" },
		take: 100,
	});
}

// ─── Internals ───────────────────────────────────────────────

function emptyDiff(): DiffPreview {
	return { before: null, after: null, changed: false, warnings: [], note: null };
}

function extractDiff(resp: WriteResponse): DiffPreview {
	const before = (resp.before ?? resp.beforeSnippet ?? resp.beforeExcerpt ?? null) as string | null;
	const after = (resp.after ?? resp.afterSnippet ?? resp.afterPreview ?? null) as string | null;
	return {
		before,
		after,
		currentRendered: resp.currentRendered ?? null,
		changed: !!resp.changed,
		warnings: resp.warnings ?? [],
		note: resp.note ?? null,
	};
}

async function callPluginForAction(
	actionType: ExecutionActionType,
	baseUrl: string,
	token: string,
	payload: CreatePayload,
	dryRun: boolean,
	requestId: string,
	allowEmpty: boolean = false,
): Promise<WriteResponse> {
	const common = {
		dryRun,
		requestId,
		allowEmpty,
		postId: payload.targetPostId,
		url: payload.targetUrl,
	};
	switch (actionType) {
		case "yoast_title_update":
			return callWriteEndpoint(baseUrl, token, "yoast-title", { ...common, title: payload.title ?? "" });
		case "yoast_description_update":
			return callWriteEndpoint(baseUrl, token, "yoast-description", { ...common, description: payload.description ?? "" });
		case "image_alt_update":
			return callWriteEndpoint(baseUrl, token, "image-alt", {
				...common,
				attachmentId: payload.attachmentId,
				imageUrl: payload.imageUrl,
				altText: payload.altText ?? "",
			});
		case "internal_link_insert":
			return callWriteEndpoint(baseUrl, token, "internal-link", {
				...common,
				targetUrl: payload.targetLinkUrl,
				anchorText: payload.anchorText,
				placementHint: payload.placementHint,
			});
		case "content_snippet_insert":
			return callWriteEndpoint(baseUrl, token, "content-snippet", {
				...common,
				snippet: payload.snippet,
				placement: payload.placement,
			});
	}
}

async function onOpportunityExecuted(opportunityId: string, actor: string, actionType: string) {
	const opp = await db.opportunity.findUnique({
		where: { id: opportunityId },
		include: { baseline: true },
	});
	if (!opp) return;

	const now = new Date();
	await db.opportunity.update({
		where: { id: opportunityId },
		data: {
			status: "monitoring",
			manuallyAppliedAt: now,
			manuallyAppliedBy: actor,
			manualActionNote: `בוצע דרך Execution Engine · ${actionType}`,
			monitoringStartedAt: now,
		},
	});

	// Auto-baseline if not present — uses prior 28 days of GSC for relatedQuery/relatedPage.
	if (!opp.baseline && (opp.relatedPage || opp.relatedQuery)) {
		try {
			await createBaseline(opportunityId);
		} catch (err) {
			console.error("auto baseline failed:", err);
		}
	}

	await db.opportunityActionLog.create({
		data: {
			clientId: opp.clientId,
			opportunityId,
			createdBy: actor,
			actionType: "executed",
			fromStatus: "approved",
			toStatus: "monitoring",
			note: "הפעולה בוצעה דרך Execution Engine",
		},
	});
}
