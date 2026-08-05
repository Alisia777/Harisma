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

-- Server-side authorization guard shared by snapshots and attachment storage.
create or replace function public.portal_internal_access(p_brand text default 'Алтея')
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  portal_role text := lower(coalesce(auth.jwt() -> 'app_metadata' ->> 'portal_role', ''));
  is_member boolean := false;
begin
  if auth.uid() is null then
    return false;
  end if;

  if portal_role in (
    'owner',
    'director',
    'marketplace',
    'product',
    'designer',
    'operations',
    'employee',
    'readonly'
  ) then
    return true;
  end if;

  if to_regclass('public.portal_design_workspace_members') is not null then
    execute
      'select exists (
         select 1
         from public.portal_design_workspace_members member
         where member.brand = $1
           and member.user_id = $2
       )'
      into is_member
      using p_brand, auth.uid();
  end if;

  return coalesce(is_member, false);
end;
$$;

revoke all on function public.portal_internal_access(text) from public, anon;
grant execute on function public.portal_internal_access(text) to authenticated;

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

revoke all on public.portal_data_snapshots from anon, authenticated;
grant select on public.portal_data_snapshots to authenticated;

drop policy if exists "portal_data_snapshots_select_public" on public.portal_data_snapshots;
drop policy if exists "portal_data_snapshots_insert_public" on public.portal_data_snapshots;
drop policy if exists "portal_data_snapshots_update_public" on public.portal_data_snapshots;
drop policy if exists "portal_data_snapshots_delete_public" on public.portal_data_snapshots;
drop policy if exists "portal_data_snapshots_select_internal" on public.portal_data_snapshots;

create policy "portal_data_snapshots_select_internal"
on public.portal_data_snapshots
for select
to authenticated
using (public.portal_internal_access(brand));

-- Production writes must use a service-role key from GitHub Actions or a
-- trusted backend process. Browser clients receive read-only access after
-- successful authentication and server-side authorization.
