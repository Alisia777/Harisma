-- Portal task attachments setup (table + storage bucket + RLS policies)
-- Run this script in Supabase SQL Editor for the project used by the portal.

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

drop policy if exists "portal_task_attachments_select_public" on public.portal_task_attachments;
create policy "portal_task_attachments_select_public"
on public.portal_task_attachments
for select
to anon, authenticated
using (true);

drop policy if exists "portal_task_attachments_insert_public" on public.portal_task_attachments;
create policy "portal_task_attachments_insert_public"
on public.portal_task_attachments
for insert
to anon, authenticated
with check (true);

drop policy if exists "portal_task_attachments_update_public" on public.portal_task_attachments;
create policy "portal_task_attachments_update_public"
on public.portal_task_attachments
for update
to anon, authenticated
using (true)
with check (true);

drop policy if exists "portal_task_attachments_delete_public" on public.portal_task_attachments;
create policy "portal_task_attachments_delete_public"
on public.portal_task_attachments
for delete
to anon, authenticated
using (true);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'portal-task-files',
  'portal-task-files',
  true,
  20971520,
  array[
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'text/csv',
    'application/csv'
  ]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "portal_task_files_select_public" on storage.objects;
create policy "portal_task_files_select_public"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'portal-task-files');

drop policy if exists "portal_task_files_insert_public" on storage.objects;
create policy "portal_task_files_insert_public"
on storage.objects
for insert
to anon, authenticated
with check (bucket_id = 'portal-task-files');

drop policy if exists "portal_task_files_update_public" on storage.objects;
create policy "portal_task_files_update_public"
on storage.objects
for update
to anon, authenticated
using (bucket_id = 'portal-task-files')
with check (bucket_id = 'portal-task-files');

drop policy if exists "portal_task_files_delete_public" on storage.objects;
create policy "portal_task_files_delete_public"
on storage.objects
for delete
to anon, authenticated
using (bucket_id = 'portal-task-files');
