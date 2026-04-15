create table if not exists public.portal_price_workbench_entries (
  id text primary key,
  brand text not null,
  marketplace text not null,
  article_key text not null,
  decision_status text not null default 'draft',
  target_fill_price numeric,
  target_client_price numeric,
  reason text,
  owner_name text,
  due_date date,
  needs_task boolean not null default false,
  escalation text not null default 'none',
  comment text,
  updated_by text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists portal_price_workbench_entries_brand_idx
  on public.portal_price_workbench_entries (brand, marketplace, article_key);

alter table public.portal_price_workbench_entries enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'portal_price_workbench_entries'
      and policyname = 'portal_price_workbench_entries_select'
  ) then
    create policy portal_price_workbench_entries_select
      on public.portal_price_workbench_entries
      for select
      to authenticated
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'portal_price_workbench_entries'
      and policyname = 'portal_price_workbench_entries_insert'
  ) then
    create policy portal_price_workbench_entries_insert
      on public.portal_price_workbench_entries
      for insert
      to authenticated
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'portal_price_workbench_entries'
      and policyname = 'portal_price_workbench_entries_update'
  ) then
    create policy portal_price_workbench_entries_update
      on public.portal_price_workbench_entries
      for update
      to authenticated
      using (true)
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'portal_price_workbench_entries'
      and policyname = 'portal_price_workbench_entries_delete'
  ) then
    create policy portal_price_workbench_entries_delete
      on public.portal_price_workbench_entries
      for delete
      to authenticated
      using (true);
  end if;
end $$;
