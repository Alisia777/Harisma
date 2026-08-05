-- Portal task attachments setup (private bucket + authenticated RLS)
-- Run this script in Supabase SQL Editor for the project used by the portal.
-- Safe to run repeatedly.

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

-- Server-side authorization guard. Client-side allowlists are not security.
-- Access is granted only to authenticated users with protected app_metadata
-- or an explicit membership in the closed Designers workspace.
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

create table if not exists public.portal_task_attachments (
  id text primary key,
  brand text not null,
  task_id text not null,
  article_key text not null default '',
  file_name text not null,
  mime_type text not null default '',
  file_size bigint not null default 0 check (file_size >= 0),
  bucket_name text not null default 'portal-task-files',
  object_path text not null,
  public_url text not null default '',
  created_at timestamptz not null default now(),
  created_by text not null default '',
  updated_at timestamptz not null default now()
);

create index if not exists idx_portal_task_attachments_brand on public.portal_task_attachments (brand);
create index if not exists idx_portal_task_attachments_task on public.portal_task_attachments (task_id);
create index if not exists idx_portal_task_attachments_article on public.portal_task_attachments (article_key);
create index if not exists idx_portal_task_attachments_created_at on public.portal_task_attachments (created_at desc);
create unique index if not exists idx_portal_task_attachments_object_path on public.portal_task_attachments (bucket_name, object_path);

drop trigger if exists trg_portal_task_attachments_updated_at on public.portal_task_attachments;
create trigger trg_portal_task_attachments_updated_at
before update on public.portal_task_attachments
for each row execute function public.set_updated_at();

alter table public.portal_task_attachments enable row level security;

revoke all on public.portal_task_attachments from anon, authenticated;
grant select, insert, update, delete on public.portal_task_attachments to authenticated;

drop policy if exists "portal_task_attachments_select_public" on public.portal_task_attachments;
drop policy if exists "portal_task_attachments_insert_public" on public.portal_task_attachments;
drop policy if exists "portal_task_attachments_update_public" on public.portal_task_attachments;
drop policy if exists "portal_task_attachments_delete_public" on public.portal_task_attachments;
drop policy if exists "portal_task_attachments_select_internal" on public.portal_task_attachments;
drop policy if exists "portal_task_attachments_insert_internal" on public.portal_task_attachments;
drop policy if exists "portal_task_attachments_update_internal" on public.portal_task_attachments;
drop policy if exists "portal_task_attachments_delete_internal" on public.portal_task_attachments;

create policy "portal_task_attachments_select_internal"
on public.portal_task_attachments
for select
to authenticated
using (public.portal_internal_access(brand));

create policy "portal_task_attachments_insert_internal"
on public.portal_task_attachments
for insert
to authenticated
with check (
  public.portal_internal_access(brand)
  and bucket_name = 'portal-task-files'
  and length(object_path) between 1 and 900
);

create policy "portal_task_attachments_update_internal"
on public.portal_task_attachments
for update
to authenticated
using (public.portal_internal_access(brand))
with check (
  public.portal_internal_access(brand)
  and bucket_name = 'portal-task-files'
  and length(object_path) between 1 and 900
);

create policy "portal_task_attachments_delete_internal"
on public.portal_task_attachments
for delete
to authenticated
using (public.portal_internal_access(brand));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'portal-task-files',
  'portal-task-files',
  false,
  20971520,
  array[
    'image/png',
    'image/jpeg',
    'image/webp',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/zip',
    'application/x-zip-compressed',
    'application/postscript',
    'image/vnd.adobe.photoshop',
    'application/octet-stream',
    'text/csv',
    'application/csv'
  ]
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "portal_task_files_select_public" on storage.objects;
drop policy if exists "portal_task_files_insert_public" on storage.objects;
drop policy if exists "portal_task_files_update_public" on storage.objects;
drop policy if exists "portal_task_files_delete_public" on storage.objects;
drop policy if exists "portal_task_files_select_internal" on storage.objects;
drop policy if exists "portal_task_files_insert_internal" on storage.objects;
drop policy if exists "portal_task_files_update_internal" on storage.objects;
drop policy if exists "portal_task_files_delete_internal" on storage.objects;

create policy "portal_task_files_select_internal"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'portal-task-files'
  and public.portal_internal_access('Алтея')
);

create policy "portal_task_files_insert_internal"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'portal-task-files'
  and public.portal_internal_access('Алтея')
  and length(name) between 1 and 900
);

create policy "portal_task_files_update_internal"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'portal-task-files'
  and public.portal_internal_access('Алтея')
)
with check (
  bucket_id = 'portal-task-files'
  and public.portal_internal_access('Алтея')
  and length(name) between 1 and 900
);

create policy "portal_task_files_delete_internal"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'portal-task-files'
  and public.portal_internal_access('Алтея')
);
