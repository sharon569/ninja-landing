-- Migration 003: quality_snapshot
-- Daily-ish snapshot of Google Ads quality signals (keyword QS, ad strength, landing page).
-- Run in Supabase SQL editor.

create table if not exists public.quality_snapshot (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  snapshot_date date not null,

  -- Account-level
  optimization_score numeric,             -- 0..1 (Google's account optimization score)

  -- jsonb buckets (flexible, lets us iterate without schema churn)
  keywords jsonb,        -- { avg_qs, qs_distribution, low_qs: [{text, qs, ad_relevance, lp_exp, ctr, campaign}] }
  ads jsonb,             -- { strength_dist, low_strength: [{name, strength, type, campaign}] }
  asset_groups jsonb,    -- PMax: { strength_dist, low_strength: [{ag_id, name, strength, campaign}] }
  landing_page jsonb,    -- { above_average, average, below_average } counts of keywords

  created_at timestamptz default now()
);

create index if not exists quality_snapshot_client_idx
  on public.quality_snapshot (client_id, snapshot_date desc);

alter table public.quality_snapshot enable row level security;

create policy quality_snapshot_select on public.quality_snapshot for select
  using (
    public.is_admin()
    or client_id in (select client_id from public.client_users where user_id = auth.uid())
  );

create policy quality_snapshot_admin_write on public.quality_snapshot for all
  using (public.is_admin())
  with check (public.is_admin());
