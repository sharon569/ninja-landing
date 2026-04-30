// Astro middleware — gates /portal/* routes behind Supabase auth.
// Runs on every request before the page renders.

import { defineMiddleware } from 'astro:middleware';
import { createSupabaseServerClient } from './lib/supabase';

const PUBLIC_PORTAL_ROUTES = new Set([
  '/portal/login',
  '/portal/auth/callback',
  '/portal/auth/signout',
]);

export const onRequest = defineMiddleware(async (context, next) => {
  const url = new URL(context.request.url);
  const path = url.pathname;

  // Only gate /portal/*
  if (!path.startsWith('/portal')) {
    return next();
  }

  // Public portal routes (login, auth callback) — no gate
  if (PUBLIC_PORTAL_ROUTES.has(path)) {
    return next();
  }

  // Authenticated routes — verify session
  const supabase = createSupabaseServerClient({
    cookies: context.cookies,
    request: context.request,
  });
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    // Not signed in — bounce to login, preserving intended destination
    const next_param = encodeURIComponent(path + url.search);
    return context.redirect(`/portal/login?next=${next_param}`);
  }

  // Make user available to all downstream pages via Astro.locals
  context.locals.user = user;
  context.locals.supabase = supabase;

  // Admin gate for /portal/admin/*
  if (path.startsWith('/portal/admin')) {
    const { data: adminRow } = await supabase
      .from('admin_users')
      .select('user_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!adminRow) {
      return context.redirect('/portal/dashboard');
    }
    context.locals.isAdmin = true;
  }

  return next();
});
