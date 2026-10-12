/**
 * Lovebug Booth — protected, scheduled availability heartbeat.
 *
 * This function deliberately does NOT use a browser session, the publishable
 * key or Supabase's public REST policies. External cron services authenticate
 * with a dedicated long random token, and only this server-side function may
 * upsert records into public.keep_alive_log.
 *
 * GET  /lovebug-health?source=cron&token=<separate-cron-token>
 * POST /lovebug-health?source=github-actions
 *      x-lovebug-health-token: <separate-github-token>
 *
 * JWT verification is disabled at the gateway for this webhook; this function
 * must reject every call without its own valid token (fail closed).
 */
import { createClient } from 'npm:@supabase/supabase-js@2';

type Source = 'cron' | 'github-actions';
type SiteCheck = { ok: boolean; httpStatus: number | null; elapsedMs: number };

const SITE_URL = 'https://lovebug-booth.vercel.app/';
const DATABASE_TIMEOUT_MS = 12_000;
const SITE_TIMEOUT_MS = 8_000;

function reply(status: number, body: Record<string, unknown>): Response {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store, max-age=0',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

/** Compare SHA-256 hashes in fixed time without logging either credential. */
async function sameToken(received: string | null, expected: string | undefined): Promise<boolean> {
  if (!received || !expected || expected.length < 40) return false;
  const encoder = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(received)),
    crypto.subtle.digest('SHA-256', encoder.encode(expected)),
  ]);
  const left = new Uint8Array(a);
  const right = new Uint8Array(b);
  let difference = 0;
  for (let i = 0; i < left.length; i++) difference |= left[i] ^ right[i];
  return difference === 0;
}

/** New sb_secret key is preferred; legacy service role is a fallback. */
function serverDatabaseKey(): string | null {
  const keys = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (keys) {
    try {
      const defaultKey: unknown = (JSON.parse(keys) as Record<string, unknown>).default;
      if (typeof defaultKey === 'string' && defaultKey.length) return defaultKey;
    } catch { /* Older projects may not provide the newer key dictionary. */ }
  }
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || null;
}

/** Reachability only: this cannot prove WebRTC or photo editing is functioning. */
async function checkWebsite(): Promise<SiteCheck> {
  const started = performance.now();
  try {
    const response = await fetch(SITE_URL, {
      method: 'HEAD',
      redirect: 'follow',
      cache: 'no-store',
      signal: AbortSignal.timeout(SITE_TIMEOUT_MS),
    });
    // Some web hosts disallow HEAD; retry with GET only in that case.
    if (response.status === 405 || response.status === 501) {
      const get = await fetch(SITE_URL, {
        method: 'GET',
        redirect: 'follow',
        cache: 'no-store',
        signal: AbortSignal.timeout(SITE_TIMEOUT_MS),
      });
      await get.body?.cancel().catch(() => undefined);
      return { ok: get.ok, httpStatus: get.status, elapsedMs: Math.round(performance.now() - started) };
    }
    await response.body?.cancel().catch(() => undefined);
    return { ok: response.ok, httpStatus: response.status, elapsedMs: Math.round(performance.now() - started) };
  } catch {
    return { ok: false, httpStatus: null, elapsedMs: Math.round(performance.now() - started) };
  }
}

Deno.serve(async (request: Request): Promise<Response> => {
  const url = new URL(request.url);
  const source = url.searchParams.get('source');
  if (source !== 'cron' && source !== 'github-actions') {
    return reply(400, { ok: false, error: 'invalid_source' });
  }
  if ((source === 'cron' && request.method !== 'GET') ||
      (source === 'github-actions' && request.method !== 'POST')) {
    return reply(405, { ok: false, error: 'invalid_method' });
  }

  const expectedSecret = Deno.env.get(
    source === 'cron' ? 'LOVEBUG_HEALTH_CRON_TOKEN' : 'LOVEBUG_HEALTH_GITHUB_TOKEN',
  );
  // The URL token exists for URL-only schedulers. Prefer the custom header if
  // the cron provider supports it, since URLs can be captured in access logs.
  const token = request.headers.get('x-lovebug-health-token') ||
    (source === 'cron' ? url.searchParams.get('token') : null);
  if (!expectedSecret || expectedSecret.length < 40) {
    return reply(503, { ok: false, error: 'not_configured' });
  }
  if (!(await sameToken(token, expectedSecret))) {
    return reply(401, { ok: false, error: 'unauthorized' });
  }

  const projectUrl = Deno.env.get('SUPABASE_URL');
  const adminKey = serverDatabaseKey();
  if (!projectUrl || !adminKey) {
    return reply(503, { ok: false, error: 'database_not_configured' });
  }

  const now = new Date();
  const isoTime = now.toISOString();
  const dayUtc = isoTime.slice(0, 10);
  const site = await checkWebsite();
  try {
    const db = createClient(projectUrl, adminKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error } = await db.from('keep_alive_log').upsert({
      source: source as Source,
      heartbeat_day: dayUtc,
      pinged_at: isoTime,
      website_ok: site.ok,
      website_http_status: site.httpStatus,
      website_latency_ms: site.elapsedMs,
    }, { onConflict: 'source,heartbeat_day' }).abortSignal(AbortSignal.timeout(DATABASE_TIMEOUT_MS));
    if (error) {
      // Do not leak SQL details, keys, database schema, or request URLs.
      console.error('Lovebug heartbeat database write failed', { code: error.code });
      return reply(503, { ok: false, error: 'database_write_failed' });
    }
  } catch {
    return reply(503, { ok: false, error: 'database_unreachable' });
  }

  // Return 503 when Vercel is unavailable so both schedulers alert, even though
  // the failed site check was successfully written to the heartbeat table.
  return reply(site.ok ? 200 : 503, {
    ok: site.ok,
    stored: true,
    source,
    heartbeat_day: dayUtc,
    checked_at: isoTime,
    website: {
      reachable: site.ok,
      http_status: site.httpStatus,
      latency_ms: site.elapsedMs,
    },
  });
});
