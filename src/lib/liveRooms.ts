import { createClient } from '@supabase/supabase-js';

/**
 * Guest photo rooms have their own short-lived auth session. They never touch
 * the Google/cloud-album session, and no login UI is required.
 */
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

// Storage access may be blocked in private browsing or embedded webviews.
// In that case the guest session exists in memory for the current page only.
const memory = new Map<string, string>();
const safeGuestStorage = (() => {
  try { if (typeof window !== 'undefined') return window.sessionStorage; }
  catch { /* Privacy-restricted browser: fall through to in-memory storage. */ }
  return {
    getItem: (name: string) => memory.get(name) ?? null,
    setItem: (name: string, value: string) => { memory.set(name, value); },
    removeItem: (name: string) => { memory.delete(name); },
  };
})();

export const liveRoomClient = url && key
  ? createClient(url, key, {
      auth: {
        storageKey: 'lovebug-live-guest-v1',
        storage: safeGuestStorage,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    })
  : null;

export type LiveRoomMode = 'quick' | 'locked';
export type LiveRoomRole = 'host' | 'guest';
export type LiveRoomStatus = 'open' | 'approved' | 'pending' | 'denied' | 'left' | 'not_joined'
  | 'invalid_pin' | 'pin_locked' | 'full' | 'unavailable' | 'auth_required' | 'too_many_rooms' | 'invalid_mode'
  | 'not_pending' | 'closed';

export type LiveRoomResponse = {
  status: LiveRoomStatus;
  id?: string;
  role?: LiveRoomRole;
  mode?: LiveRoomMode;
  expires_at?: string;
  pending_user?: string | null;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function getInvitationId(): string | null {
  const value = new URLSearchParams(window.location.search).get('together');
  return value && UUID_PATTERN.test(value) ? value.toLowerCase() : null;
}

export function makeLiveRoomLink(id: string): string {
  const target = new URL(window.location.pathname, window.location.origin);
  target.searchParams.set('together', id);
  target.hash = '';
  return target.toString();
}

let identityTask: Promise<string> | null = null;
export async function ensureLiveIdentity(): Promise<string> {
  const client = liveRoomClient;
  if (!client) throw new Error('Configure the Supabase Project URL and publishable key first.');
  if (!identityTask) {
    identityTask = (async () => {
      const { data: previous, error: previousError } = await client.auth.getSession();
      if (previousError) throw previousError;
      if (previous.session?.user.id) return previous.session.access_token;
      const { data, error } = await client.auth.signInAnonymously();
      if (error || !data.session) {
        throw new Error('Guest rooms need Anonymous Sign-Ins enabled in Supabase Authentication settings.');
      }
      return data.session.access_token;
    })().finally(() => { identityTask = null; });
  }
  return identityTask;
}

async function rpc(name: string, args: Record<string, unknown>): Promise<LiveRoomResponse> {
  await ensureLiveIdentity();
  const { data, error } = await liveRoomClient!.rpc(name, args);
  if (error) {
    // Never present a raw SQL error or token to users.
    if (/not found|could not find|schema cache|does not exist/i.test(error.message)) {
      throw new Error('Secure rooms are not set up yet. Run the v0.5 Supabase SQL migration.');
    }
    throw new Error('Could not reach the room service. Please try again.');
  }
  if (!data || typeof data !== 'object' || typeof data.status !== 'string') {
    throw new Error('The room service sent an unexpected response.');
  }
  return data as LiveRoomResponse;
}

export const createLiveRoom = (mode: LiveRoomMode, pin: string | null) =>
  rpc('lovebug_live_create', { p_mode: mode, p_pin: pin });
export const liveRoomInfo = (id: string) => rpc('lovebug_live_info', { p_room: id });
export const requestLiveRoom = (id: string, pin: string | null) =>
  rpc('lovebug_live_request', { p_room: id, p_pin: pin });
export const liveRoomStatus = (id: string) => rpc('lovebug_live_status', { p_room: id });
export const decideLiveRoom = (id: string, pendingUser: string, approve: boolean) =>
  rpc('lovebug_live_decide', { p_room: id, p_guest: pendingUser, p_approve: approve });
export const leaveLiveRoom = (id: string) => rpc('lovebug_live_leave', { p_room: id });

/** CSPRNG-backed 6-digit PIN. The PIN never goes into the link or Realtime. */
export function newRoomPin(): string {
  const random = new Uint32Array(1);
  // Rejection sampling avoids modulo bias across six-digit values.
  const range = 900_000;
  const limit = Math.floor(0x1_0000_0000 / range) * range;
  do { crypto.getRandomValues(random); } while (random[0] >= limit);
  return String(100_000 + random[0] % range);
}

export function roomResponseMessage(status: LiveRoomStatus): string {
  switch (status) {
    case 'invalid_pin': return 'That PIN does not match. Ask your partner for the six-digit room PIN.';
    case 'pin_locked': return 'Too many incorrect PINs. This room is locked for 10 minutes.';
    case 'full': return 'This room already has someone waiting or taking photos.';
    case 'denied': return 'The host declined this request. Ask them to send a new invitation.';
    case 'unavailable': return 'This room has ended or its 45-minute invitation has expired. Create a new room.';
    case 'too_many_rooms': return 'You already have three open rooms. Close one before creating another.';
    case 'auth_required': return 'Could not start the private guest session. Try refreshing the page.';
    case 'invalid_mode': return 'Choose Quick Room or Locked Room and try again.';
    default: return 'Could not open the room. Please try again.';
  }
}
