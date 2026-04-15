alter table if exists public.portal_price_workbench_entries
  add column if not exists allowed_margin_manual_pct numeric;

create table if not exists public.portal_price_workbench_history (
  id text primary key,
  brand text not null,
  marketplace text not null,
  article_key text not null,
  event_type text not null default 'save',
  old_target_fill_price numeric,
  new_target_fill_price numeric,
  old_target_client_price numeric,
  new_target_client_price numeric,
  old_allowed_margin_pct numeric,
  new_allowed_margin_pct numeric,
  old_decision_status text,
  new_decision_status text,
  reason text,
  comment text,
  changed_by text,
  changed_at timestamptz not null default now()
);

create index if not exists portal_price_workbench_history_brand_idx
  on public.portal_price_workbench_history (brand, marketplace, article_key, changed_at desc);

alter table public.portal_price_workbench_history enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'portal_price_workbench_history'
      and policyname = 'portal_price_workbench_history_select'
  ) then
    create policy portal_price_workbench_history_select
      on public.portal_price_workbench_history
      for select
      to authenticated
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'portal_price_workbench_history'
      and policyname = 'portal_price_workbench_history_insert'
  ) then
    create policy portal_price_workbench_history_insert
      on public.portal_price_workbench_history
      for insert
      to authenticated
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'portal_price_workbench_history'
      and policyname = 'portal_price_workbench_history_update'
  ) then
    create policy portal_price_workbench_history_update
      on public.portal_price_workbench_history
      for update
      to authenticated
      using (true)
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'portal_price_workbench_history'
      and policyname = 'portal_price_workbench_history_delete'
  ) then
    create policy portal_price_workbench_history_delete
      on public.portal_price_workbench_history
      for delete
      to authenticated
      using (true);
  end if;
end $$;
