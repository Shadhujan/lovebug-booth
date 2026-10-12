import type { User } from '@supabase/supabase-js';
import type { AlbumEntry, ThemeKey } from '../types';
import { PRIVATE_ALBUM_BUCKET, supabaseClient } from './supabaseClient';

export type CloudStrip = {
  id: string;
  space_id: string;
  created_by: string;
  created_at: string;
  object_path: string;
  theme: ThemeKey;
  note: string;
};
export type CloudStripWithPhoto = { record: CloudStrip; image: Blob };

function client() {
  if (!supabaseClient) throw new Error('Cloud album needs your Supabase configuration.');
  return supabaseClient;
}

export async function mySpace(): Promise<string | null> {
  const { data, error } = await client().rpc('lovebug_my_space');
  if (error) throw new Error('Could not check your couple membership. Run the v0.4 Supabase SQL setup first.');
  return typeof data === 'string' ? data : null;
}

export async function joinSpace(code: string): Promise<string> {
  const { data, error } = await client().rpc('lovebug_join', { p_invite: code.trim() });
  if (error) throw new Error(error.message);
  if (typeof data !== 'string') throw new Error('Could not join your couple space.');
  return data;
}

export async function listCloudStrips(): Promise<CloudStripWithPhoto[]> {
  const api = client();
  const { data, error } = await api.from('lovebug_strips')
    .select('id,space_id,created_by,created_at,object_path,theme,note')
    .order('created_at', { ascending: false })
    .limit(60);
  if (error) throw new Error('Could not load your shared album. Check the database permissions.');
  return Promise.all(((data ?? []) as CloudStrip[]).map(async record => {
    const { data: image, error: downloadError } = await api.storage.from(PRIVATE_ALBUM_BUCKET).download(record.object_path);
    if (downloadError || !image) throw new Error('A private photo could not be loaded. Please refresh or check your Storage policies.');
    return { record: record as CloudStrip, image };
  }));
}

export async function shareLocalStrip(spaceId: string, entry: AlbumEntry, user: User): Promise<void> {
  const api = client();
  if (entry.image.size > 10 * 1024 * 1024) throw new Error('That strip is over the private album’s 10 MB limit. Please download it instead.');
  const id = crypto.randomUUID();
  const objectPath = `${spaceId}/${id}.png`;
  const bucket = api.storage.from(PRIVATE_ALBUM_BUCKET);
  const { error: uploadError } = await bucket.upload(objectPath, entry.image, {
    contentType: 'image/png', cacheControl: '3600', upsert: false,
  });
  if (uploadError) throw new Error('Could not upload the photo. Check your private bucket and Storage rules.');

  const sourceLocalId = /^[0-9a-f-]{36}$/i.test(entry.id) ? entry.id : null;
  const { error: insertError } = await api.from('lovebug_strips').insert({
    id, space_id: spaceId, created_by: user.id, theme: entry.theme,
    note: entry.note, object_path: objectPath, source_local_id: sourceLocalId,
  });
  if (insertError) {
    await bucket.remove([objectPath]);
    if (insertError.code === '23505') throw new Error('This photo is already shared in your couple album.');
    throw new Error('Your photo uploaded, but the album record could not be saved. Please retry.');
  }
}

export async function deleteOwnCloudStrip(entry: CloudStrip): Promise<void> {
  const api = client();
  // Delete metadata before file: RLS checks ownership and prevents deleting a partner's strip.
  const { error: metadataError } = await api.from('lovebug_strips').delete().eq('id', entry.id).eq('created_by', entry.created_by);
  if (metadataError) throw new Error('Could not remove that memory from the shared album.');
  const { error: photoError } = await api.storage.from(PRIVATE_ALBUM_BUCKET).remove([entry.object_path]);
  if (photoError) throw new Error('Memory removed from the album, but its private file needs cleanup.');
}
