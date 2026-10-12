-- Lovebug Booth v0.5: temporary guest rooms with server-enforced admission.
-- Run in Supabase SQL Editor. Enable Auth > Anonymous Sign-Ins first.
-- Realtime > Settings > Allow public access should be OFF for public release.
-- No photo data or room PINs are stored in Realtime or in the client bundle.

create table if not exists public.lovebug_live_rooms (
  id uuid primary key default gen_random_uuid(),
  host_uid uuid not null references auth.users(id) on delete cascade,
  mode text not null check (mode in ('quick', 'locked')),
  pin_salt text,
  pin_hash text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '45 minutes'),
  closed_at timestamptz,
  wrong_pin_attempts integer not null default 0,
  pin_locked_until timestamptz,
  check ((mode = 'quick' and pin_hash is null and pin_salt is null)
      or (mode = 'locked' and pin_hash is not null and pin_salt is not null))
);
create index if not exists lovebug_live_rooms_host_idx
  on public.lovebug_live_rooms(host_uid, expires_at desc);
alter table public.lovebug_live_rooms enable row level security;

create table if not exists public.lovebug_live_guests (
  room_id uuid not null references public.lovebug_live_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  state text not null check (state in ('pending', 'approved', 'denied', 'left')),
  requested_at timestamptz not null default now(),
  primary key (room_id, user_id)
);
create index if not exists lovebug_live_guests_room_state_idx
  on public.lovebug_live_guests(room_id, state);
alter table public.lovebug_live_guests enable row level security;

-- The tables have no SELECT/INSERT/UPDATE/DELETE policies for browser clients.
-- Only narrow SECURITY DEFINER RPCs below access them.
revoke all on public.lovebug_live_rooms from anon, authenticated;
revoke all on public.lovebug_live_guests from anon, authenticated;

