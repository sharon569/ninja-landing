// Prisma client singleton — survives HMR in dev (Next.js hot-reloads modules,
// which would otherwise spawn a new PrismaClient on every reload and exhaust
// connection pools).
//
// Prisma 7 uses driver adapters: PrismaClient receives an adapter that owns
// the actual DB connection. We use @prisma/adapter-pg pointing at Supabase
// Postgres (pooled connection — port 6543, transaction mode).

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
	throw new Error(
		"DATABASE_URL is not set. See apps/analyzer/.env. Use the Supabase pooled connection string (port 6543, with ?pgbouncer=true)."
	);
}

const globalForPrisma = globalThis as unknown as {
	prisma: PrismaClient | undefined;
};

export const db =
	globalForPrisma.prisma ??
	new PrismaClient({
		adapter: new PrismaPg({ connectionString: databaseUrl }),
	});

if (process.env.NODE_ENV !== "production") {
	globalForPrisma.prisma = db;
}
