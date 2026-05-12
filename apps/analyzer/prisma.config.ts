// Prisma 7 moved the datasource URL out of schema.prisma — it now lives here.
//
// We use TWO URLs against Supabase Postgres:
//   DATABASE_URL  — pooled connection (port 6543, ?pgbouncer=true) for the app at runtime.
//   DIRECT_URL    — direct connection (port 5432) for migrations / introspection only.
//
// Without DIRECT_URL, `prisma migrate` would fail because pgbouncer can't carry
// DDL transactions reliably.

import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
	schema: "prisma/schema.prisma",
	migrations: {
		path: "prisma/migrations",
	},
	datasource: {
		url: process.env["DIRECT_URL"] ?? process.env["DATABASE_URL"],
	},
});
