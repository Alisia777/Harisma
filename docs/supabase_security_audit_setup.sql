-- Portal security audit setup (table + RPC writer + auth.users trigger)
-- Run this script in Supabase SQL Editor for the project used by the portal.
--
-- The browser and node sync scripts write events through public.portal_audit_write().
-- Direct table reads/writes are not granted to anon/authenticated clients.

create extension if not exists pgcrypto;

create table if not exists public.portal_security_audit_events (
  id uuid primary key default gen_random_uuid(),
  event_id text not null default encode(gen_random_bytes(16), 'hex'),
  brand text not null default 'Алтея',
  event_type text not null,
  outcome text not null default 'ok',
  severity text not null default 'info',
  occurred_at timestamptz not null default now(),
  received_at timestamptz not null default now(),
  source text not null default 'portal',
  actor_user_id uuid,
  actor_email text not null default '',
  actor_role text not null default '',
  session_id text not null default '',
  target_type text not null default '',
  target_id text not null default '',
  target_name text not null default '',
  ip_address inet,
  user_agent text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  constraint portal_security_audit_event_type_chk check (event_type ~ '^[a-z0-9_.:-]{2,80}$'),
  constraint portal_security_audit_outcome_chk check (outcome in ('ok', 'failure', 'denied', 'warning', 'unknown')),
  constraint portal_security_audit_severity_chk check (severity in ('debug', 'info', 'notice', 'warning', 'error', 'critical'))
);

create index if not exists idx_portal_security_audit_received_at
on public.portal_security_audit_events (received_at desc);

create index if not exists idx_portal_security_audit_event_type
on public.portal_security_audit_events (event_type, received_at desc);

create index if not exists idx_portal_security_audit_actor_email
on public.portal_security_audit_events (actor_email, received_at desc);

create index if not exists idx_portal_security_audit_target
on public.portal_security_audit_events (target_type, target_name, received_at desc);

alter table public.portal_security_audit_events enable row level security;
revoke all on public.portal_security_audit_events from anon, authenticated;

create or replace function public.portal_audit_header_text(header_name text)
returns text
language plpgsql
stable
as $$
declare
  headers jsonb := '{}'::jsonb;
  raw_headers text;
  normalized_name text := lower(coalesce(header_name, ''));
begin
  raw_headers := current_setting('request.headers', true);
  if raw_headers is not null and raw_headers <> '' then
    begin
      headers := raw_headers::jsonb;
    exception when others then
      headers := '{}'::jsonb;
    end;
  end if;

  return coalesce(headers ->> normalized_name, headers ->> header_name, '');
end;
$$;

create or replace function public.portal_audit_request_ip()
returns inet
language plpgsql
stable
as $$
declare
  raw_ip text;
begin
  raw_ip := split_part(coalesce(
    nullif(public.portal_audit_header_text('cf-connecting-ip'), ''),
    nullif(public.portal_audit_header_text('x-real-ip'), ''),
    nullif(public.portal_audit_header_text('x-forwarded-for'), '')
  ), ',', 1);

  raw_ip := nullif(trim(raw_ip), '');
  if raw_ip is null then
    return null;
  end if;

  return raw_ip::inet;
exception when others then
  return null;
end;
$$;

create or replace function public.portal_audit_clean_text(value text, max_length integer default 500)
returns text
language sql
immutable
as $$
  select left(regexp_replace(coalesce(value, ''), '[[:cntrl:]]+', ' ', 'g'), greatest(1, coalesce(max_length, 500)));
$$;

