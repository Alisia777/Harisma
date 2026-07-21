-- Закрытая командная база раздела «Дизайнеры».
-- Выполнить целиком в Supabase SQL Editor от имени владельца проекта.
-- Скрипт идемпотентный: его можно безопасно запускать повторно.

create extension if not exists pgcrypto;

create table if not exists public.portal_design_workspace_members (
  brand text not null default 'Алтея',
  user_id uuid not null references auth.users(id) on delete cascade,
  access_level text not null default 'editor' check (access_level in ('viewer', 'editor')),
  managed_by_role boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (brand, user_id)
);

alter table public.portal_design_workspace_members
  add column if not exists updated_at timestamptz not null default now();
alter table public.portal_design_workspace_members
  add column if not exists managed_by_role boolean not null default false;

create table if not exists public.portal_design_workspaces (
  brand text primary key,
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  payload_hash text not null default '',
  revision bigint not null default 1 check (revision > 0),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

create table if not exists public.portal_design_workspace_history (
  brand text not null references public.portal_design_workspaces(brand) on delete cascade,
  revision bigint not null check (revision > 0),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  payload_hash text not null,
  change_summary text not null default 'Синхронизация рабочей базы',
  changed_at timestamptz not null default now(),
  changed_by uuid references auth.users(id),
  primary key (brand, revision)
);

create table if not exists public.portal_design_workspace_audit (
  id bigint generated always as identity primary key,
  brand text not null references public.portal_design_workspaces(brand) on delete cascade,
  revision bigint not null,
  event_type text not null,
  summary text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  actor_id uuid references auth.users(id),
  actor_email text not null default ''
);

alter table public.portal_design_workspace_audit
  add column if not exists actor_email text not null default '';

create index if not exists portal_design_workspace_history_recent_idx
  on public.portal_design_workspace_history (brand, revision desc);
create index if not exists portal_design_workspace_audit_recent_idx
  on public.portal_design_workspace_audit (brand, created_at desc);

alter table public.portal_design_workspace_members enable row level security;
alter table public.portal_design_workspaces enable row level security;
alter table public.portal_design_workspace_history enable row level security;
alter table public.portal_design_workspace_audit enable row level security;

revoke all on public.portal_design_workspace_members from anon, authenticated;
revoke all on public.portal_design_workspaces from anon, authenticated;
revoke all on public.portal_design_workspace_history from anon, authenticated;
revoke all on public.portal_design_workspace_audit from anon, authenticated;

grant select on public.portal_design_workspace_members to authenticated;
grant select on public.portal_design_workspaces to authenticated;
grant select on public.portal_design_workspace_history to authenticated;
grant select on public.portal_design_workspace_audit to authenticated;

drop policy if exists "design_members_select_self" on public.portal_design_workspace_members;
create policy "design_members_select_self"
on public.portal_design_workspace_members
for select to authenticated
using (user_id = auth.uid());

drop policy if exists "design_workspace_select_member" on public.portal_design_workspaces;
create policy "design_workspace_select_member"
on public.portal_design_workspaces
for select to authenticated
using (
  exists (
    select 1
    from public.portal_design_workspace_members member
    where member.brand = portal_design_workspaces.brand
      and member.user_id = auth.uid()
  )
);

-- Прямые INSERT/UPDATE не выданы роли authenticated. Политики оставлены как
-- дополнительная защита на случай будущего изменения grants.
drop policy if exists "design_workspace_insert_editor" on public.portal_design_workspaces;
create policy "design_workspace_insert_editor"
on public.portal_design_workspaces
for insert to authenticated
with check (
  exists (
    select 1
    from public.portal_design_workspace_members member
    where member.brand = portal_design_workspaces.brand
      and member.user_id = auth.uid()
      and member.access_level = 'editor'
  )
);

drop policy if exists "design_workspace_update_editor" on public.portal_design_workspaces;
create policy "design_workspace_update_editor"
on public.portal_design_workspaces
for update to authenticated
using (
  exists (
    select 1
    from public.portal_design_workspace_members member
    where member.brand = portal_design_workspaces.brand
      and member.user_id = auth.uid()
      and member.access_level = 'editor'
  )
)
with check (
  exists (
    select 1
    from public.portal_design_workspace_members member
    where member.brand = portal_design_workspaces.brand
      and member.user_id = auth.uid()
      and member.access_level = 'editor'
  )
);

drop policy if exists "design_history_select_member" on public.portal_design_workspace_history;
create policy "design_history_select_member"
on public.portal_design_workspace_history
for select to authenticated
using (
  exists (
    select 1
    from public.portal_design_workspace_members member
    where member.brand = portal_design_workspace_history.brand
      and member.user_id = auth.uid()
  )
);

drop policy if exists "design_audit_select_member" on public.portal_design_workspace_audit;
create policy "design_audit_select_member"
on public.portal_design_workspace_audit
for select to authenticated
using (
  exists (
    select 1
    from public.portal_design_workspace_members member
    where member.brand = portal_design_workspace_audit.brand
      and member.user_id = auth.uid()
  )
);

create or replace function public.save_portal_design_workspace(
  p_brand text,
  p_payload jsonb,
  p_payload_hash text,
  p_expected_revision bigint default 0
)
returns table(revision bigint, updated_at timestamptz)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  current_revision bigint;
  current_hash text;
  next_revision bigint;
  calculated_hash text;
  summary_text text;
  created_workspace boolean := false;
begin
  p_brand := btrim(coalesce(p_brand, ''));
  if p_brand = '' or length(p_brand) > 120 then
    raise exception 'invalid_brand' using errcode = '22023';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'invalid_payload' using errcode = '22023';
  end if;
  if octet_length(p_payload::text) > 26214400 then
    raise exception 'payload_too_large' using errcode = '54000';
  end if;
  if auth.uid() is null or not exists (
    select 1
    from public.portal_design_workspace_members member
    where member.brand = p_brand
      and member.user_id = auth.uid()
      and member.access_level = 'editor'
  ) then
    raise exception 'design_workspace_access_denied' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_brand, 0));
  calculated_hash := encode(digest(convert_to(p_payload::text, 'UTF8'), 'sha256'), 'hex');
  summary_text := left(coalesce(p_payload #>> '{activity,0,summary}', 'Синхронизация рабочей базы'), 500);

  select workspace.revision, workspace.payload_hash
    into current_revision, current_hash
  from public.portal_design_workspaces workspace
  where workspace.brand = p_brand
  for update;

  if current_revision is not null and current_hash = calculated_hash then
    return query
      select workspace.revision, workspace.updated_at
      from public.portal_design_workspaces workspace
      where workspace.brand = p_brand;
    return;
  end if;

  if current_revision is null then
    if coalesce(p_expected_revision, 0) <> 0 then
      raise exception 'revision_conflict: expected %, current 0', p_expected_revision using errcode = '40001';
    end if;
    insert into public.portal_design_workspaces (brand, payload, payload_hash, revision, updated_at, updated_by)
    values (p_brand, p_payload, calculated_hash, 1, now(), auth.uid());
    next_revision := 1;
    created_workspace := true;
  else
    if current_revision <> coalesce(p_expected_revision, 0) then
      raise exception 'revision_conflict: expected %, current %', p_expected_revision, current_revision using errcode = '40001';
    end if;

    insert into public.portal_design_workspace_history
      (brand, revision, payload, payload_hash, change_summary, changed_at, changed_by)
    select workspace.brand, workspace.revision, workspace.payload, workspace.payload_hash,
           'Предыдущая сохранённая версия', workspace.updated_at, workspace.updated_by
    from public.portal_design_workspaces workspace
    where workspace.brand = p_brand
    on conflict (brand, revision) do nothing;

    update public.portal_design_workspaces workspace
    set payload = p_payload,
        payload_hash = calculated_hash,
        revision = workspace.revision + 1,
        updated_at = now(),
        updated_by = auth.uid()
    where workspace.brand = p_brand
    returning workspace.revision into next_revision;
  end if;

  insert into public.portal_design_workspace_history
    (brand, revision, payload, payload_hash, change_summary, changed_at, changed_by)
  select workspace.brand, workspace.revision, workspace.payload, workspace.payload_hash,
         summary_text, workspace.updated_at, workspace.updated_by
  from public.portal_design_workspaces workspace
  where workspace.brand = p_brand
  on conflict (brand, revision) do update
    set change_summary = excluded.change_summary,
        changed_at = excluded.changed_at,
        changed_by = excluded.changed_by;

  insert into public.portal_design_workspace_audit
    (brand, revision, event_type, summary, metadata, actor_id, actor_email)
  values (
    p_brand,
    next_revision,
    case when created_workspace then 'workspace.create' else 'workspace.save' end,
    summary_text,
    jsonb_build_object('client_payload_hash', left(coalesce(p_payload_hash, ''), 128), 'server_payload_hash', calculated_hash),
    auth.uid(),
    left(coalesce(auth.jwt() ->> 'email', ''), 254)
  );

  delete from public.portal_design_workspace_history history
  where history.brand = p_brand
    and history.revision in (
      select old.revision
      from public.portal_design_workspace_history old
      where old.brand = p_brand
      order by old.revision desc
      offset 100
    );

  delete from public.portal_design_workspace_audit audit
  where audit.id in (
    select old.id
    from public.portal_design_workspace_audit old
    where old.brand = p_brand
    order by old.created_at desc, old.id desc
    offset 2000
  );

  return query
    select workspace.revision, workspace.updated_at
    from public.portal_design_workspaces workspace
    where workspace.brand = p_brand;
end;
$$;

create or replace function public.restore_portal_design_workspace_revision(
  p_brand text,
  p_revision bigint,
  p_expected_revision bigint
)
returns table(revision bigint, updated_at timestamptz)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  current_revision bigint;
  restored_payload jsonb;
  restored_hash text;
  next_revision bigint;
  summary_text text;
begin
  p_brand := btrim(coalesce(p_brand, ''));
  if auth.uid() is null or not exists (
    select 1
    from public.portal_design_workspace_members member
    where member.brand = p_brand
      and member.user_id = auth.uid()
      and member.access_level = 'editor'
  ) then
    raise exception 'design_workspace_access_denied' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_brand, 0));
  select workspace.revision
    into current_revision
  from public.portal_design_workspaces workspace
  where workspace.brand = p_brand
  for update;

  if current_revision is null then
    raise exception 'workspace_not_found' using errcode = 'P0002';
  end if;
  if current_revision <> coalesce(p_expected_revision, 0) then
    raise exception 'revision_conflict: expected %, current %', p_expected_revision, current_revision using errcode = '40001';
  end if;

  select history.payload, history.payload_hash
    into restored_payload, restored_hash
  from public.portal_design_workspace_history history
  where history.brand = p_brand and history.revision = p_revision;
  if restored_payload is null then
    raise exception 'revision_not_found' using errcode = 'P0002';
  end if;

  insert into public.portal_design_workspace_history
    (brand, revision, payload, payload_hash, change_summary, changed_at, changed_by)
  select workspace.brand, workspace.revision, workspace.payload, workspace.payload_hash,
         'Версия перед восстановлением', workspace.updated_at, workspace.updated_by
  from public.portal_design_workspaces workspace
  where workspace.brand = p_brand
  on conflict (brand, revision) do nothing;

  update public.portal_design_workspaces workspace
  set payload = restored_payload,
      payload_hash = restored_hash,
      revision = workspace.revision + 1,
      updated_at = now(),
      updated_by = auth.uid()
  where workspace.brand = p_brand
  returning workspace.revision into next_revision;

  summary_text := 'Восстановлена версия ' || p_revision::text;
  insert into public.portal_design_workspace_history
    (brand, revision, payload, payload_hash, change_summary, changed_at, changed_by)
  values (p_brand, next_revision, restored_payload, restored_hash, summary_text, now(), auth.uid());

  insert into public.portal_design_workspace_audit
    (brand, revision, event_type, summary, metadata, actor_id, actor_email)
  values (
    p_brand,
    next_revision,
    'workspace.restore',
    summary_text,
    jsonb_build_object('restored_revision', p_revision),
    auth.uid(),
    left(coalesce(auth.jwt() ->> 'email', ''), 254)
  );

  delete from public.portal_design_workspace_history history
  where history.brand = p_brand
    and history.revision in (
      select old.revision
      from public.portal_design_workspace_history old
      where old.brand = p_brand
      order by old.revision desc
      offset 100
    );

  delete from public.portal_design_workspace_audit audit
  where audit.id in (
    select old.id
    from public.portal_design_workspace_audit old
    where old.brand = p_brand
    order by old.created_at desc, old.id desc
    offset 2000
  );

  return query
    select workspace.revision, workspace.updated_at
    from public.portal_design_workspaces workspace
    where workspace.brand = p_brand;
