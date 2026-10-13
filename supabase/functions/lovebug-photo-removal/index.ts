/** Finalize a two-person-approved deletion. Never deletes a photo for one vote. */
import { createClient } from 'npm:@supabase/supabase-js@2';

const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization,apikey,content-type,x-client-info', 'Access-Control-Allow-Methods': 'POST,OPTIONS', 'Cache-Control': 'no-store' };
const reply = (code: number, data: Record<string, unknown>) => Response.json(data, { status: code, headers });
const uuid = (s: unknown): s is string => typeof s === 'string' && /^[a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(s);
function serverKey() {
  try { const key = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}').default; if (typeof key === 'string' && key) return key; } catch { /* legacy key */ }
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'POST') return reply(405, { error: 'Method not allowed' });
  const token = request.headers.get('Authorization')?.match(/^Bearer (.+)$/i)?.[1];
  if (!token) return reply(401, { error: 'Google sign-in required' });
  let input: {request_id?: unknown};
  try { input = await request.json(); } catch { return reply(400, { error: 'Invalid request' }); }
  if (!uuid(input?.request_id)) return reply(400, { error: 'Invalid removal request' });
  const project = Deno.env.get('SUPABASE_URL'); const key = serverKey();
  if (!project || !key) return reply(503, { error: 'Service unavailable' });
  const db = createClient(project, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: identity, error: authError } = await db.auth.getUser(token);
  if (authError || !identity.user || identity.user.is_anonymous) return reply(401, { error: 'Sign in with Google' });

  const { data: removal, error: reqError } = await db.from('lovebug_v6_removal_requests')
    .select('id,couple_id,photo_id,status').eq('id', input.request_id).maybeSingle();
  if (reqError) return reply(503, { error: 'Could not check approval' });
  if (!removal) return reply(404, { error: 'Request unavailable' });
  const { data: pair } = await db.from('lovebug_v6_couples').select('archived_at,deleting_at')
    .eq('id', removal.couple_id).maybeSingle();
  const { data: member } = await db.from('lovebug_v6_members').select('user_id')
    .eq('couple_id', removal.couple_id).eq('user_id', identity.user.id).maybeSingle();
  if (!member) return reply(403, { error: 'Not a member of this album' });
  if (removal.status === 'completed' && !removal.photo_id) return reply(200, { ok: true });
  if (removal.status !== 'approved' && removal.status !== 'completed') return reply(409, { error: 'Both people must approve first' });
  if (!pair || pair.archived_at || pair.deleting_at) return reply(409, { error: 'This connection is closed' });

  if (removal.photo_id) {
    const { data: photo } = await db.from('lovebug_v6_photos').select('id,couple_id,scope,object_path')
      .eq('id', removal.photo_id).eq('couple_id', removal.couple_id).eq('scope', 'shared').maybeSingle();
    if (photo) {
      const { error: storageError } = await db.storage.from('lovebug-v6-private').remove([photo.object_path]);
      if (storageError && !/not found|does not exist/i.test(storageError.message)) return reply(503, { error: 'Could not remove the image; please try again' });
    }
    // Mark completed BEFORE deleting metadata (photo_id uses ON DELETE SET NULL).
    // If metadata deletion fails, maintenance retries completed rows with photo_id.
    const { error: markError } = await db.from('lovebug_v6_removal_requests')
      .update({ status: 'completed' }).eq('id', removal.id).in('status',['approved','completed']);
    if (markError) return reply(503, { error: 'Could not finish the removal; please retry' });
    const { error: photoError } = await db.from('lovebug_v6_photos').delete()
      .eq('id', removal.photo_id).eq('couple_id', removal.couple_id).eq('scope', 'shared');
    if (photoError) return reply(503, { error: 'The photo needs a final cleanup; please try again' });
  }
  return reply(200, { ok: true });
});
