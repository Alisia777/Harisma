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