end;
$$;

revoke all on function public.save_portal_design_workspace(text, jsonb, text, bigint) from public, anon;
revoke all on function public.restore_portal_design_workspace_revision(text, bigint, bigint) from public, anon;
grant execute on function public.save_portal_design_workspace(text, jsonb, text, bigint) to authenticated;
grant execute on function public.restore_portal_design_workspace_revision(text, bigint, bigint) to authenticated;

-- Автоматически подключаем только аккаунты с защищённой ролью портала.
-- Allowlist из portal-auth-access.js синхронизируется отдельным GitHub Actions workflow.
-- Владелец и дизайнер получают редактора, остальные роли портала — наблюдателя.
-- user_metadata намеренно не используется: пользователь может менять её самостоятельно.
create or replace function public.sync_portal_design_workspace_member_from_auth()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  portal_role text := lower(coalesce(new.raw_app_meta_data ->> 'portal_role', ''));
begin
  if portal_role in ('owner', 'designer', 'director', 'product', 'marketplace', 'operations', 'employee', 'guest', 'readonly') then
    insert into public.portal_design_workspace_members
      (brand, user_id, access_level, managed_by_role, updated_at)
    values (
      'Алтея',
      new.id,
      case when portal_role in ('owner', 'designer') then 'editor' else 'viewer' end,
      true,
      now()
    )
    on conflict (brand, user_id) do update
    set access_level = excluded.access_level,
        managed_by_role = true,
        updated_at = now()
    where portal_design_workspace_members.managed_by_role = true;
  end if;
  return new;
