const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

function json(status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' }
  });
}

function requiredEnv(name: string) {
  const value = String(Deno.env.get(name) || '').trim();
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

async function authenticatedUser(request: Request) {
  const authorization = String(request.headers.get('authorization') || '').trim();
  if (!authorization.toLowerCase().startsWith('bearer ')) return null;
  const supabaseUrl = requiredEnv('SUPABASE_URL').replace(/\/+$/, '');
  const anonKey = requiredEnv('SUPABASE_ANON_KEY');
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      Authorization: authorization,
      apikey: anonKey
    }
  });
  if (!response.ok) return null;
  return await response.json();
}

function allowedEmail(email: string) {
  const allowAll = String(Deno.env.get('REPRICER_PRICE_SYNC_ALLOW_ALL_AUTHENTICATED') || '')
    .trim()
    .toLowerCase() === 'true';
  if (allowAll) return true;
  const allowed = String(Deno.env.get('REPRICER_PRICE_SYNC_ALLOWED_EMAILS') || '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return Boolean(email) && allowed.includes(email.trim().toLowerCase());
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json(405, { ok: false, error: 'method_not_allowed' });
  try {
    const user = await authenticatedUser(request);
    const email = String(user?.email || '').trim();
    if (!user) return json(401, { ok: false, error: 'authentication_required' });
    if (!allowedEmail(email)) return json(403, { ok: false, error: 'repricer_sync_not_allowed' });

    const repository = String(Deno.env.get('GITHUB_REPOSITORY') || 'Alisia777/Harisma').trim();
    const workflow = String(Deno.env.get('REPRICER_PRICE_SYNC_WORKFLOW') || 'portal-repricer-prices.yml').trim();
    const ref = String(Deno.env.get('REPRICER_PRICE_SYNC_REF') || 'main').trim();
    const githubToken = requiredEnv('GITHUB_WORKFLOW_TOKEN');
    const response = await fetch(
      `https://api.github.com/repos/${repository}/actions/workflows/${encodeURIComponent(workflow)}/dispatches`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${githubToken}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ref,
          inputs: { requested_by: email }
        })
      }
    );
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 500);
      return json(502, { ok: false, error: 'workflow_dispatch_failed', status: response.status, detail });
    }
    return json(202, {
      ok: true,
      status: 'queued',
      requestedAt: new Date().toISOString(),
      requestedBy: email,
      workflow
    });
  } catch (error) {
    return json(500, { ok: false, error: 'repricer_sync_error', detail: String(error?.message || error) });
  }
});
