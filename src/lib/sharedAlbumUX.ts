/** Two-person removal requests. No direct client deletion of shared photos. */
import { supabaseClient } from './supabaseClient';

type RemovalState = 'pending' | 'approved' | 'declined' | 'completed';
export type RemovalRequest = {
  id: string;
  couple_id: string;
  photo_id: string | null;
  requested_by: string;
  status: RemovalState;
  created_at: string;
};
const api = () => {
  if (!supabaseClient) throw new Error('Google cloud connection is unavailable.');
  return supabaseClient;
};

export async function listRemovalRequests(coupleId: string): Promise<RemovalRequest[]> {
  const { data, error } = await api().from('lovebug_v6_removal_requests')
    .select('id,couple_id,photo_id,requested_by,status,created_at')
    .eq('couple_id', coupleId).in('status', ['pending','approved'])
    .order('created_at',{ ascending: true });
  if (error) throw new Error('Could not check photo removal requests.');
  return (data ?? []) as RemovalRequest[];
}

export async function requestRemoval(photoId: string): Promise<void> {
  const { error } = await api().rpc('lovebug_v6_request_photo_removal', { p_photo: photoId });
  if (error) throw new Error(error.message);
}

export async function reviewRemoval(requestId: string, approve: boolean): Promise<void> {
  const { data, error } = await api().rpc('lovebug_v6_review_photo_removal', {
    p_request: requestId, p_approve: approve,
  });
  if (error || data !== (approve ? 'approved' : 'declined')) throw new Error(error?.message || 'Could not answer this request.');
}

export async function finishApprovedRemoval(requestId: string): Promise<void> {
  const client = api();
  const { data: { session } } = await client.auth.getSession();
  if (!session || session.user.is_anonymous) throw new Error('Google sign-in required.');
  let response: Response;
  try {
    response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/lovebug-photo-removal`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ request_id: requestId }),
    });
  } catch { throw new Error('Could not finish the removal right now.'); }
  const result = await response.json().catch(() => null) as { ok?: boolean; error?: string } | null;
  if (!response.ok || !result?.ok) throw new Error(result?.error || 'Could not finish the removal right now.');
}
