// Supabase server client for Next.js (App Router).
// Re-uses the same project as the ninja-landing portal — so admin_users carries over.

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { NextRequest, NextResponse } from "next/server";

const SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY =
	process.env.PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;

function assertEnv(): { url: string; key: string } {
	if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
		throw new Error(
			"Missing PUBLIC_SUPABASE_URL or PUBLIC_SUPABASE_ANON_KEY env vars. " +
				"Copy them from ninja-landing/.env into apps/analyzer/.env."
		);
	}
	return { url: SUPABASE_URL, key: SUPABASE_ANON_KEY };
}

/**
 * Server-component / server-action Supabase client.
 * Reads + writes cookies via Next.js `cookies()`.
 */
export async function createSupabaseServerClient() {
	const { url, key } = assertEnv();
	const cookieStore = await cookies();
	return createServerClient(url, key, {
		cookies: {
			getAll() {
				return cookieStore.getAll().map(({ name, value }) => ({ name, value }));
			},
			setAll(toSet: { name: string; value: string; options?: CookieOptions }[]) {
				try {
					for (const { name, value, options } of toSet) {
						cookieStore.set(name, value, options as CookieOptions);
					}
				} catch {
					// Server Components cannot set cookies — Server Actions / Route Handlers can.
					// This try/catch keeps server-component reads safe.
				}
			},
		},
	});
}

/**
 * Middleware Supabase client — uses NextRequest cookies and writes back to a NextResponse.
 */
export function createSupabaseMiddlewareClient(req: NextRequest, res: NextResponse) {
	const { url, key } = assertEnv();
	return createServerClient(url, key, {
		cookies: {
			getAll() {
				return req.cookies.getAll().map(({ name, value }) => ({ name, value }));
			},
			setAll(toSet: { name: string; value: string; options?: CookieOptions }[]) {
				for (const { name, value, options } of toSet) {
					req.cookies.set({ name, value, ...(options as CookieOptions) });
					res.cookies.set({ name, value, ...(options as CookieOptions) });
				}
			},
		},
	});
}

/**
 * Returns the currently signed-in user, or null. Server-component safe.
 */
export async function getCurrentUser() {
	const supabase = await createSupabaseServerClient();
	const {
		data: { user },
	} = await supabase.auth.getUser();
	return user ?? null;
}

/**
 * Returns the user only if they are in admin_users. Otherwise null.
 */
export async function getAdminUser() {
	const supabase = await createSupabaseServerClient();
	const {
		data: { user },
	} = await supabase.auth.getUser();
	if (!user) return null;
	const { data: row } = await supabase
		.from("admin_users")
		.select("user_id")
		.eq("user_id", user.id)
		.maybeSingle();
	return row ? user : null;
}
