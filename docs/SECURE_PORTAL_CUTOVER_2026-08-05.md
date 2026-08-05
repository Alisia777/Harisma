# Secure portal cutover runbook

**Target:** keep `харизмой.рф` working for authorized users while removing public access to repository-derived files, operational JSON, Supabase snapshots, and uploaded files.

## Target architecture

```text
Authorized employee
        |
        v
Cloudflare Access (identity + allow policy + MFA)
        |
        v
Cloudflare Pages secure artifact (_site)
        |
        +--> Supabase Auth (real user session)
        +--> Supabase REST protected by RLS
        +--> Supabase private Storage via signed URLs
```

The GitHub repository remains private. Cloudflare builds from the private repository. The browser receives only the reviewed `_site` artifact, not the repository root.

## Important distinction

- **Private GitHub repository** hides commits/source from GitHub visitors.
- **A public static site** still exposes every HTML/JS/image/file included in its deployment.
- The portal therefore needs both:
  1. a filtered build artifact;
  2. an identity proxy in front of the site;
  3. server-side Supabase authorization.

## Path A — active abuse / emergency containment

Use this when unknown uploads or reads are still occurring.

1. Open production Supabase SQL Editor.
2. Run `docs/supabase_emergency_lockdown_2026-08-05.sql`.
3. In Supabase Auth, disable/delete the known guest account and invalidate its sessions.
4. Disable anonymous sign-up if it is not required by another application.
5. Review Auth users and disable anything unknown.
6. Confirm anonymous requests now fail using the verification section below.

This may temporarily make the old GitHub Pages portal show missing data/files because the old deployment used anonymous snapshot reads. The priority here is stopping the incident.

## Path B — controlled cutover with minimal interruption

### 1. Merge only after CI passes

Required checks:

```bash
node scripts/setup-design-attachment-storage.selftest.js
node scripts/build-secure-pages.js
node scripts/security-pages-audit.js
```

The reviewed output is `_site`.

### 2. Create Cloudflare Pages project

- Repository: private `Alisia777/Harisma`
- Production branch: `main`
- Build command:

```bash
node scripts/build-secure-pages.js && node scripts/security-pages-audit.js
```

- Output directory:

```text
_site
```

Do not deploy the repository root.

### 3. Protect every Cloudflare origin

Create a Cloudflare Access self-hosted application for:

- `харизмой.рф/*`
- the project `*.pages.dev` hostname, or disable public access to that hostname
- preview deployments, if enabled

Recommended policy:

- default: deny;
- allow: exact approved employee emails or approved corporate identity group;
- require MFA at the identity provider;
- short session duration for administrators;
- no shared guest account.

Test Access before attaching the production domain. In a private/incognito window the site must show the Access challenge, not portal HTML.

### 4. Verify the secure artifact against current production data

Log in with an approved account and test:

- dashboard snapshots;
- tasks and comments;
- Designers workspace;
- upload one test image;
- open/download the image;
- delete the test image;
- log out and confirm the signed file URL expires/does not grant durable public access.

### 5. Apply production Supabase lockdown

Run:

```text
docs/supabase_emergency_lockdown_2026-08-05.sql
```

Then disable/delete the guest Auth account and invalidate old sessions.

### 6. Switch the custom domain

Attach `харизмой.рф` to the protected Cloudflare Pages project and update DNS through Cloudflare.

Verify from:

- an approved user browser;
- an incognito browser;
- a mobile network not already authenticated;
- the default Pages hostname;
- the old GitHub Pages URL.

### 7. Remove bypass paths

After the Cloudflare domain works:

1. Unpublish/disable GitHub Pages for `Alisia777/Harisma`.
2. Remove the old Pages custom-domain configuration if it still points to GitHub Pages.
3. Confirm the default GitHub Pages URL no longer serves portal HTML or assets.
4. Confirm the Cloudflare `pages.dev` hostname is also protected or disabled.

Do not leave both a protected Cloudflare domain and an unprotected GitHub Pages origin online.

## Verification commands / expected results

### Anonymous snapshot request

Use the browser publishable key only. Expected result after lockdown: HTTP `401/403` or an RLS denial; never snapshot rows.

```text
GET /rest/v1/portal_data_snapshots?select=brand,snapshot_key&limit=1
Authorization: Bearer <publishable-key>
```

### Anonymous upload

Expected result: HTTP `401/403`.

```text
POST /storage/v1/object/portal-task-files/security-check.txt
Authorization: Bearer <publishable-key>
```

### Old public file URL

Expected result: no durable anonymous download. Authorized portal users receive a short-lived signed URL generated after login.

### Static data files

These paths must be absent from the secure deployment:

```text
/data/dashboard.json
/data/skus.json
/data/platform_plan.json
/docs/
/scripts/
/2/backend/
```

### Browser bundle

The deployed bundle must not contain:

- employee email allowlist;
- guest account password;
- guest local-session fallback;
- `auth: 'anonymous'` portal mode;
- SQL, Excel, Word, PDF, CSV, ZIP, source maps, or environment files.

## GitHub account access review

Repository visibility is already private, but visibility is not the same as collaborator access.

For every repository:

1. `Settings → Collaborators / Manage access`
2. remove unknown users;
3. remove stale deploy keys;
4. review branch protection and Actions permissions.

At account level:

- review authorized GitHub Apps and OAuth Apps;
- revoke stale personal access tokens;
- review SSH keys and active sessions;
- enable 2FA/passkey;
- review the security log.

## Supabase follow-up

- Export/review Auth sign-in audit around the incident window.
- Review Storage object creation/update/delete timestamps and actors.
- Quarantine or delete unknown uploads only after preserving an incident evidence list.
- Rotate/delete the compromised guest credential.
- Keep the browser publishable key only with strict RLS; never place a service-role key in browser code.
- Add automated policy tests for:
  - anonymous user: denied;
  - authenticated non-member: denied;
  - authenticated member: allowed;
  - service role: allowed for production jobs.

## Rollback

If the secure build fails for authorized users:

1. keep Cloudflare Access enabled;
2. roll back the Cloudflare Pages deployment to the previous secure artifact;
3. do **not** re-enable anonymous Supabase policies;
4. do **not** restore a public Storage bucket;
5. fix authenticated token/signed URL handling in a new deployment.

Security rollback means reverting application code, not reopening data.
