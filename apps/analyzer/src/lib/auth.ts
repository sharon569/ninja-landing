// Compatibility shim — the analyzer originally had a stand-alone password gate.
// Auth now uses the shared Supabase project (admin_users). See src/lib/supabase.ts.

export { getAdminUser as getSession, getCurrentUser, getAdminUser } from "./supabase";
