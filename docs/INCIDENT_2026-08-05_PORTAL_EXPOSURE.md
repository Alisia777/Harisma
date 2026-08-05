# Incident: public portal data and anonymous file storage

**Date identified:** 2026-08-05  
**Repository:** `Alisia777/Harisma`  
**Status:** containment prepared in `security/lockdown-2026-08-05`; production SQL and access-proxy cutover still required.

## Executive summary

The GitHub repository itself is private. The exposure happened through the deployed browser application and Supabase configuration:

1. GitHub Pages published the portal's browser files and the `data/` directory.
2. Real operational snapshots were available as static JSON.
3. Supabase RLS allowed `anon` to read portal snapshots.
4. Attachment metadata and Storage policies allowed `anon` to read, upload, update, and delete files.
5. The `portal-task-files` bucket was public and a workflow kept restoring `public: true`.
6. A guest account and fallback guest-session logic were embedded in browser-delivered JavaScript.
7. The client-side access file exposed employee emails and roles.

This explains both symptoms reported during the incident:

- external people could discover portal/channel terminology and operational figures without GitHub repository access;
- external people could upload arbitrary photos/files into the shared storage.

## Evidence in the repository

| Finding | Source |
|---|---|
| Static operational data published by the site | `data/dashboard.json` and other `data/*.json` |
| Anonymous snapshot reads | `2/backend/supabase_schema_v87_snapshots.sql` |
| Anonymous attachment CRUD and public bucket | `docs/supabase_task_attachments_setup.sql` |
| Workflow reconfigures bucket on push | `.github/workflows/portal-designers-file-storage.yml` |
| Storage script used `public: true` | `scripts/setup-design-attachment-storage.js` |
| Client email/role allowlist | `portal-auth-access.js` |
| Guest credentials/session fallback in browser code | `portal-auth-gate.js` |
| Public attachment URLs | `portal-designers.js`, `portal-document-storage-v1.js` |

## Containment included in this branch

- `portal-task-files` configuration changed to private.
- Storage self-test now rejects `public: true`.
- Anonymous snapshot access removed from reviewed SQL.
- Anonymous attachment metadata and Storage CRUD removed from reviewed SQL.
- Server authorization function added using protected `app_metadata` or workspace membership.
- Guest/anonymous team-store fallback removed.
- Authenticated Supabase runtime added:
  - replaces anonymous bearer tokens with the active user session for protected REST/Storage calls;
  - creates short-lived signed URLs for private files;
  - upgrades historical public-style file links to signed URLs at runtime.
- Secure static builder added:
  - excludes `data/`, `docs/`, backend, scripts, tests, SQL and office documents;
  - removes browser-delivered employee allowlist;
  - disables browser guest login in the built artifact;
  - forces email/password authenticated portal mode.
- CI audit added to fail if sensitive directories/files or anonymous fallbacks reappear.

## Actions that cannot be completed by a Git commit alone

These actions require production account access:

1. Run `docs/supabase_emergency_lockdown_2026-08-05.sql` in the production Supabase SQL Editor.
2. Disable or delete the known guest Auth user and invalidate its password/session tokens.
3. Review Supabase Auth users and remove/disable unknown accounts.
4. Configure Cloudflare Pages/Access (or an equivalent identity proxy) for the portal.
5. After the protected origin is verified, disable the old GitHub Pages publication to prevent bypass through the default Pages URL.
6. Review GitHub repository collaborators, deploy keys, OAuth/GitHub Apps, PATs, SSH keys, and active sessions.

## Exposure window and historical copies

Making a repository private or deleting live files does not remove:

- files already downloaded by a third party;
- browser/search caches;
- screenshots;
- old public forks or clones, if any;
- active sessions issued before account/password revocation.

Treat any guest password as compromised. The Supabase publishable key is designed for browser use; the defect was permissive RLS, not the presence of that key. A service-role key must never be placed in browser code and was not intentionally added by this branch.

## Follow-up

- Move the portal's browser authorization from static email rules to server-managed memberships/roles completely.
- Add automated RLS tests using an anonymous token, unauthorized authenticated token, and authorized member token.
- Add retention/quarantine controls for uploaded files and investigate unknown uploads.
- Review audit logs for object creation/deletion and Supabase Auth sign-ins during the suspected period.
