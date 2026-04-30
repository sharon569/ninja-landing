-- Migration 001 — Add currency_code to clients
-- Run once in Supabase SQL Editor.

alter table public.clients
  add column if not exists currency_code text default 'USD';

-- Set Levizon Market to ILS (and any other ILS account you know about)
update public.clients
set currency_code = 'ILS'
where google_ads_customer_id = '2809250174';
