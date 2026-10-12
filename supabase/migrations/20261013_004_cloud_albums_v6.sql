-- Lovebug Booth v0.6 - opt-in personal and two-person cloud albums.
-- Run in Supabase SQL Editor after v0.5.4.1. Preserves all existing v0.4 rows and files.
-- Never use this migration to store camera/room streams: images are uploaded only by explicit user action.

begin;

-- Freeze the hidden v0.4 single-couple prototype, which is not suitable for a
-- public multi-user app. Existing data/bucket are preserved for manual migration.
revoke all on table public.lovebug_spaces, public.lovebug_members,
  public.lovebug_strips from anon, authenticated;
revoke execute on function public.lovebug_join(text), public.lovebug_my_space(),
  public.lovebug_is_member(uuid) from public, anon, authenticated;
drop policy if exists "lovebug member sees own membership" on public.lovebug_members;
drop policy if exists "lovebug couple reads their strips" on public.lovebug_strips;
drop policy if exists "lovebug member adds own strips" on public.lovebug_strips;
drop policy if exists "lovebug member removes own strips" on public.lovebug_strips;
drop policy if exists "lovebug members download strips" on storage.objects;
drop policy if exists "lovebug members upload strips" on storage.objects;
drop policy if exists "lovebug uploader removes own strip image" on storage.objects;

-- Anonymous room participants also use the Postgres role 'authenticated'.
-- Cloud-photo permissions MUST inspect the is_anonymous JWT claim.
create or replace function public.lovebug_v6_permanent_user()
returns boolean language sql stable security invoker set search_path = '' as $$
  select (select auth.uid()) is not null
     and coalesce(((select auth.jwt())->>'is_anonymous')::boolean, true) = false;
$$;
revoke all on function public.lovebug_v6_permanent_user() from public, anon;
grant execute on function public.lovebug_v6_permanent_user() to authenticated;

create table if not exists public.lovebug_v6_couples (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'our little album' check (char_length(title) between 1 and 60),
  created_at timestamptz not null default now()
);
create index if not exists lovebug_v6_couples_owner_idx on public.lovebug_v6_couples(owner_id);
alter table public.lovebug_v6_couples enable row level security;

