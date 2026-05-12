"use server";

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { db } from "@/lib/db";
import { PluginClient, PluginClientError } from "@/lib/plugin-client";
import { runAudit } from "@/lib/audit";

// ---------------------------------------------------------------------------
// addClient — called from <form action={addClient}> on /clients/new
// ---------------------------------------------------------------------------

const addClientInput = z.object({
	name: z.string().min(1, "Name is required").max(100),
	baseUrl: z.string().url("Must be a valid URL"),
	token: z.string().min(20, "Token looks too short"),
});

export interface AddClientState {
	ok?: boolean;
	error?: string;
	fieldErrors?: Partial<Record<"name" | "baseUrl" | "token", string>>;
}

export async function addClient(
	_prev: AddClientState | undefined,
	formData: FormData,
): Promise<AddClientState> {
	const parsed = addClientInput.safeParse({
		name: formData.get("name"),
		baseUrl: formData.get("baseUrl"),
		token: formData.get("token"),
	});
	if (!parsed.success) {
		const fieldErrors: AddClientState["fieldErrors"] = {};
		for (const issue of parsed.error.issues) {
			const k = issue.path[0] as keyof NonNullable<AddClientState["fieldErrors"]>;
			fieldErrors[k] = issue.message;
		}
		return { error: "Please fix the highlighted fields.", fieldErrors };
	}

	// Verify the plugin responds before persisting anything.
	const client = new PluginClient({
		baseUrl: parsed.data.baseUrl,
		token: parsed.data.token,
	});
	let info;
	try {
		info = await client.info();
	} catch (err) {
		if (err instanceof PluginClientError) {
			return {
				error: `Plugin /info call failed (HTTP ${err.status}): ${err.message}. Double-check the URL and token, and that the plugin is network-activated.`,
			};
		}
		return { error: `Unexpected error: ${(err as Error).message}` };
	}

	// Persist the client. Use baseUrl as the unique key to avoid double-adds.
	let created;
	try {
		created = await db.client.create({
			data: {
				name: parsed.data.name,
				baseUrl: parsed.data.baseUrl.replace(/\/+$/, ""),
				token: parsed.data.token,
				lastInfo: JSON.stringify(info),
				lastInfoAt: new Date(),
			},
		});
	} catch (err) {
		// Unique constraint = baseUrl already exists.
		const msg = (err as Error).message;
		if (msg.includes("Unique constraint") || msg.includes("UNIQUE")) {
			return { error: "A client with this base URL is already connected." };
		}
		return { error: `Database error: ${msg}` };
	}

	revalidatePath("/");
	redirect(`/clients/${created.id}`);
}

// ---------------------------------------------------------------------------
// runScan — called from <form action={runScan}> on /clients/[id]
// ---------------------------------------------------------------------------

export async function runScan(clientId: string): Promise<void> {
	const client = await db.client.findUnique({ where: { id: clientId } });
	if (!client) {
		throw new Error(`Client ${clientId} not found`);
	}

	const plugin = new PluginClient({
		baseUrl: client.baseUrl,
		token: client.token,
	});

	const startedAt = Date.now();
	const payload = await plugin.scan();
	const durationMs = Date.now() - startedAt;

	// Persist raw payload to disk so we can re-run audits without re-pulling.
	const ts = new Date().toISOString().replace(/[:.]/g, "-");
	const dir = path.resolve(process.cwd(), "data", clientId);
	await mkdir(dir, { recursive: true });
	const filePath = path.join(dir, `scan-${ts}.json`);
	const jsonString = JSON.stringify(payload);
	await writeFile(filePath, jsonString, "utf-8");

	// Run audit rules over the payload.
	const findings = runAudit(payload);

	// Compact summary stored in DB (headline numbers, no full payload).
	const headlineCounts = {
		sites: payload.manifest?.network?.sites_count ?? 0,
		urls_total: Object.values(payload.sites ?? {}).reduce(
			(sum, blog) => sum + (blog?.counts?.urls_total ?? 0),
			0,
		),
		products: Object.values(payload.sites ?? {}).reduce(
			(sum, blog) => sum + (blog?.counts?.products ?? 0),
			0,
		),
		warnings: (payload.manifest?.warnings ?? []).length,
		findings_count: findings.length,
		findings_total_affected: findings.reduce((s, f) => s + f.count, 0),
	};

	await db.$transaction(async (tx) => {
		const scan = await tx.scan.create({
			data: {
				clientId,
				filePath: path.relative(process.cwd(), filePath),
				summary: JSON.stringify(headlineCounts),
				sizeBytes: Buffer.byteLength(jsonString, "utf-8"),
				durationMs,
			},
		});
		if (findings.length > 0) {
			await tx.finding.createMany({
				data: findings.map((f) => ({
					scanId: scan.id,
					ruleId: f.ruleId,
					severity: f.severity,
					count: f.count,
					payload: JSON.stringify(f),
				})),
			});
		}
		// Refresh cached info + lastScanAt on the client.
		await tx.client.update({
			where: { id: clientId },
			data: {
				lastScanAt: new Date(),
				lastInfo: JSON.stringify(payload.manifest?.environment ?? {}),
				lastInfoAt: new Date(),
			},
		});
	});

	revalidatePath(`/clients/${clientId}`);
	revalidatePath("/");
}

// ---------------------------------------------------------------------------
// deleteClient
// ---------------------------------------------------------------------------

export async function deleteClient(clientId: string): Promise<void> {
	await db.client.delete({ where: { id: clientId } });
	revalidatePath("/");
	redirect("/");
}
