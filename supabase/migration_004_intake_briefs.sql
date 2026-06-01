-- Migration 004: intake_briefs
-- Stores the "האוזן" website intake brief submitted at /brief/haozen.
-- Run in Supabase SQL editor.

create table if not exists public.intake_briefs (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  business_name text not null,
  contact_name  text not null,
  phone         text not null,
  email         text,
  answers       jsonb not null default '{}'::jsonb,
  source        text default 'brief/haozen',
  ip            text,
  status        text default 'new'   -- new | reviewed | in_progress | done
);

create index if not exists intake_briefs_created_idx
  on public.intake_briefs (created_at desc);

alter table public.intake_briefs enable row level security;

-- Reads: admins only. Writes: via service-role only (bypasses RLS), so no insert policy.
create policy intake_briefs_admin_select on public.intake_briefs for select
  using (public.is_admin());
