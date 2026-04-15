create extension if not exists pgcrypto;

create table if not exists public.portal_novelty_launches (
  id text primary key,
  brand text not null default 'Алтея',
  novelty_id text,
  article_key text,
  novelty_name text not null,
  owner_name text,
  marketplace text not null default 'wb',
  launch_plan_month text,
  launch_fact_month text,
  launch_plan_date date,
  launch_fact_date date,
  launch_status text not null default 'not_started',
  current_phase text not null default 'prep',
  risk_flag boolean not null default false,
  blocker text,
  next_step text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_portal_novelty_launches_brand_article on public.portal_novelty_launches (brand, article_key);
create index if not exists idx_portal_novelty_launches_brand_marketplace on public.portal_novelty_launches (brand, marketplace);
create index if not exists idx_portal_novelty_launches_brand_status on public.portal_novelty_launches (brand, launch_status);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_portal_novelty_launches_updated_at on public.portal_novelty_launches;
create trigger trg_portal_novelty_launches_updated_at
before update on public.portal_novelty_launches
for each row execute function public.set_updated_at();

alter table public.portal_novelty_launches enable row level security;

drop policy if exists "portal_novelty_launches_select_authenticated" on public.portal_novelty_launches;
create policy "portal_novelty_launches_select_authenticated"
on public.portal_novelty_launches
for select
to authenticated
using (true);

drop policy if exists "portal_novelty_launches_insert_authenticated" on public.portal_novelty_launches;
create policy "portal_novelty_launches_insert_authenticated"
on public.portal_novelty_launches
for insert
to authenticated
with check (true);

drop policy if exists "portal_novelty_launches_update_authenticated" on public.portal_novelty_launches;
create policy "portal_novelty_launches_update_authenticated"
on public.portal_novelty_launches
for update
to authenticated
using (true)
with check (true);

drop policy if exists "portal_novelty_launches_delete_authenticated" on public.portal_novelty_launches;
create policy "portal_novelty_launches_delete_authenticated"
on public.portal_novelty_launches
for delete
to authenticated
using (true);
