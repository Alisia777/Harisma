-- EMERGENCY LOCKDOWN — 2026-08-05
-- Apply once in the production Supabase SQL Editor.
-- Purpose:
--   1) remove all anonymous access to portal snapshots and attachments;
--   2) make portal-task-files private;
--   3) allow only authenticated internal portal users;
--   4) keep service-role production jobs working.
--
-- This script is idempotent and can be run repeatedly.

begin;

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

-- Portal snapshots: no anonymous reads. Browser clients are read-only and
-- must be authenticated + authorized. Service role keeps bypassing RLS.
do $$
begin
  if to_regclass('public.portal_data_snapshots') is not null then
    execute 'alter table public.portal_data_snapshots enable row level security';
    execute 'revoke all on public.portal_data_snapshots from anon, authenticated';
    execute 'grant select on public.portal_data_snapshots to authenticated';

    execute 'drop policy if exists "portal_data_snapshots_select_public" on public.portal_data_snapshots';
    execute 'drop policy if exists "portal_data_snapshots_insert_public" on public.portal_data_snapshots';
    execute 'drop policy if exists "portal_data_snapshots_update_public" on public.portal_data_snapshots';
    execute 'drop policy if exists "portal_data_snapshots_delete_public" on public.portal_data_snapshots';
    execute 'drop policy if exists "portal_data_snapshots_select_internal" on public.portal_data_snapshots';

    execute $policy$
      create policy "portal_data_snapshots_select_internal"
      on public.portal_data_snapshots
      for select
      to authenticated
      using (public.portal_internal_access(brand))
    $policy$;
  end if;
end;
$$;

-- Attachment metadata: no anonymous read/write/update/delete.
do $$
begin
  if to_regclass('public.portal_task_attachments') is not null then
    execute 'alter table public.portal_task_attachments enable row level security';
    execute 'revoke all on public.portal_task_attachments from anon, authenticated';
    execute 'grant select, insert, update, delete on public.portal_task_attachments to authenticated';

    execute 'drop policy if exists "portal_task_attachments_select_public" on public.portal_task_attachments';
    execute 'drop policy if exists "portal_task_attachments_insert_public" on public.portal_task_attachments';
    execute 'drop policy if exists "portal_task_attachments_update_public" on public.portal_task_attachments';
    execute 'drop policy if exists "portal_task_attachments_delete_public" on public.portal_task_attachments';
    execute 'drop policy if exists "portal_task_attachments_select_internal" on public.portal_task_attachments';
    execute 'drop policy if exists "portal_task_attachments_insert_internal" on public.portal_task_attachments';
    execute 'drop policy if exists "portal_task_attachments_update_internal" on public.portal_task_attachments';
    execute 'drop policy if exists "portal_task_attachments_delete_internal" on public.portal_task_attachments';

    execute $policy$
      create policy "portal_task_attachments_select_internal"
      on public.portal_task_attachments
      for select to authenticated
      using (public.portal_internal_access(brand))
    $policy$;

    execute $policy$
      create policy "portal_task_attachments_insert_internal"
      on public.portal_task_attachments
      for insert to authenticated
      with check (
        public.portal_internal_access(brand)
        and bucket_name = 'portal-task-files'
        and length(object_path) between 1 and 900
      )
    $policy$;

    execute $policy$
      create policy "portal_task_attachments_update_internal"
      on public.portal_task_attachments
      for update to authenticated
      using (public.portal_internal_access(brand))
      with check (
        public.portal_internal_access(brand)
        and bucket_name = 'portal-task-files'
        and length(object_path) between 1 and 900
      )
    $policy$;

    execute $policy$
      create policy "portal_task_attachments_delete_internal"
      on public.portal_task_attachments
      for delete to authenticated
      using (public.portal_internal_access(brand))
    $policy$;
  end if;
end;
$$;

-- Storage bucket: private plus authenticated RLS only.
update storage.buckets
set public = false
where id = 'portal-task-files';

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

commit;

-- Verification: expected public=false and no role list containing anon.
select id, name, public, file_size_limit
from storage.buckets
where id = 'portal-task-files';

select schemaname, tablename, policyname, roles, cmd
from pg_policies
where (schemaname = 'public' and tablename in ('portal_data_snapshots', 'portal_task_attachments'))
   or (schemaname = 'storage' and tablename = 'objects' and policyname like 'portal_task_files_%')
order by schemaname, tablename, policyname;
