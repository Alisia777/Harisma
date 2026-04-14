alter table if exists public.portal_product_items
  add column if not exists payload_json jsonb;

alter table if exists public.portal_novelty_cards
  add column if not exists payload_json jsonb;
