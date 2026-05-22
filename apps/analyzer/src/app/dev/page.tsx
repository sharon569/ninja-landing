import { Wrench } from "lucide-react";
import DevPanel from "./DevPanel";

export const dynamic = "force-dynamic";

export default function DevPage() {
	return (
		<div>
			<div className="mb-8">
				<div className="flex items-center gap-3 mb-2">
					<Wrench className="w-6 h-6 text-gold" />
					<h1 className="text-2xl font-bold text-ink">Dev Panel</h1>
				</div>
				<p className="text-sm text-ink-mute">
					Test page for Phase 0+ features. Uses a dedicated test client — no real client data is touched.
				</p>
			</div>

			<DevPanel />

			<style>{`
				.dev-btn {
					padding: 6px 14px;
					border-radius: 6px;
					font-size: 12px;
					font-weight: 500;
					background: rgba(255,255,255,0.06);
					color: #ccc;
					border: 1px solid rgba(255,255,255,0.1);
					cursor: pointer;
					transition: all 0.15s;
				}
				.dev-btn:hover { background: rgba(255,255,255,0.1); color: #fff; }
				.dev-btn:disabled { opacity: 0.4; cursor: not-allowed; }
				.dev-btn-blue { background: rgba(59,130,246,0.15); color: #60a5fa; border-color: rgba(59,130,246,0.3); }
				.dev-btn-blue:hover { background: rgba(59,130,246,0.25); }
				.dev-btn-green { background: rgba(46,230,133,0.15); color: #2ee685; border-color: rgba(46,230,133,0.3); }
				.dev-btn-green:hover { background: rgba(46,230,133,0.25); }
				.dev-btn-gold { background: rgba(255,209,102,0.15); color: #ffd166; border-color: rgba(255,209,102,0.3); }
				.dev-btn-gold:hover { background: rgba(255,209,102,0.25); }
			`}</style>
		</div>
	);
}
