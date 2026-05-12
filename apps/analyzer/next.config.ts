import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	// On Vercel, the monorepo detection sets `outputFileTracingRoot` to the
	// repo root. Setting `turbopack.root` here as well caused a "they must
	// have the same value" warning. Leaving Turbopack to infer the root is fine
	// — Next.js does the right thing both locally and on Vercel.
};

export default nextConfig;
