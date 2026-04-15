-- Unified schema for Altea portal v8.4


-- ===== supabase_schema.sql =====

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

create table if not exists public.portal_tasks (
  id text primary key,
  brand text not null default 'Алтея',
  article_key text not null,
  title text not null,
  next_action text,
  reason text,
  owner text,
  due date,
  status text not null default 'new',
  type text not null default 'general',
  priority text not null default 'medium',
  platform text not null default 'all',
  source text not null default 'manual',
  entity_label text,
  auto_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.portal_comments (
  id text primary key,
  brand text not null default 'Алтея',
  article_key text not null,
  author text not null,
  team text,
  text text not null,
  type text not null default 'signal',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.portal_decisions (
  id text primary key,
  brand text not null default 'Алтея',
  article_key text not null,
  title text not null,
  decision text not null,
  owner text,
  status text not null default 'waiting_decision',
  due date,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.portal_owner_assignments (
  brand text not null default 'Алтея',
  article_key text not null,
  owner_name text,
  owner_role text,
  note text,
  assigned_by text,
  updated_at timestamptz not null default now(),
  primary key (brand, article_key)
);

create index if not exists idx_portal_tasks_brand_article on public.portal_tasks (brand, article_key);
create index if not exists idx_portal_tasks_brand_status on public.portal_tasks (brand, status);
create index if not exists idx_portal_comments_brand_article on public.portal_comments (brand, article_key);
create index if not exists idx_portal_decisions_brand_article on public.portal_decisions (brand, article_key);
create index if not exists idx_portal_owner_assignments_brand_article on public.portal_owner_assignments (brand, article_key);

drop trigger if exists trg_portal_tasks_updated_at on public.portal_tasks;
create trigger trg_portal_tasks_updated_at
before update on public.portal_tasks
for each row execute function public.set_updated_at();

drop trigger if exists trg_portal_comments_updated_at on public.portal_comments;
create trigger trg_portal_comments_updated_at
before update on public.portal_comments
for each row execute function public.set_updated_at();

drop trigger if exists trg_portal_decisions_updated_at on public.portal_decisions;
create trigger trg_portal_decisions_updated_at
before update on public.portal_decisions
for each row execute function public.set_updated_at();

alter table public.portal_tasks enable row level security;
alter table public.portal_comments enable row level security;
alter table public.portal_decisions enable row level security;
alter table public.portal_owner_assignments enable row level security;

drop policy if exists "portal_tasks_select_authenticated" on public.portal_tasks;
create policy "portal_tasks_select_authenticated"
on public.portal_tasks
for select
to authenticated
using (true);

drop policy if exists "portal_tasks_insert_authenticated" on public.portal_tasks;
create policy "portal_tasks_insert_authenticated"
on public.portal_tasks
for insert
to authenticated
with check (true);

drop policy if exists "portal_tasks_update_authenticated" on public.portal_tasks;
create policy "portal_tasks_update_authenticated"
on public.portal_tasks
for update
to authenticated
using (true)
with check (true);

drop policy if exists "portal_tasks_delete_authenticated" on public.portal_tasks;
create policy "portal_tasks_delete_authenticated"
on public.portal_tasks
for delete
to authenticated
using (true);

drop policy if exists "portal_comments_select_authenticated" on public.portal_comments;
create policy "portal_comments_select_authenticated"
on public.portal_comments
for select
to authenticated
using (true);

drop policy if exists "portal_comments_insert_authenticated" on public.portal_comments;
create policy "portal_comments_insert_authenticated"
on public.portal_comments
for insert
to authenticated
with check (true);

drop policy if exists "portal_comments_update_authenticated" on public.portal_comments;
create policy "portal_comments_update_authenticated"
on public.portal_comments
for update
to authenticated
using (true)
with check (true);

drop policy if exists "portal_comments_delete_authenticated" on public.portal_comments;
create policy "portal_comments_delete_authenticated"
on public.portal_comments
for delete
to authenticated
using (true);

drop policy if exists "portal_decisions_select_authenticated" on public.portal_decisions;
create policy "portal_decisions_select_authenticated"
on public.portal_decisions
for select
to authenticated
using (true);

drop policy if exists "portal_decisions_insert_authenticated" on public.portal_decisions;
create policy "portal_decisions_insert_authenticated"
on public.portal_decisions
for insert
to authenticated
with check (true);

drop policy if exists "portal_decisions_update_authenticated" on public.portal_decisions;
create policy "portal_decisions_update_authenticated"
on public.portal_decisions
for update
to authenticated
using (true)
with check (true);

drop policy if exists "portal_decisions_delete_authenticated" on public.portal_decisions;
create policy "portal_decisions_delete_authenticated"
on public.portal_decisions
for delete
to authenticated
using (true);

drop policy if exists "portal_owner_assignments_select_authenticated" on public.portal_owner_assignments;
create policy "portal_owner_assignments_select_authenticated"
on public.portal_owner_assignments
for select
to authenticated
using (true);

drop policy if exists "portal_owner_assignments_insert_authenticated" on public.portal_owner_assignments;
create policy "portal_owner_assignments_insert_authenticated"
on public.portal_owner_assignments
for insert
to authenticated
with check (true);

drop policy if exists "portal_owner_assignments_update_authenticated" on public.portal_owner_assignments;
create policy "portal_owner_assignments_update_authenticated"
on public.portal_owner_assignments
for update
to authenticated
using (true)
with check (true);

drop policy if exists "portal_owner_assignments_delete_authenticated" on public.portal_owner_assignments;
create policy "portal_owner_assignments_delete_authenticated"
on public.portal_owner_assignments
for delete
to authenticated
using (true);



-- ===== supabase_schema_v76_product.sql =====

create extension if not exists pgcrypto;

create table if not exists public.portal_product_items (
  id text primary key,
  brand text not null default 'Алтея',
  product_code text not null,
  article_key text,
  name text not null,
  category text,
  sub_category text,
  status text not null default 'idea',
  launch_month text,
  target_cost numeric,
  target_price numeric,
  min_price numeric,
  rrp numeric,
  planned_revenue numeric,
  owner text,
  notes text,
  source text not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.portal_novelty_cards (
  id text primary key,
  brand text not null default 'Алтея',
  product_id text,
  product_code text not null,
  name text not null,
  category text,
  launch_month text,
  stage text not null default 'idea',
  status_text text,
  production text,
  target_cost numeric,
  planned_revenue numeric,
  owner text,
  next_step text,
  blockers text,
  source text not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.portal_product_notebook (
  id text primary key,
  brand text not null default 'Алтея',
  entity_type text not null default 'product',
  entity_id text,
  entity_code text,
  title text not null,
  body text,
  next_step text,
  due date,
  status text not null default 'new',
  author text,
  kind text not null default 'action',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_portal_product_items_brand on public.portal_product_items (brand, product_code);
create index if not exists idx_portal_novelty_cards_brand on public.portal_novelty_cards (brand, product_code);
create index if not exists idx_portal_product_notebook_brand on public.portal_product_notebook (brand, entity_code);

drop trigger if exists trg_portal_product_items_updated_at on public.portal_product_items;
create trigger trg_portal_product_items_updated_at
before update on public.portal_product_items
for each row execute function public.set_updated_at();

drop trigger if exists trg_portal_novelty_cards_updated_at on public.portal_novelty_cards;
create trigger trg_portal_novelty_cards_updated_at
before update on public.portal_novelty_cards
for each row execute function public.set_updated_at();

drop trigger if exists trg_portal_product_notebook_updated_at on public.portal_product_notebook;
create trigger trg_portal_product_notebook_updated_at
before update on public.portal_product_notebook
for each row execute function public.set_updated_at();

alter table public.portal_product_items enable row level security;
alter table public.portal_novelty_cards enable row level security;
alter table public.portal_product_notebook enable row level security;

drop policy if exists "portal_product_items_select_authenticated" on public.portal_product_items;
create policy "portal_product_items_select_authenticated"
on public.portal_product_items for select to authenticated using (true);

drop policy if exists "portal_product_items_insert_authenticated" on public.portal_product_items;
create policy "portal_product_items_insert_authenticated"
on public.portal_product_items for insert to authenticated with check (true);

drop policy if exists "portal_product_items_update_authenticated" on public.portal_product_items;
create policy "portal_product_items_update_authenticated"
on public.portal_product_items for update to authenticated using (true) with check (true);

drop policy if exists "portal_product_items_delete_authenticated" on public.portal_product_items;
create policy "portal_product_items_delete_authenticated"
on public.portal_product_items for delete to authenticated using (true);

drop policy if exists "portal_novelty_cards_select_authenticated" on public.portal_novelty_cards;
create policy "portal_novelty_cards_select_authenticated"
on public.portal_novelty_cards for select to authenticated using (true);

drop policy if exists "portal_novelty_cards_insert_authenticated" on public.portal_novelty_cards;
create policy "portal_novelty_cards_insert_authenticated"
on public.portal_novelty_cards for insert to authenticated with check (true);

drop policy if exists "portal_novelty_cards_update_authenticated" on public.portal_novelty_cards;
create policy "portal_novelty_cards_update_authenticated"
on public.portal_novelty_cards for update to authenticated using (true) with check (true);

drop policy if exists "portal_novelty_cards_delete_authenticated" on public.portal_novelty_cards;
create policy "portal_novelty_cards_delete_authenticated"
on public.portal_novelty_cards for delete to authenticated using (true);

drop policy if exists "portal_product_notebook_select_authenticated" on public.portal_product_notebook;
create policy "portal_product_notebook_select_authenticated"
on public.portal_product_notebook for select to authenticated using (true);

drop policy if exists "portal_product_notebook_insert_authenticated" on public.portal_product_notebook;
create policy "portal_product_notebook_insert_authenticated"
on public.portal_product_notebook for insert to authenticated with check (true);

drop policy if exists "portal_product_notebook_update_authenticated" on public.portal_product_notebook;
create policy "portal_product_notebook_update_authenticated"
on public.portal_product_notebook for update to authenticated using (true) with check (true);

drop policy if exists "portal_product_notebook_delete_authenticated" on public.portal_product_notebook;
create policy "portal_product_notebook_delete_authenticated"
on public.portal_product_notebook for delete to authenticated using (true);



-- ===== supabase_schema_v80_product_payload.sql =====

alter table if exists public.portal_product_items
  add column if not exists payload_json jsonb;

alter table if exists public.portal_novelty_cards
  add column if not exists payload_json jsonb;



-- ===== supabase_schema_v82_masha_status_form.sql =====

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



-- ===== supabase_schema_v83_smart_price.sql =====

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
