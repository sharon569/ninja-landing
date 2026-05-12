import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase";

export async function POST(req: Request) {
	const supabase = await createSupabaseServerClient();
	await supabase.auth.signOut();
	return NextResponse.redirect(new URL("/login", req.url));
}
