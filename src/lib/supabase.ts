// Supabase clients for Astro server + browser.
// Server client uses parseCookieHeader to read the request Cookie header.

import {
  createBrowserClient,
  createServerClient,
  parseCookieHeader,
  type CookieOptions,
} from '@supabase/ssr';
import type { AstroCookies } from 'astro';

const SUPABASE_URL = import.meta.env.PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = import.meta.env.PUBLIC_SUPABASE_ANON_KEY!;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    'Missing PUBLIC_SUPABASE_URL or PUBLIC_SUPABASE_ANON_KEY env vars. ' +
    'Copy .env.example → .env and fill in.'
  );
}

interface ServerCtx {
  cookies: AstroCookies;
  request: Request;
}

/**
 * Server client for Astro pages / API routes.
 *
 * Usage in a .astro page:
 *   const supabase = createSupabaseServerClient(Astro);
 *   const { data: { user } } = await supabase.auth.getUser();
 *
 * Usage in an API route:
 *   const supabase = createSupabaseServerClient({ cookies, request });
 */
export function createSupabaseServerClient(ctx: ServerCtx) {
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        const header = ctx.request.headers.get('Cookie') ?? '';
        return parseCookieHeader(header).map(({ name, value }) => ({
          name,
          value: value ?? '',
        }));
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          ctx.cookies.set(name, value, options as CookieOptions);
        });
      },
    },
  });
}

/**
 * Browser client for client-side <script type="module"> blocks.
 */
export function createSupabaseBrowserClient() {
  return createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}
