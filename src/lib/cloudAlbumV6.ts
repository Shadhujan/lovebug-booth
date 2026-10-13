/** Optional v0.6 cloud album: only explicit uploads, never camera frames. */
import type { User } from '@supabase/supabase-js';
import type { AlbumEntry, ThemeKey } from '../types';
import { supabaseClient } from './supabaseClient';

const BUCKET = 'lovebug-v6-private';
const MAX_BYTES = 10 * 1024 * 1024;

export type CloudCouple = {
  id: string;
  owner_id: string;
  title: string;
  created_at: string;
  deleting_at: string | null;
  archived_at: string | null;
};
export type CloudPhoto = {
  id: string;
  owner_id: string;
  scope: 'personal' | 'shared';
  couple_id: string | null;
  created_at: string;
  theme: ThemeKey;
  note: string;
  object_path: string;
  source_local_id: string | null;
};

function api() {
  if (!supabaseClient) throw new Error('Cloud memories require Supabase configuration.');
  return supabaseClient;
}

function isUuid(value: string) {
  return /^[a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(value);
}

/** The raw 256-bit invitation code is shown once, never stored in localStorage or a URL. */
export function makeCoupleInvitation(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function listCouples(): Promise<CloudCouple[]> {
  const { data, error } = await api().from('lovebug_v6_couples')
    .select('id,owner_id,title,created_at,deleting_at,archived_at')
    .order('created_at', { ascending: false }).limit(20);
  if (error) throw new Error(`Could not load shared albums: ${error.message}`);
  return (data ?? []) as CloudCouple[];
}


/** v0.6.3: server-authorized active connection, not inferred from older albums. */
export async function currentCoupleId(): Promise<string | null> {
  const { data, error } = await api().rpc('lovebug_v6_my_active_couple');
  if (error) throw new Error(`Could not check your connection: ${error.message}`);
  return typeof data === 'string' ? data : null;
}

/** Disconnect both people from the current album, without deleting shared photos.
 * The album remains readable under Past memories for independent recovery. */
export async function disconnectCouple(coupleId: string): Promise<void> {
  if (!isUuid(coupleId)) throw new Error('Invalid connection.');
  const { error } = await api().rpc('lovebug_v6_disconnect', { p_couple: coupleId });
  if (error) throw new Error(`Could not disconnect: ${error.message}`);
}

/** Query all records rather than the first 24, especially when preserving an archive. */
export async function listAllCloudPhotos(scope: 'personal' | 'shared', coupleId: string | null): Promise<CloudPhoto[]> {
  if (scope === 'shared' && !coupleId) return [];
  const photos: CloudPhoto[] = [];
  for (let offset = 0; offset <= 400; offset += 100) {
    let query = api().from('lovebug_v6_photos')
      .select('id,owner_id,scope,couple_id,created_at,theme,note,object_path,source_local_id')
      .eq('scope', scope)
      .order('created_at', { ascending: false }).order('id', { ascending: false })
      .range(offset, offset + 99);
    if (scope === 'shared') query = query.eq('couple_id', coupleId!);
    const { data, error } = await query;
    if (error) throw new Error(`Could not load photos: ${error.message}`);
    const batch = (data ?? []) as CloudPhoto[];
    photos.push(...batch);
    if (batch.length < 100) return photos;
  }
  // Limit work explicitly: no silent partial archive/downloads.
  throw new Error('This album has more than 500 photos. Download your memories in smaller batches.');
}

/** Back up a shared photo into the user's own private cloud collection. */
export async function preserveSharedPhoto(photo: CloudPhoto, image: Blob, user: User): Promise<'copied' | 'already-saved'> {
  if (user.is_anonymous || photo.scope !== 'shared' || !isUuid(photo.id)) throw new Error('A Google account and a shared photo are required.');
  if (!image.size || image.size > MAX_BYTES) throw new Error('Photo exceeds the 10 MB storage limit.');
  const { data: existing, error: existingError } = await api().from('lovebug_v6_photos')
    .select('id').eq('scope', 'personal').eq('owner_id', user.id).eq('source_local_id', photo.id).limit(1);
  if (existingError) throw new Error(`Could not check this backup: ${existingError.message}`);
  if (existing?.length) return 'already-saved';
  const id = crypto.randomUUID();
  const objectPath = `personal/${user.id}/${id}.png`;
  const bucket = api().storage.from(BUCKET);
  const { error: uploadError } = await bucket.upload(objectPath, image, { contentType: 'image/png', upsert: false });
  if (uploadError) throw new Error(`Could not back up a shared photo: ${uploadError.message}`);
  const { error: insertError } = await api().from('lovebug_v6_photos').insert({
    id, owner_id: user.id, scope: 'personal', couple_id: null, theme: photo.theme,
    note: photo.note, object_path: objectPath, source_local_id: photo.id,
  });
  if (insertError) {
    await bucket.remove([objectPath]);
    if (insertError.code === '23505') return 'already-saved';
    throw new Error(`Could not record the private backup: ${insertError.message}`);
  }
  return 'copied';
}

/** Protect each memory before leaving. A failure stops the disconnect workflow. */
export async function preserveAlbumToCloud(coupleId: string, user: User, onProgress?: (done: number, total: number) => void): Promise<number> {
  const photos = await listAllCloudPhotos('shared', coupleId);
  for (let i = 0; i < photos.length; i++) {
    const image = await downloadCloudPhoto(photos[i]);
    await preserveSharedPhoto(photos[i], image, user);
    onProgress?.(i + 1, photos.length);
  }
  return photos.length;
}

export async function createCouple(title: string, code: string): Promise<string> {
  const { data, error } = await api().rpc('lovebug_v6_create_couple', {
    p_invite: code,
    p_title: title.trim() || 'our little album',
  });
  if (error) throw new Error(error.message);
  if (typeof data !== 'string') throw new Error('Shared album could not be created.');
  return data;
}

export async function joinCouple(code: string): Promise<string> {
  const { data, error } = await api().rpc('lovebug_v6_join_couple', { p_invite: code.trim() });
  if (error) throw new Error(error.message);
  if (typeof data !== 'string') throw new Error('Shared album could not be joined.');
  return data;
}

export async function rotateCoupleInvite(coupleId: string, code: string): Promise<void> {
  const { error } = await api().rpc('lovebug_v6_rotate_invite', {
    p_couple: coupleId,
    p_invite: code,
  });
  if (error) throw new Error(error.message);
}

export async function listCloudPhotos(scope: 'personal' | 'shared', coupleId: string | null): Promise<CloudPhoto[]> {
  if (scope === 'shared' && !coupleId) return [];
  let query = api().from('lovebug_v6_photos')
    .select('id,owner_id,scope,couple_id,created_at,theme,note,object_path,source_local_id')
    .eq('scope', scope)
    .order('created_at', { ascending: false })
    .limit(24);
  if (scope === 'shared') query = query.eq('couple_id', coupleId!);
  const { data, error } = await query;
  if (error) throw new Error(`Could not load private photos: ${error.message}`);
  return (data ?? []) as CloudPhoto[];
}

/** A private Storage download; never creates an anonymous/public URL. */
export async function downloadCloudPhoto(record: CloudPhoto): Promise<Blob> {
  const { data, error } = await api().storage.from(BUCKET).download(record.object_path);
  if (error || !data) throw new Error('Could not load that private photo.');
  return data;
}

export async function uploadLocalPhoto(
  entry: AlbumEntry,
  user: User,
  scope: 'personal' | 'shared',
  coupleId: string | null,
): Promise<void> {
  if (user.is_anonymous) throw new Error('Sign in with Google before uploading.');
  if (entry.image.size > MAX_BYTES) throw new Error('This photo exceeds the 10 MB cloud limit. You can still download it.');
  if (scope === 'shared' && (!coupleId || !isUuid(coupleId))) throw new Error('Choose a shared album first.');
  if (scope === 'personal') coupleId = null;
  const id = crypto.randomUUID();
  const objectPath = scope === 'personal'
    ? `personal/${user.id}/${id}.png`
    : `shared/${coupleId}/${id}.png`;
  const bucket = api().storage.from(BUCKET);
  const { error: uploadError } = await bucket.upload(objectPath, entry.image, {
    contentType: 'image/png', upsert: false, cacheControl: '3600',
  });
  if (uploadError) throw new Error(`Could not upload this photo: ${uploadError.message}`);

  const { error } = await api().from('lovebug_v6_photos').insert({
    id,
    owner_id: user.id,
    scope,
    couple_id: coupleId,
    theme: entry.theme,
    note: entry.note.slice(0, 240),
    object_path: objectPath,
    source_local_id: isUuid(entry.id) ? entry.id : null,
  });
  if (error) {
    // Best-effort cleanup of an upload whose metadata insert was rejected.
    await bucket.remove([objectPath]);
    if (error.code === '23505') throw new Error('This photo is already saved in the selected cloud album.');
    throw new Error(`Photo uploaded, but the album entry could not be saved: ${error.message}`);
  }
}

export async function deleteOwnCloudPhoto(record: CloudPhoto, userId: string): Promise<void> {
  if (record.owner_id !== userId) throw new Error('Only the person who uploaded this photo can remove it.');
  const { data, error } = await api().from('lovebug_v6_photos').delete()
    .eq('id', record.id).eq('owner_id', userId).select('id');
  if (error || !data?.length) throw new Error('This photo could not be removed.');
  const { error: imageError } = await api().storage.from(BUCKET).remove([record.object_path]);
  if (imageError) throw new Error('Album record removed. A private file still needs cleanup.');
}

/** A name/email is only revealed after the caller is a permanent, verified album member. */
export type CloudAlbumMember = {
  user_id: string;
  display_name: string;
  email: string;
  is_owner: boolean;
  joined_at: string;
};

export async function listAlbumMembers(coupleId: string): Promise<CloudAlbumMember[]> {
  if (!isUuid(coupleId)) throw new Error('Choose a shared album first.');
  const { data, error } = await api().rpc('lovebug_v6_album_members', { p_couple: coupleId });
  if (error) throw new Error(`Could not load album members: ${error.message}`);
  return (data ?? []) as CloudAlbumMember[];
}

export async function renameCouple(coupleId: string, title: string): Promise<void> {
  const cleanTitle = title.trim();
  if (!isUuid(coupleId) || !cleanTitle || cleanTitle.length > 60) {
    throw new Error('Choose an album name between 1 and 60 characters.');
  }
  const { error } = await api().rpc('lovebug_v6_rename_couple', {
    p_couple: coupleId,
    p_title: cleanTitle,
  });
  if (error) throw new Error(`Could not rename this album: ${error.message}`);
}

/** Make an independent shared copy of a private cloud photo.
 * Neither the original Storage object nor the original album record is modified.
 */
export async function sharePrivateCloudPhoto(
  photo: CloudPhoto,
  image: Blob,
  user: User,
  coupleId: string,
): Promise<void> {
  if (user.is_anonymous) throw new Error('Sign in with Google before sharing photos.');
  if (photo.scope !== 'personal' || photo.owner_id !== user.id) {
    throw new Error('Only your own private photos can be shared this way.');
  }
  if (!isUuid(coupleId)) throw new Error('Choose a shared album first.');
  if (!image.size || image.size > MAX_BYTES) throw new Error('The image is empty or exceeds the 10 MB cloud limit.');

  const id = crypto.randomUUID();
  const path = `shared/${coupleId}/${id}.png`;
  const bucket = api().storage.from(BUCKET);
  const { error: uploadError } = await bucket.upload(path, image, {
    contentType: 'image/png', upsert: false, cacheControl: '3600',
  });
  if (uploadError) throw new Error(`Could not share this photo: ${uploadError.message}`);

  const { error: insertError } = await api().from('lovebug_v6_photos').insert({
    id,
    owner_id: user.id,
    scope: 'shared',
    couple_id: coupleId,
    theme: photo.theme,
    note: photo.note.slice(0, 240),
    object_path: path,
    // Reusing this source identifier makes repeat shares to the same album idempotent.
    source_local_id: photo.id,
  });
  if (insertError) {
    await bucket.remove([path]);
    if (insertError.code === '23505') throw new Error('This photo is already shared with the selected album.');
    throw new Error(`The photo could not be added to the shared album: ${insertError.message}`);
  }
}


/** Delete the selected two-person album and every shared photo through the
 * authorized Edge Function. Never delete Storage metadata directly with SQL. */
export async function deleteSharedCloudAlbum(coupleId: string): Promise<void> {
  if (!isUuid(coupleId)) throw new Error('Choose a valid shared album.');
  const client = api();
  const { data, error } = await client.auth.getSession();
  if (error || !data.session || data.session.user.is_anonymous) {
    throw new Error('Sign in with Google before deleting an album.');
  }
  const functionUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/lovebug-delete-album`;
  let response: Response;
  try {
    response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${data.session.access_token}`,
        'Content-Type': 'application/json',
        'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
      },
      body: JSON.stringify({ album_id: coupleId }),
    });
  } catch { throw new Error('Could not reach album deletion. Please try again.'); }
  const body = await response.json().catch(() => null) as {error?: string; ok?: boolean} | null;
  if (!response.ok || !body?.ok) throw new Error(body?.error ?? 'Album deletion failed. Please try again.');
}