create or replace function public.portal_audit_write(
  p_event_type text,
  p_outcome text default 'ok',
  p_severity text default 'info',
  p_actor_email text default '',
  p_actor_role text default '',
  p_source text default 'portal',
  p_session_id text default '',
  p_target_type text default '',
  p_target_id text default '',
  p_target_name text default '',
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_id uuid;
  v_event_type text := lower(public.portal_audit_clean_text(p_event_type, 80));
  v_outcome text := lower(public.portal_audit_clean_text(p_outcome, 24));
  v_severity text := lower(public.portal_audit_clean_text(p_severity, 24));
  v_jwt_email text := nullif(auth.jwt() ->> 'email', '');
  v_actor_email text;
  v_metadata jsonb := coalesce(p_metadata, '{}'::jsonb);
begin
  if v_event_type !~ '^[a-z0-9_.:-]{2,80}$' then
    raise exception 'Invalid audit event type';
  end if;

  if v_outcome not in ('ok', 'failure', 'denied', 'warning', 'unknown') then
    v_outcome := 'unknown';
  end if;

  if v_severity not in ('debug', 'info', 'notice', 'warning', 'error', 'critical') then
    v_severity := 'info';
  end if;

  if pg_column_size(v_metadata) > 12000 then
    v_metadata := jsonb_build_object('truncated', true, 'originalBytes', pg_column_size(v_metadata));
  end if;

  v_actor_email := lower(public.portal_audit_clean_text(coalesce(v_jwt_email, nullif(p_actor_email, ''), ''), 254));

  insert into public.portal_security_audit_events (
    event_type,
    outcome,
    severity,
    source,
    actor_user_id,
    actor_email,
    actor_role,
    session_id,
    target_type,
    target_id,
    target_name,
    ip_address,
    user_agent,
    metadata
  )
  values (
    v_event_type,
    v_outcome,
    v_severity,
    public.portal_audit_clean_text(p_source, 80),
    auth.uid(),
    v_actor_email,
    public.portal_audit_clean_text(coalesce(nullif(p_actor_role, ''), auth.jwt() ->> 'role', ''), 120),
    public.portal_audit_clean_text(p_session_id, 120),
    public.portal_audit_clean_text(p_target_type, 80),
    public.portal_audit_clean_text(p_target_id, 200),
    public.portal_audit_clean_text(p_target_name, 240),
    public.portal_audit_request_ip(),
    public.portal_audit_clean_text(public.portal_audit_header_text('user-agent'), 500),
    v_metadata
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.portal_audit_write(text, text, text, text, text, text, text, text, text, text, jsonb) from public;
grant execute on function public.portal_audit_write(text, text, text, text, text, text, text, text, text, text, jsonb) to anon, authenticated;

create or replace function public.portal_audit_auth_user_changes()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_event_type text;
  v_email text;
  v_metadata jsonb;
begin
  if tg_op = 'INSERT' then
    if nullif(new.email, '') is null then
      return new;
    end if;

    v_event_type := 'user_created';
    v_email := new.email;
    v_metadata := jsonb_build_object(
      'userId', new.id,
      'emailConfirmed', new.email_confirmed_at is not null,
      'appMetadata', coalesce(new.raw_app_meta_data, '{}'::jsonb),
      'userMetadata', coalesce(new.raw_user_meta_data, '{}'::jsonb)
    );
  elsif tg_op = 'UPDATE' then
    if nullif(new.email, '') is null then
      return new;
    end if;

    if old.email is not distinct from new.email
      and old.phone is not distinct from new.phone
      and old.banned_until is not distinct from new.banned_until
      and old.raw_app_meta_data is not distinct from new.raw_app_meta_data
      and old.raw_user_meta_data is not distinct from new.raw_user_meta_data then
      return new;
    end if;

    v_event_type := 'user_updated';
    v_email := new.email;
    v_metadata := jsonb_build_object(
      'userId', new.id,
      'oldEmail', old.email,
      'newEmail', new.email,
      'appMetadataChanged', old.raw_app_meta_data is distinct from new.raw_app_meta_data,
      'userMetadataChanged', old.raw_user_meta_data is distinct from new.raw_user_meta_data,
      'bannedUntil', new.banned_until
    );
  elsif tg_op = 'DELETE' then
    if nullif(old.email, '') is null then
      return old;
    end if;

    v_event_type := 'user_deleted';
    v_email := old.email;
    v_metadata := jsonb_build_object('userId', old.id);
  end if;

  insert into public.portal_security_audit_events (
    event_type,
    outcome,
    severity,
    source,
    actor_email,
    target_type,
    target_id,
    target_name,
    metadata
  )
  values (
    v_event_type,
    'ok',
    case when v_event_type = 'user_deleted' then 'warning' else 'notice' end,
    'supabase-auth-trigger',
    '',
    'auth_user',
    coalesce((v_metadata ->> 'userId'), ''),
    lower(v_email),
    v_metadata
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_portal_audit_auth_user_changes on auth.users;
create trigger trg_portal_audit_auth_user_changes
after insert or update or delete on auth.users
for each row execute function public.portal_audit_auth_user_changes();

create or replace view public.portal_security_audit_wazuh as
select
  received_at as timestamp,
  jsonb_build_object(
    'integration', 'altea-portal',
    'event_id', event_id,
    'event_type', event_type,
    'outcome', outcome,
    'severity', severity,
    'source', source,
    'actor_email', actor_email,
    'actor_user_id', actor_user_id,
    'actor_role', actor_role,
    'target_type', target_type,
    'target_id', target_id,
    'target_name', target_name,
    'srcip', coalesce(ip_address::text, ''),
    'user_agent', user_agent,
    'metadata', metadata,
    'received_at', received_at,
    'occurred_at', occurred_at
  ) as event
from public.portal_security_audit_events;

revoke all on public.portal_security_audit_wazuh from anon, authenticated;