create or replace function public.lovebug_live_create(p_mode text, p_pin text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_salt text;
  v_id uuid;
  v_expiry timestamptz;
begin
  if v_user is null then return jsonb_build_object('status', 'auth_required'); end if;
  if p_mode not in ('quick', 'locked') then return jsonb_build_object('status', 'invalid_mode'); end if;
  if p_mode = 'locked' and (p_pin is null or p_pin !~ '^[0-9]{6}$') then
    return jsonb_build_object('status', 'invalid_pin');
  end if;
  -- Opportunistically remove expired room metadata older than a day.
  -- Anonymous Auth user records have a separate Supabase retention lifecycle.
  delete from public.lovebug_live_rooms where expires_at < now() - interval '1 day';
  if (select count(*) from public.lovebug_live_rooms
      where host_uid = v_user and closed_at is null and expires_at > now()) >= 3 then
    return jsonb_build_object('status', 'too_many_rooms');
  end if;
  v_salt := replace(gen_random_uuid()::text, '-', '');
  insert into public.lovebug_live_rooms(host_uid, mode, pin_salt, pin_hash)
    values (v_user, p_mode,
      case when p_mode = 'locked' then v_salt else null end,
      case when p_mode = 'locked' then encode(sha256(convert_to(v_salt || ':' || p_pin, 'UTF8')), 'hex') else null end)
    returning id, expires_at into v_id, v_expiry;
  return jsonb_build_object('status', 'approved', 'role', 'host', 'id', v_id,
    'mode', p_mode, 'expires_at', v_expiry);
end;
$$;

-- A random UUID in the invite URL is required to discover the mode.
-- No room list, PIN, member identities, or camera state are exposed.
create or replace function public.lovebug_live_info(p_room uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_room public.lovebug_live_rooms%rowtype;
begin
  if auth.uid() is null then return jsonb_build_object('status', 'auth_required'); end if;
  select * into v_room from public.lovebug_live_rooms where id = p_room;
  if not found or v_room.closed_at is not null or v_room.expires_at <= now() then
    return jsonb_build_object('status', 'unavailable');
  end if;
  return jsonb_build_object('status', 'open', 'mode', v_room.mode, 'expires_at', v_room.expires_at);
end;
$$;

-- The room row is locked while checking PIN attempts and reserving the one guest seat.
create or replace function public.lovebug_live_request(p_room uuid, p_pin text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_room public.lovebug_live_rooms%rowtype;
  v_guest_state text;
  v_bad_count integer;
begin
  if v_user is null then return jsonb_build_object('status', 'auth_required'); end if;
  select * into v_room from public.lovebug_live_rooms where id = p_room for update;
  if not found or v_room.closed_at is not null or v_room.expires_at <= now() then
    return jsonb_build_object('status', 'unavailable');
  end if;
  if v_room.host_uid = v_user then return jsonb_build_object('status', 'approved', 'role', 'host'); end if;
  select state into v_guest_state from public.lovebug_live_guests
    where room_id = p_room and user_id = v_user;
  if v_guest_state = 'approved' then return jsonb_build_object('status', 'approved', 'role', 'guest'); end if;
  if v_guest_state = 'pending' then return jsonb_build_object('status', 'pending'); end if;
  if v_guest_state = 'denied' then return jsonb_build_object('status', 'denied'); end if;
  if v_room.mode = 'locked' then
    if v_room.pin_locked_until is not null and v_room.pin_locked_until > now() then
      return jsonb_build_object('status', 'pin_locked');
    end if;
    if p_pin is null or p_pin !~ '^[0-9]{6}$' or
      encode(sha256(convert_to(v_room.pin_salt || ':' || p_pin, 'UTF8')), 'hex') <> v_room.pin_hash then
      v_bad_count := v_room.wrong_pin_attempts + 1;
      update public.lovebug_live_rooms set
        wrong_pin_attempts = case when v_bad_count >= 5 then 0 else v_bad_count end,
        pin_locked_until = case when v_bad_count >= 5 then now() + interval '10 minutes' else null end
      where id = p_room;
      -- RETURN, rather than RAISE, is essential: the attempt counter must commit.
      return jsonb_build_object('status', case when v_bad_count >= 5 then 'pin_locked' else 'invalid_pin' end);
    end if;
    update public.lovebug_live_rooms set wrong_pin_attempts = 0, pin_locked_until = null
      where id = p_room;
  end if;
  if exists (select 1 from public.lovebug_live_guests
      where room_id = p_room and state in ('pending', 'approved') and user_id <> v_user) then
    return jsonb_build_object('status', 'full');
  end if;
  insert into public.lovebug_live_guests(room_id, user_id, state)
    values (p_room, v_user, 'pending')
    on conflict (room_id, user_id) do update set state = 'pending', requested_at = now();
  return jsonb_build_object('status', 'pending');
end;
$$;

-- Status is visible only to a room's host or a user who requested to join.
create or replace function public.lovebug_live_status(p_room uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_room public.lovebug_live_rooms%rowtype;
  v_guest_state text;
  v_pending uuid;
begin
  if v_user is null then return jsonb_build_object('status', 'auth_required'); end if;
  select * into v_room from public.lovebug_live_rooms where id = p_room;
  if not found or v_room.closed_at is not null or v_room.expires_at <= now() then
    return jsonb_build_object('status', 'unavailable');
  end if;
  if v_room.host_uid = v_user then
    select user_id into v_pending from public.lovebug_live_guests
      where room_id = p_room and state = 'pending' order by requested_at limit 1;
    return jsonb_build_object('status', 'approved', 'role', 'host',
      'mode', v_room.mode, 'expires_at', v_room.expires_at, 'pending_user', v_pending);
  end if;
  select state into v_guest_state from public.lovebug_live_guests
    where room_id = p_room and user_id = v_user;
  return jsonb_build_object('status', coalesce(v_guest_state, 'not_joined'),
    'role', 'guest', 'mode', v_room.mode, 'expires_at', v_room.expires_at);
end;
$$;

create or replace function public.lovebug_live_decide(p_room uuid, p_guest uuid, p_approve boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_room public.lovebug_live_rooms%rowtype;
begin
  if auth.uid() is null then return jsonb_build_object('status', 'auth_required'); end if;
  select * into v_room from public.lovebug_live_rooms where id = p_room for update;
  if not found or v_room.host_uid <> auth.uid() or v_room.closed_at is not null or v_room.expires_at <= now() then
    return jsonb_build_object('status', 'unavailable');
  end if;
  if p_approve and exists (select 1 from public.lovebug_live_guests
      where room_id = p_room and state = 'approved' and user_id <> p_guest) then
    return jsonb_build_object('status', 'full');
  end if;
  update public.lovebug_live_guests set state = case when p_approve then 'approved' else 'denied' end
    where room_id = p_room and user_id = p_guest and state = 'pending';
  if not found then return jsonb_build_object('status', 'not_pending'); end if;
  return jsonb_build_object('status', case when p_approve then 'approved' else 'denied' end);
end;
$$;

create or replace function public.lovebug_live_leave(p_room uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_room public.lovebug_live_rooms%rowtype;
begin
  if auth.uid() is null then return jsonb_build_object('status', 'auth_required'); end if;
  select * into v_room from public.lovebug_live_rooms where id = p_room for update;
  if not found then return jsonb_build_object('status', 'unavailable'); end if;
  if v_room.host_uid = auth.uid() then
    update public.lovebug_live_rooms set closed_at = coalesce(closed_at, now()) where id = p_room;
    update public.lovebug_live_guests set state = 'left' where room_id = p_room and state in ('pending', 'approved');
    return jsonb_build_object('status', 'closed');
  end if;
  update public.lovebug_live_guests set state = 'left'
    where room_id = p_room and user_id = auth.uid() and state in ('pending', 'approved');
  return jsonb_build_object('status', 'left');
end;
$$;

-- Realtime RLS authorization is checked when a private channel is joined.
-- Joining/signaling requires server-approved membership AND an unexpired room.
create or replace function public.lovebug_live_can_signal(p_topic text)
returns boolean language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.lovebug_live_rooms r
    where p_topic = 'lovebug-secure:' || r.id::text
      and r.closed_at is null and r.expires_at > now()
      and (r.host_uid = (select auth.uid()) or exists (
        select 1 from public.lovebug_live_guests g
        where g.room_id = r.id and g.user_id = (select auth.uid()) and g.state = 'approved'
      ))
  );
$$;

revoke all on function public.lovebug_live_create(text, text) from public, anon;
revoke all on function public.lovebug_live_info(uuid) from public, anon;
revoke all on function public.lovebug_live_request(uuid, text) from public, anon;
revoke all on function public.lovebug_live_status(uuid) from public, anon;
revoke all on function public.lovebug_live_decide(uuid, uuid, boolean) from public, anon;
revoke all on function public.lovebug_live_leave(uuid) from public, anon;
revoke all on function public.lovebug_live_can_signal(text) from public, anon;
grant execute on function public.lovebug_live_create(text, text) to authenticated;
grant execute on function public.lovebug_live_info(uuid) to authenticated;
grant execute on function public.lovebug_live_request(uuid, text) to authenticated;
grant execute on function public.lovebug_live_status(uuid) to authenticated;
grant execute on function public.lovebug_live_decide(uuid, uuid, boolean) to authenticated;
grant execute on function public.lovebug_live_leave(uuid) to authenticated;
grant execute on function public.lovebug_live_can_signal(text) to authenticated;

-- Restrictive policies guard our topic EVEN IF another project feature adds
-- broader permissive Realtime policies. They don't affect unrelated topics.
drop policy if exists "lovebug live room restricted read" on realtime.messages;
create policy "lovebug live room restricted read"
  on realtime.messages as restrictive for select to authenticated
  using ( (select realtime.topic()) not like 'lovebug-secure:%'
       or public.lovebug_live_can_signal((select realtime.topic())) );

drop policy if exists "lovebug live room restricted write" on realtime.messages;
create policy "lovebug live room restricted write"
  on realtime.messages as restrictive for insert to authenticated
  with check ( (select realtime.topic()) not like 'lovebug-secure:%'
       or public.lovebug_live_can_signal((select realtime.topic())) );

-- A restrictive RLS policy must have a matching permissive policy to allow access.
drop policy if exists "lovebug approved read broadcasts" on realtime.messages;
create policy "lovebug approved read broadcasts" on realtime.messages
  for select to authenticated
  using ( (select realtime.topic()) like 'lovebug-secure:%'
    and extension in ('broadcast', 'presence')
    and public.lovebug_live_can_signal((select realtime.topic())) );

drop policy if exists "lovebug approved write broadcasts" on realtime.messages;
create policy "lovebug approved write broadcasts" on realtime.messages
  for insert to authenticated
  with check ( (select realtime.topic()) like 'lovebug-secure:%'
    and extension in ('broadcast', 'presence')
    and public.lovebug_live_can_signal((select realtime.topic())) );
