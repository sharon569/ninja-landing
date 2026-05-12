import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
	// Silence the multi-lockfile warning — analyzer lives inside ninja-landing monorepo.
	turbopack: {
		root: path.resolve(__dirname),
	},
};

export default nextConfig;
