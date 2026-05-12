export function ShurikenMark({ size = 32, glow = true }: { size?: number; glow?: boolean }) {
	const id = `shuriken-${Math.random().toString(36).slice(2, 8)}`;
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 64 64"
			xmlns="http://www.w3.org/2000/svg"
			aria-hidden="true"
			style={glow ? { filter: "drop-shadow(0 0 12px rgba(255,42,60,0.45))" } : undefined}
		>
			<defs>
				<linearGradient id={id} x1="0" x2="1" y1="0" y2="1">
					<stop offset="0" stopColor="#ff2a3c" />
					<stop offset="1" stopColor="#8b0000" />
				</linearGradient>
			</defs>
			<path
				d="M32 4 L38 26 L60 32 L38 38 L32 60 L26 38 L4 32 L26 26 Z"
				fill={`url(#${id})`}
				stroke="#ffd166"
				strokeWidth="1.5"
			/>
			<circle cx="32" cy="32" r="4" fill="#0a0a0a" stroke="#ffd166" strokeWidth="1" />
		</svg>
	);
}

export function NinjaWordmark({ height = 28 }: { height?: number }) {
	return (
		<div className="flex items-baseline gap-1" style={{ direction: "ltr" }}>
			<span
				className="font-display"
				style={{
					fontSize: height,
					lineHeight: 1,
					letterSpacing: "0.12em",
					background: "linear-gradient(135deg, #ffffff, #ffd166)",
					WebkitBackgroundClip: "text",
					backgroundClip: "text",
					color: "transparent",
				}}
			>
				NINJA
			</span>
		</div>
	);
}