create table if not exists public.lovebug_v6_members (
  couple_id uuid not null references public.lovebug_v6_couples(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key(couple_id, user_id)
);
create index if not exists lovebug_v6_members_user_idx on public.lovebug_v6_members(user_id);
alter table public.lovebug_v6_members enable row level security;

-- Invitation hashes never leave the database. Each invitation is 64 random hex
-- digits and can be redeemed only once, within seven days.
create table if not exists public.lovebug_v6_invites (
  couple_id uuid primary key references public.lovebug_v6_couples(id) on delete cascade,
  invitation_hash text not null unique,
  expires_at timestamptz not null,
  redeemed_at timestamptz
);
alter table public.lovebug_v6_invites enable row level security;
revoke all on public.lovebug_v6_invites from public, anon, authenticated;

create or replace function public.lovebug_v6_is_member(p_couple uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.lovebug_v6_permanent_user() and exists (
    select 1 from public.lovebug_v6_members m
    where m.couple_id = p_couple and m.user_id = (select auth.uid())
  );
$$;
revoke all on function public.lovebug_v6_is_member(uuid) from public, anon;
grant execute on function public.lovebug_v6_is_member(uuid) to authenticated;

-- All membership mutations happen inside these locked, server-authorized RPCs.
create or replace function public.lovebug_v6_create_couple(p_invite text, p_title text default 'our little album')
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_couple uuid; v_title text; begin
  if not public.lovebug_v6_permanent_user() then raise exception 'Sign in to create a shared album'; end if;
  if p_invite is null or p_invite !~ '^[0-9a-f]{64}$' then raise exception 'Invalid invitation code'; end if;
  if (select count(*) from public.lovebug_v6_couples where owner_id = (select auth.uid())) >= 5 then
    raise exception 'A maximum of five shared albums can be created per account';
  end if;
  v_title := coalesce(nullif(btrim(p_title), ''), 'our little album');
  if char_length(v_title) > 60 then raise exception 'Album name is too long'; end if;
  insert into public.lovebug_v6_couples(owner_id,title)
  values ((select auth.uid()),v_title) returning id into v_couple;
  insert into public.lovebug_v6_members(couple_id,user_id)
  values (v_couple,(select auth.uid()));
  insert into public.lovebug_v6_invites(couple_id,invitation_hash,expires_at)
  values (v_couple,encode(sha256(convert_to(p_invite,'UTF8')),'hex'),now()+interval '7 days');
  return v_couple;
end;
$$;

create or replace function public.lovebug_v6_join_couple(p_invite text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_couple uuid; v_owner uuid; begin
  if not public.lovebug_v6_permanent_user() then raise exception 'Sign in before joining a shared album'; end if;
  if p_invite is null or p_invite !~ '^[0-9a-f]{64}$' then raise exception 'Invalid or expired invitation'; end if;
  -- Lock the couple, not just the invitation: two simultaneous joins must not
  -- admit a third person. The unique hash is not client-readable.
  select c.id,c.owner_id into v_couple,v_owner
  from public.lovebug_v6_couples c
  join public.lovebug_v6_invites i on i.couple_id=c.id
  where i.invitation_hash=encode(sha256(convert_to(p_invite,'UTF8')),'hex')
    and i.redeemed_at is null and i.expires_at > now()
  for update of c;
  if v_couple is null then raise exception 'Invalid or expired invitation'; end if;
  if v_owner = (select auth.uid()) then raise exception 'You already created this album'; end if;
  if (select count(*) from public.lovebug_v6_members where couple_id=v_couple) >= 2 then
    raise exception 'This album already has two people';
  end if;
  insert into public.lovebug_v6_members(couple_id,user_id)
  values (v_couple,(select auth.uid()));
  update public.lovebug_v6_invites set redeemed_at=now() where couple_id=v_couple;
  return v_couple;
end;
$$;

create or replace function public.lovebug_v6_rotate_invite(p_couple uuid,p_invite text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.lovebug_v6_permanent_user()
    or not exists (select 1 from public.lovebug_v6_couples where id=p_couple and owner_id=(select auth.uid()))
    then raise exception 'Only the album creator can renew an invitation'; end if;
  if p_invite is null or p_invite !~ '^[0-9a-f]{64}$' then raise exception 'Invalid invitation code'; end if;
  perform 1 from public.lovebug_v6_couples where id=p_couple for update;
  if (select count(*) from public.lovebug_v6_members where couple_id=p_couple) >= 2 then
    raise exception 'This album already has two people'; end if;
  insert into public.lovebug_v6_invites(couple_id,invitation_hash,expires_at,redeemed_at)
  values (p_couple,encode(sha256(convert_to(p_invite,'UTF8')),'hex'),now()+interval '7 days',null)
  on conflict (couple_id) do update set invitation_hash=excluded.invitation_hash,
    expires_at=excluded.expires_at,redeemed_at=null;
end;
$$;

revoke all on function public.lovebug_v6_create_couple(text,text),
  public.lovebug_v6_join_couple(text),public.lovebug_v6_rotate_invite(uuid,text)
  from public,anon;
grant execute on function public.lovebug_v6_create_couple(text,text),
  public.lovebug_v6_join_couple(text),public.lovebug_v6_rotate_invite(uuid,text)
  to authenticated;

create table if not exists public.lovebug_v6_photos (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  scope text not null check(scope in ('personal','shared')),
  couple_id uuid references public.lovebug_v6_couples(id) on delete cascade,
  created_at timestamptz not null default now(),
  theme text not null check (theme in ('strawberry','peach','lilac','mint')),
  note text not null default '' check(char_length(note) <= 240),
  object_path text not null unique,
  source_local_id uuid,
  check ((scope='personal' and couple_id is null) or (scope='shared' and couple_id is not null)),
  check (object_path = case when scope='personal' then
    'personal/'||owner_id::text||'/'||id::text||'.png'
    else 'shared/'||couple_id::text||'/'||id::text||'.png' end)
);
create index if not exists lovebug_v6_photos_scope_time_idx on public.lovebug_v6_photos(scope,couple_id,created_at desc);
create index if not exists lovebug_v6_photos_owner_idx on public.lovebug_v6_photos(owner_id,created_at desc);
create unique index if not exists lovebug_v6_personal_source_idx on public.lovebug_v6_photos(owner_id,source_local_id)
  where scope='personal' and source_local_id is not null;
create unique index if not exists lovebug_v6_shared_source_idx on public.lovebug_v6_photos(couple_id,owner_id,source_local_id)
  where scope='shared' and source_local_id is not null;
alter table public.lovebug_v6_photos enable row level security;

create policy "v6 members view couples" on public.lovebug_v6_couples
  for select to authenticated using (public.lovebug_v6_is_member(id));
create policy "v6 members view membership" on public.lovebug_v6_members
  for select to authenticated using (public.lovebug_v6_is_member(couple_id));
create policy "v6 owner and members view photos" on public.lovebug_v6_photos
  for select to authenticated using (public.lovebug_v6_permanent_user()
    and ((scope='personal' and owner_id=(select auth.uid()))
       or (scope='shared' and public.lovebug_v6_is_member(couple_id))));
create policy "v6 upload owns photos" on public.lovebug_v6_photos
  for insert to authenticated with check (public.lovebug_v6_permanent_user()
    and owner_id=(select auth.uid())
    and ((scope='personal' and couple_id is null)
       or (scope='shared' and public.lovebug_v6_is_member(couple_id))));
create policy "v6 uploader deletes own photos" on public.lovebug_v6_photos
  for delete to authenticated using (public.lovebug_v6_permanent_user()
    and owner_id=(select auth.uid()));

grant select on public.lovebug_v6_couples,public.lovebug_v6_members to authenticated;
grant select,insert,delete on public.lovebug_v6_photos to authenticated;

-- A completely new private bucket, so no v0.4 policy can accidentally expose it.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('lovebug-v6-private','lovebug-v6-private',false,10485760,array['image/png'])
on conflict (id) do update set public=false,file_size_limit=10485760,
  allowed_mime_types=array['image/png'];

create policy "v6 private photos read" on storage.objects
  for select to authenticated using (
    bucket_id='lovebug-v6-private' and public.lovebug_v6_permanent_user()
    and (
      ((storage.foldername(name))[1]='personal' and (storage.foldername(name))[2]=(select auth.uid())::text)
      or ((storage.foldername(name))[1]='shared' and exists (
        select 1 from public.lovebug_v6_members m
        where m.user_id=(select auth.uid())
          and m.couple_id::text=(storage.foldername(name))[2]
      ))
    )
  );
create policy "v6 private photos upload" on storage.objects
  for insert to authenticated with check (
    bucket_id='lovebug-v6-private' and public.lovebug_v6_permanent_user()
    and (
      ((storage.foldername(name))[1]='personal' and (storage.foldername(name))[2]=(select auth.uid())::text)
      or ((storage.foldername(name))[1]='shared' and exists (
        select 1 from public.lovebug_v6_members m
        where m.user_id=(select auth.uid())
          and m.couple_id::text=(storage.foldername(name))[2]
      ))
    )
  );
create policy "v6 private photos owner removal" on storage.objects
  for delete to authenticated using (
    bucket_id='lovebug-v6-private' and public.lovebug_v6_permanent_user()
    and owner_id=(select auth.uid())::text
  );

commit;
