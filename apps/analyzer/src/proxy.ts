// Next.js 16 renamed `middleware.ts` → `proxy.ts`. Same functionality.
import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseMiddlewareClient } from "@/lib/supabase";

const PUBLIC_PATHS = new Set(["/login", "/auth/callback", "/auth/signout"]);

export async function proxy(req: NextRequest) {
	const { pathname } = req.nextUrl;
	const res = NextResponse.next({ request: req });

	if (
		PUBLIC_PATHS.has(pathname) ||
		pathname.startsWith("/_next") ||
		pathname.startsWith("/favicon") ||
		pathname.startsWith("/api/cron/") ||
		pathname.startsWith("/api/jobs/")
	) {
		// /api/cron/ and /api/jobs/ paths protect themselves with a CRON_SECRET
		// bearer header, so they bypass the Supabase admin gate.
		return res;
	}

	const supabase = createSupabaseMiddlewareClient(req, res);
	const {
		data: { user },
	} = await supabase.auth.getUser();

	if (!user) {
		const url = req.nextUrl.clone();
		url.pathname = "/login";
		url.searchParams.set("next", pathname + req.nextUrl.search);
		return NextResponse.redirect(url);
	}

	const { data: adminRow } = await supabase
		.from("admin_users")
		.select("user_id")
		.eq("user_id", user.id)
		.maybeSingle();

	if (!adminRow) {
		const url = req.nextUrl.clone();
		url.pathname = "/login";
		url.searchParams.set("error", "not_admin");
		return NextResponse.redirect(url);
	}

	return res;
}

export const config = {
	matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
