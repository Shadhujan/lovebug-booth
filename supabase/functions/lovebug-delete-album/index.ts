/** Delete an entire couple album, including its private Storage files.
 * Only the creator may delete. Invoke with an authenticated Google session.
 * Deploy with --no-verify-jwt; this function verifies the user's token itself.
 */
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
});
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return json({ error: 'POST required' }, 405);
  const projectUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!projectUrl || !serviceKey) return json({ error: 'Server configuration is incomplete' }, 503);

  const match = /^Bearer (\S+)$/i.exec(request.headers.get('Authorization') ?? '');
  if (!match) return json({ error: 'Sign in to delete an album' }, 401);
  let albumId: unknown;
  try {
    const input: unknown = await request.json();
    if (input && typeof input === 'object' && !Array.isArray(input)) {
      albumId = (input as Record<string, unknown>).album_id;
    }
  } catch { return json({ error: 'Invalid request' }, 400); }
  if (typeof albumId !== 'string' || !uuid.test(albumId)) return json({ error: 'Invalid album' }, 400);

  const admin = createClient(projectUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: userData, error: authError } = await admin.auth.getUser(match[1]);
  if (authError || !userData.user || userData.user.is_anonymous) return json({ error: 'Google sign-in required' }, 401);
  const userId = userData.user.id;

  const { data: album, error: albumError } = await admin.from('lovebug_v6_couples')
    .select('id,owner_id,deleting_at').eq('id', albumId).maybeSingle();
  if (albumError) return json({ error: 'Album could not be checked' }, 503);
  if (!album) return json({ error: 'Album not found' }, 404);
  if (album.owner_id !== userId) return json({ error: 'Only the creator can delete the shared album' }, 403);

  // Protect the free-tier function from unbounded work. Larger galleries can be
  // exported/deleted in smaller batches by a future dedicated cleanup job.
  const { count, error: countError } = await admin.from('lovebug_v6_photos')
    .select('id', { head: true, count: 'exact' }).eq('couple_id', albumId);
  if (countError || count === null) return json({ error: 'Could not check album files' }, 503);
  if (count > 500) return json({ error: 'Download your album and contact support to remove an album with over 500 photos' }, 409);

  const { error: lockError } = await admin.from('lovebug_v6_couples')
    .update({ deleting_at: new Date().toISOString() }).eq('id', albumId).eq('owner_id', userId);
  if (lockError) return json({ error: 'Could not start album deletion' }, 503);

  // All matching Storage objects must go through the Storage API. Deleting only
  // SQL rows would leave private file bytes orphaned.
  const { data: photos, error: photoError } = await admin.from('lovebug_v6_photos')
    .select('object_path').eq('couple_id', albumId).order('created_at').limit(501);
  if (photoError || !photos || photos.length > 500) return json({ error: 'Deletion was interrupted; retry the same album' }, 503);
  const paths = photos.map((photo: { object_path: string }) => photo.object_path);
  for (let i = 0; i < paths.length; i += 100) {
    const { error } = await admin.storage.from('lovebug-v6-private').remove(paths.slice(i, i + 100));
    if (error) return json({ error: 'Could not delete every private file; retry this album' }, 503);
  }
  const { data: removed, error: deleteError } = await admin.from('lovebug_v6_couples')
    .delete().eq('id', albumId).eq('owner_id', userId).select('id');
  if (deleteError || !removed?.length) return json({ error: 'Album cleanup needs another attempt' }, 503);
  return json({ ok: true });
});
