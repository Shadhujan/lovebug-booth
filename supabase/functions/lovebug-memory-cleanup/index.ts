/** Daily expiry cleanup: remove Storage images first, then their SQL records. */
import { createClient } from 'npm:@supabase/supabase-js@2';

const reply = (code: number, body: Record<string, unknown>) => Response.json(body, { status: code, headers: { 'Cache-Control': 'no-store' } });
function serverKey() {
  try { const key = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}').default; if (typeof key === 'string' && key) return key; } catch { /* legacy */ }
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
}
async function sameToken(got: string | null, expected: string | undefined): Promise<boolean> {
  if (!got || !expected || expected.length < 40) return false;
  const [left,right] = await Promise.all([got,expected].map(async s => new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))));
  return left.length === right.length && left.reduce((out,v,i) => out | (v ^ right[i]),0) === 0;
}

Deno.serve(async (request: Request) => {
  if (request.method !== 'POST') return reply(405, { error: 'Method not allowed' });
  if (!(await sameToken(request.headers.get('x-lovebug-cleanup-token'),Deno.env.get('LOVEBUG_CLEANUP_GITHUB_TOKEN'))))
    return reply(401, { error: 'Unauthorized' });
  const url = Deno.env.get('SUPABASE_URL'); const key = serverKey();
  if (!url || !key) return reply(503, { error: 'Service not configured' });
  const db = createClient(url,key,{ auth: { persistSession:false,autoRefreshToken:false } });
  const now = new Date().toISOString();
  let expired = 0; let finalized = 0;
  // A capped daily batch prevents function timeouts; additional albums are
  // processed on the next run. RLS already stops access at the exact deadline.
  const { data: albums, error: pairError } = await db.from('lovebug_v6_couples')
    .select('id').not('archived_at','is',null).lte('recovery_until',now)
    .order('recovery_until',{ ascending:true }).limit(10);
  if (pairError) return reply(503,{ error:'Could not inspect expired albums' });
  for (const album of albums ?? []) {
    let failure = false;
    while (!failure) {
      const { data: images, error } = await db.from('lovebug_v6_photos')
        .select('id,object_path').eq('couple_id',album.id).eq('scope','shared').limit(75);
      if (error) { failure = true; break; }
      if (!images?.length) break;
      const { error: storageError } = await db.storage.from('lovebug-v6-private').remove(images.map(x=>x.object_path));
      if (storageError && !/not found|does not exist/i.test(storageError.message)) { failure = true; break; }
      const { error: rowsError } = await db.from('lovebug_v6_photos').delete().in('id',images.map(x=>x.id));
      if (rowsError) { failure = true; break; }
    }
    if (failure) continue;
    const { error: goneError } = await db.from('lovebug_v6_couples').delete()
      .eq('id',album.id).lte('recovery_until',now).not('archived_at','is',null);
    if (!goneError) expired++;
  }

  // Retry a completed approval if Storage was deleted but photo row cleanup failed.
  const { data: approved } = await db.from('lovebug_v6_removal_requests')
    .select('id,couple_id,photo_id,status').in('status',['approved','completed']).not('photo_id','is',null).limit(30);
  for (const request of approved ?? []) {
    const { data: pair } = await db.from('lovebug_v6_couples')
      .select('archived_at,deleting_at').eq('id',request.couple_id).maybeSingle();
    if (!pair || pair.archived_at || pair.deleting_at) continue;
    const { data: photo } = await db.from('lovebug_v6_photos')
      .select('id,object_path').eq('id',request.photo_id).eq('couple_id',request.couple_id).maybeSingle();
    if (photo) {
      const { error: removeError } = await db.storage.from('lovebug-v6-private').remove([photo.object_path]);
      if (removeError && !/not found|does not exist/i.test(removeError.message)) continue;
    }
    const { error: markError } = await db.from('lovebug_v6_removal_requests').update({status:'completed'}).eq('id',request.id);
    if (markError) continue;
    if (photo) {
      const { error: deleteError } = await db.from('lovebug_v6_photos').delete().eq('id',photo.id);
      if (deleteError) continue;
    }
    finalized++;
  }
  return reply(200,{ok:true,expired_albums:expired,finalized_photos:finalized});
});
