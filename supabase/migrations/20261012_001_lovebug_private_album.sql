-- Lovebug Booth v0.4: a single, two-member private album.
-- Run once using Supabase > SQL Editor. Never put the shared invitation code in Git.
-- This migration deliberately does not create a public invitation code.

create table if not exists public.lovebug_spaces (
  id uuid primary key default gen_random_uuid(),
  only_space boolean not null default true unique check (only_space),
  invitation_hash text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.lovebug_spaces enable row level security;
-- No client policies on lovebug_spaces: the invitation hash must never be readable.

create table if not exists public.lovebug_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  space_id uuid not null references public.lovebug_spaces(id) on delete cascade,
  joined_at timestamptz not null default now()
);
create index if not exists lovebug_members_space_idx on public.lovebug_members(space_id);
alter table public.lovebug_members enable row level security;

drop policy if exists "lovebug member sees own membership" on public.lovebug_members;
create policy "lovebug member sees own membership" on public.lovebug_members
  for select to authenticated using (user_id = (select auth.uid()));

-- The code is high-entropy; no unauthenticated caller can use this function.
-- Locking the single space row prevents two concurrent joins from exceeding two people.
create or replace function public.lovebug_join(p_invite text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_existing uuid;
  v_space uuid;
  v_hash text;
  v_members integer;
begin
  if v_user is null then raise exception 'Sign in first'; end if;
  select space_id into v_existing from public.lovebug_members where user_id = v_user;
  if v_existing is not null then return v_existing; end if;
  if p_invite is null or length(p_invite) < 48 or length(p_invite) > 128 then
    raise exception 'Invalid invitation code';
  end if;
  select id, invitation_hash into v_space, v_hash
    from public.lovebug_spaces where only_space and active for update;
  if v_space is null or v_hash is distinct from encode(sha256(convert_to(p_invite, 'UTF8')), 'hex') then
    raise exception 'Invalid invitation code';
  end if;
  select count(*) into v_members from public.lovebug_members where space_id = v_space;
  if v_members >= 2 then raise exception 'This little space is already full'; end if;
  insert into public.lovebug_members(user_id, space_id) values (v_user, v_space);
  return v_space;
end;
$$;

create or replace function public.lovebug_my_space()
returns uuid
language sql stable security definer set search_path = ''
as $$
  select space_id from public.lovebug_members
  where user_id = (select auth.uid()) limit 1;
$$;

create or replace function public.lovebug_is_member(p_space uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.lovebug_members
    where user_id = (select auth.uid()) and space_id = p_space
  );
$$;

revoke all on function public.lovebug_join(text) from public, anon;
revoke all on function public.lovebug_my_space() from public, anon;
revoke all on function public.lovebug_is_member(uuid) from public, anon;
grant execute on function public.lovebug_join(text) to authenticated;
grant execute on function public.lovebug_my_space() to authenticated;
grant execute on function public.lovebug_is_member(uuid) to authenticated;

create table if not exists public.lovebug_strips (
  id uuid primary key,
  space_id uuid not null references public.lovebug_spaces(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  theme text not null check (theme in ('strawberry', 'peach', 'lilac', 'mint')),
  note text not null default '',
  object_path text not null unique,
  source_local_id uuid,
  unique(space_id, created_by, source_local_id)
);
create index if not exists lovebug_strips_space_time_idx on public.lovebug_strips(space_id, created_at desc);
alter table public.lovebug_strips enable row level security;

drop policy if exists "lovebug couple reads their strips" on public.lovebug_strips;
create policy "lovebug couple reads their strips" on public.lovebug_strips
  for select to authenticated
  using (public.lovebug_is_member(space_id));

drop policy if exists "lovebug member adds own strips" on public.lovebug_strips;
create policy "lovebug member adds own strips" on public.lovebug_strips
  for insert to authenticated with check (
    created_by = (select auth.uid()) and public.lovebug_is_member(space_id)
    and object_path = space_id::text || '/' || id::text || '.png'
  );

drop policy if exists "lovebug member removes own strips" on public.lovebug_strips;
create policy "lovebug member removes own strips" on public.lovebug_strips
  for delete to authenticated using (
    created_by = (select auth.uid()) and public.lovebug_is_member(space_id)
  );

grant select, insert, delete on public.lovebug_strips to authenticated;
grant select on public.lovebug_members to authenticated;

-- This bucket must stay PRIVATE. Neither anonymous URLs nor a public bucket are used.
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('lovebug-private', 'lovebug-private', false, 10485760, array['image/png'])
on conflict (id) do update set public = false, file_size_limit = 10485760,
  allowed_mime_types = array['image/png'];

drop policy if exists "lovebug members download strips" on storage.objects;
create policy "lovebug members download strips" on storage.objects
  for select to authenticated using (
    bucket_id = 'lovebug-private'
    and exists (
      select 1 from public.lovebug_members m
      where m.user_id = (select auth.uid())
        and m.space_id::text = (storage.foldername(name))[1]
    )
  );

drop policy if exists "lovebug members upload strips" on storage.objects;
create policy "lovebug members upload strips" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'lovebug-private'
    and exists (
      select 1 from public.lovebug_members m
      where m.user_id = (select auth.uid())
        and m.space_id::text = (storage.foldername(name))[1]
    )
  );

drop policy if exists "lovebug uploader removes own strip image" on storage.objects;
create policy "lovebug uploader removes own strip image" on storage.objects
  for delete to authenticated using (
    bucket_id = 'lovebug-private'
    and owner_id = (select auth.uid())::text
    and exists (
      select 1 from public.lovebug_members m
      where m.user_id = (select auth.uid())
        and m.space_id::text = (storage.foldername(name))[1]
    )
  );
