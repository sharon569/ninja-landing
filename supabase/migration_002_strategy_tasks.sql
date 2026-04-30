-- Migration 002: strategy_tasks
-- Action items per client, visible in the client portal alongside the strategy doc.
-- Run in Supabase SQL editor.

create table if not exists public.strategy_tasks (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  title text not null,
  description text,
  priority text not null default 'normal',     -- 'high' | 'normal' | 'low'
  status text not null default 'open',         -- 'open' | 'in_progress' | 'done'
  due_date date,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  completed_at timestamptz,

  constraint strategy_tasks_priority_chk check (priority in ('high','normal','low')),
  constraint strategy_tasks_status_chk   check (status   in ('open','in_progress','done'))
);

create index if not exists strategy_tasks_client_idx
  on public.strategy_tasks (client_id, status, priority);

alter table public.strategy_tasks enable row level security;

-- Clients see their own tasks; admins see everything
create policy strategy_tasks_select on public.strategy_tasks for select
  using (
    public.is_admin()
    or client_id in (select client_id from public.client_users where user_id = auth.uid())
  );

-- Only admins (Sharon) can mutate
create policy strategy_tasks_admin_write on public.strategy_tasks for all
  using (public.is_admin())
  with check (public.is_admin());
