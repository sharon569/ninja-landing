// Magic-link callback. Supabase redirects here with ?code=... after the user
// clicks the link in their email. We exchange the code for a session and set
// auth cookies, then redirect to the intended destination.

import type { APIRoute } from 'astro';
import { createSupabaseServerClient } from '../../../lib/supabase';

export const prerender = false;

export const GET: APIRoute = async ({ url, cookies, request, redirect }) => {
  const code = url.searchParams.get('code');
  const next = url.searchParams.get('next') ?? '/portal/dashboard';
  const error = url.searchParams.get('error_description') ?? url.searchParams.get('error');

  if (error) {
    return redirect(`/portal/login?error=${encodeURIComponent(error)}`);
  }
  if (!code) {
    return redirect('/portal/login?error=missing_code');
  }

  const supabase = createSupabaseServerClient({ cookies, request });
  const { error: exchangeErr } = await supabase.auth.exchangeCodeForSession(code);

  if (exchangeErr) {
    return redirect(`/portal/login?error=${encodeURIComponent(exchangeErr.message)}`);
  }

  // Determine landing — admins go to /portal/admin
  const { data: { user } } = await supabase.auth.getUser();
  if (user && next === '/portal/dashboard') {
    const { data: adminRow } = await supabase
      .from('admin_users')
      .select('user_id')
      .eq('user_id', user.id)
      .maybeSingle();
    if (adminRow) {
      return redirect('/portal/admin');
    }
  }

  return redirect(next);
};
