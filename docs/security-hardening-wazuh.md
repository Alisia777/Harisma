# Security hardening and Wazuh handoff

Дата подготовки: 2026-06-19.

## Что уже логируется

После применения `docs/supabase_security_audit_setup.sql` портал пишет события в `public.portal_security_audit_events`:

- `login_success`: сотрудник вошел в портал.
- `login_failed`: неверная почта/пароль.
- `login_trapped`: сработал скрытый honeypot-поле на форме входа.
- `access_denied`: пользователь прошел Supabase Auth, но не прошел allowlist/role gate портала.
- `session_restored`: сотрудник открыл портал с уже сохраненной сессией.
- `logout`: сотрудник вышел.
- `mfa_challenge`, `mfa_verified`, `mfa_failed`, `mfa_missing`: события второго фактора, если у пользователя уже есть TOTP в Supabase.
- `user_created`, `user_updated`, `user_deleted`: изменения в `auth.users`.
- `api_connected`: node-синк увидел настроенные marketplace API.
- `api_sync_finished`: node-синк завершился успешно/с ошибкой.

В события не пишутся пароли, access/refresh tokens, API keys и Authorization-заголовки.

## Supabase setup

1. Открыть Supabase SQL Editor проекта портала.
2. Выполнить целиком `docs/supabase_security_audit_setup.sql`.
3. Проверить, что функция доступна:

```sql
select public.portal_audit_write(
  'manual_check',
  'ok',
  'info',
  'admin@example.com',
  'owner',
  'sql-editor',
  '',
  'security_audit',
  '',
  'setup',
  '{"note":"initial check"}'::jsonb
);
```

4. Проверить последнюю запись:

```sql
select received_at, event_type, outcome, actor_email, target_name
from public.portal_security_audit_events
order by received_at desc
limit 5;
```

## Wazuh export

На машине, где будет Wazuh agent или cron/Task Scheduler, нужен service role key Supabase. Не класть его в репозиторий.

Пример разовой выгрузки NDJSON:

```powershell
$env:ALTEA_SUPABASE_URL="https://iyckwryrucqrxwlowxow.supabase.co"
$env:ALTEA_SUPABASE_SERVICE_ROLE_KEY="<service-role-key>"
node scripts/portal-security-audit-export.js --since "2026-06-19T00:00:00Z" --out "C:\ProgramData\wazuh-agent\altea-portal-audit.ndjson"
```

Для регулярной выгрузки лучше хранить last cursor снаружи или вызывать скрипт раз в 1-5 минут с небольшим перекрытием времени, а в Wazuh включить dedupe по `event_id`.

Формат строки NDJSON:

```json
{"integration":"altea-portal","event_type":"login_success","outcome":"ok","actor_email":"user@qeep.life","srcip":"203.0.113.10","metadata":{"path":"/"}}
```

## Marketplace API audit

`npm run portal:api-max-sync` теперь пишет:

- `api_connected`: какие API настроены, какие пропущены из-за отсутствующих env-переменных.
- `api_sync_finished`: итоговый статус и статусы шагов.

Если аудит временно нужно отключить для локального теста:

```powershell
$env:ALTEA_SECURITY_AUDIT_DISABLED="1"
```

## Ports

Домен из `CNAME`: `xn--80aocfomk2b.xn--p1ai`.

Если DNS указывает на GitHub Pages IP `185.199.108.153`, порты на этом IP не управляются из репозитория. Закрывать или менять их можно только сменой схемы хостинга:

- поставить домен за Cloudflare/другой CDN с proxy mode и WAF;
- перенести портал на VPS/Nginx и открыть только 80/443;
- если портал остается на GitHub Pages, не пытаться "закрывать порты" firewall-правилами в коде.

Важно: нестандартный порт для HTTP/HTTPS не является защитой. Для публичного портала полезнее HTTPS, allowlist, MFA, WAF/rate limit и аудит.

## MFA rollout

Не включать принудительный MFA одним шагом, пока сотрудники не enroll-нули TOTP, иначе можно заблокировать доступ.

Рекомендуемый порядок:

1. В Supabase Auth включить MFA/TOTP.
2. Enroll-нуть владельцев и 1-2 тестовых сотрудников.
3. Использовать текущий portal challenge-step для проверки кода после пароля.
4. После пилота включить Supabase policy/claim requirement на AAL2 для рабочих таблиц.
5. Только после этого требовать MFA для всех сотрудников.

Важно: текущий портал умеет запросить и проверить TOTP-код у пользователей, у которых фактор уже enroll-нут и подтвержден. Экран самостоятельного enrollment/reset MFA еще нужно делать отдельно или временно выполнять enrollment через админа/Supabase-процедуру.
