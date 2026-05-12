"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase";

export interface LoginState {
	error?: string;
}

export async function signIn(prevState: LoginState | undefined, formData: FormData): Promise<LoginState> {
	const email = String(formData.get("email") ?? "").trim();
	const password = String(formData.get("password") ?? "");
	const next = String(formData.get("next") ?? "/");

	if (!email || !email.includes("@")) {
		return { error: "הזן כתובת אימייל תקינה" };
	}
	if (password.length < 6) {
		return { error: "סיסמה חייבת להיות לפחות 6 תווים" };
	}

	const supabase = await createSupabaseServerClient();
	const { data, error } = await supabase.auth.signInWithPassword({ email, password });
	if (error || !data.user) {
		return { error: friendly(error?.message ?? "שגיאה") };
	}

	const { data: adminRow } = await supabase
		.from("admin_users")
		.select("user_id")
		.eq("user_id", data.user.id)
		.maybeSingle();

	if (!adminRow) {
		await supabase.auth.signOut();
		return { error: "המשתמש הזה אינו אדמין במערכת" };
	}

	redirect(next.startsWith("/") ? next : "/");
}

function friendly(msg: string): string {
	if (/invalid login/i.test(msg)) return "מייל או סיסמה שגויים";
	if (/user not found/i.test(msg)) return "משתמש לא קיים";
	if (/email not confirmed/i.test(msg)) return "המייל עדיין לא אומת";
	return msg;
}
