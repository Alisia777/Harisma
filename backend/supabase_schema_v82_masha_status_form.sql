create table if not exists public.portal_masha_status_updates (
  id text primary key,
  brand text not null,
  marketplace text not null default 'wb',
  article_key text not null,
  article text,
  sku_name text,
  owner_name text,
  owner_login text,
  status_code text not null,
  status_text text,
  risk_flag boolean not null default false,
  risk_level text not null default 'none',
  next_step text,
  comment text,
  due_date date,
  needs_task boolean not null default false,
  priority text,
  root_cause text,
  meeting_type text,
  linked_cluster text,
  linked_warehouse text,
  linked_doc_url text,
  source_name text not null default 'portal_wb_status_form',
  source_type text not null default 'portal_form',
  updated_by text,
  status_date date not null default current_date,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_portal_masha_status_brand_market_article
  on public.portal_masha_status_updates (brand, marketplace, article_key);

create index if not exists idx_portal_masha_status_updated_at
  on public.portal_masha_status_updates (updated_at desc);

create or replace view public.view_portal_masha_status_current as
select distinct on (brand, marketplace, article_key)
  id,
  brand,
  marketplace,
  article_key,
  article,
  sku_name,
  owner_name,
  owner_login,
  status_code,
  status_text,
  risk_flag,
  risk_level,
  next_step,
  comment,
  due_date,
  needs_task,
  priority,
  root_cause,
  meeting_type,
  linked_cluster,
  linked_warehouse,
  linked_doc_url,
  source_name,
  source_type,
  updated_by,
  status_date,
  updated_at,
  created_at
from public.portal_masha_status_updates
order by brand, marketplace, article_key, updated_at desc, created_at desc;

alter table public.portal_masha_status_updates enable row level security;

drop policy if exists portal_masha_status_select_authenticated on public.portal_masha_status_updates;
create policy portal_masha_status_select_authenticated
on public.portal_masha_status_updates
for select
  to authenticated
  using (true);

drop policy if exists portal_masha_status_insert_authenticated on public.portal_masha_status_updates;
create policy portal_masha_status_insert_authenticated
on public.portal_masha_status_updates
for insert
  to authenticated
  with check (true);

drop policy if exists portal_masha_status_update_authenticated on public.portal_masha_status_updates;
create policy portal_masha_status_update_authenticated
on public.portal_masha_status_updates
for update
  to authenticated
  using (true)
  with check (true);

drop policy if exists portal_masha_status_delete_authenticated on public.portal_masha_status_updates;
create policy portal_masha_status_delete_authenticated
on public.portal_masha_status_updates
for delete
  to authenticated
  using (true);