end;
$$;

revoke all on function public.sync_portal_design_workspace_member_from_auth() from public, anon, authenticated;
drop trigger if exists portal_design_workspace_member_from_auth on auth.users;
create trigger portal_design_workspace_member_from_auth
after insert or update of raw_app_meta_data on auth.users
for each row execute function public.sync_portal_design_workspace_member_from_auth();

-- Подключаем уже существующие аккаунты при первом применении миграции.
insert into public.portal_design_workspace_members (brand, user_id, access_level, managed_by_role, updated_at)
select
  'Алтея',
  account.id,
  case
    when lower(coalesce(account.raw_app_meta_data ->> 'portal_role', '')) in ('owner', 'designer') then 'editor'
    else 'viewer'
  end,
  true,
  now()
from auth.users account
where lower(coalesce(account.raw_app_meta_data ->> 'portal_role', '')) in
  ('owner', 'designer', 'director', 'product', 'marketplace', 'operations', 'employee', 'guest', 'readonly')
on conflict (brand, user_id) do update
set access_level = excluded.access_level,
    managed_by_role = true,
    updated_at = now()
where portal_design_workspace_members.managed_by_role = true;

-- Добавьте участников после создания их аккаунтов в Supabase Auth.
-- Редактор:
-- insert into public.portal_design_workspace_members (brand, user_id, access_level, updated_at)
-- select 'Алтея', id, 'editor', now() from auth.users where email = 'designer@qeep.life'
-- on conflict (brand, user_id) do update set access_level = excluded.access_level, updated_at = now();
--
-- Наблюдатель:
-- insert into public.portal_design_workspace_members (brand, user_id, access_level, updated_at)
-- select 'Алтея', id, 'viewer', now() from auth.users where email = 'director@qeep.life'
-- on conflict (brand, user_id) do update set access_level = excluded.access_level, updated_at = now();
--
-- Проверка после настройки (в SQL Editor):
-- select m.brand, u.email, m.access_level, m.updated_at
-- from public.portal_design_workspace_members m
-- join auth.users u on u.id = m.user_id
-- order by m.brand, u.email;
