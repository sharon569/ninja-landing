"use client";

import { LogOut } from "lucide-react";

export function LogoutButton() {
	return (
		<form action="/auth/signout" method="post" className="inline-flex">
			<button
				type="submit"
				className="inline-flex items-center justify-center w-8 h-8 rounded-md text-ink-mute hover:text-blade hover:bg-blade/10 transition-colors"
				title="התנתקות"
				aria-label="התנתקות"
			>
				<LogOut className="w-4 h-4" />
			</button>
		</form>
	);
}
