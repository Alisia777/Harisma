create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.portal_data_snapshots (
  brand text not null default 'Алтея',
  snapshot_key text not null,
  payload jsonb not null,
  payload_hash text,
  source text,
  generated_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (brand, snapshot_key)
);

create index if not exists idx_portal_data_snapshots_brand on public.portal_data_snapshots (brand);
create index if not exists idx_portal_data_snapshots_updated_at on public.portal_data_snapshots (updated_at desc);

drop trigger if exists trg_portal_data_snapshots_updated_at on public.portal_data_snapshots;
create trigger trg_portal_data_snapshots_updated_at
before update on public.portal_data_snapshots
for each row execute function public.set_updated_at();

alter table public.portal_data_snapshots enable row level security;

drop policy if exists "portal_data_snapshots_select_public" on public.portal_data_snapshots;
create policy "portal_data_snapshots_select_public"
on public.portal_data_snapshots
for select
to anon, authenticated
using (true);

drop policy if exists "portal_data_snapshots_insert_public" on public.portal_data_snapshots;
create policy "portal_data_snapshots_insert_public"
on public.portal_data_snapshots
for insert
to anon, authenticated
with check (true);

drop policy if exists "portal_data_snapshots_update_public" on public.portal_data_snapshots;
create policy "portal_data_snapshots_update_public"
on public.portal_data_snapshots
for update
to anon, authenticated
using (true)
with check (true);
