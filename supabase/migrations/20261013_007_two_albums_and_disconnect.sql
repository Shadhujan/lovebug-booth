-- v0.6.3: one current connection, read-only former connections, opt-in cloud copies.
-- This migration NEVER deletes or transfers photos, Storage files, or memberships.
BEGIN;

ALTER TABLE public.lovebug_v6_couples ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE TABLE IF NOT EXISTS public.lovebug_v6_active_links (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  couple_id uuid REFERENCES public.lovebug_v6_couples(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.lovebug_v6_active_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lovebug_v6_active_links FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.lovebug_v6_active_links TO authenticated;
DROP POLICY IF EXISTS "v6 user sees their link" ON public.lovebug_v6_active_links;
CREATE POLICY "v6 user sees their link" ON public.lovebug_v6_active_links FOR SELECT TO authenticated
USING (public.lovebug_v6_permanent_user() AND user_id=(SELECT auth.uid()));

-- Attach legacy pairs without destroying their other albums. Prefer the most
-- recently created completed pair and never assign a user to two active pairs.
DO $$
DECLARE pair record;
BEGIN
  FOR pair IN
    SELECT c.id FROM public.lovebug_v6_couples c
    JOIN public.lovebug_v6_members m ON m.couple_id=c.id
    WHERE c.archived_at IS NULL AND c.deleting_at IS NULL
    GROUP BY c.id,c.created_at HAVING count(*)=2
    ORDER BY c.created_at DESC
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.lovebug_v6_active_links a
      JOIN public.lovebug_v6_members m ON m.user_id=a.user_id
      WHERE m.couple_id=pair.id AND a.couple_id IS NOT NULL
    ) THEN
      INSERT INTO public.lovebug_v6_active_links(user_id,couple_id)
      SELECT user_id,pair.id FROM public.lovebug_v6_members WHERE couple_id=pair.id
      ON CONFLICT (user_id) DO NOTHING;
    END IF;
  END LOOP;
  -- Preserve an unredeemed invitation if the creator isn't connected yet.
  INSERT INTO public.lovebug_v6_active_links(user_id,couple_id)
  SELECT DISTINCT ON (c.owner_id) c.owner_id,c.id
  FROM public.lovebug_v6_couples c
  WHERE c.archived_at IS NULL AND c.deleting_at IS NULL
  ORDER BY c.owner_id,c.created_at DESC
  ON CONFLICT (user_id) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.lovebug_v6_my_active_couple()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT c.id FROM public.lovebug_v6_active_links a
  JOIN public.lovebug_v6_couples c ON c.id=a.couple_id
  JOIN public.lovebug_v6_members m ON m.couple_id=c.id AND m.user_id=a.user_id
  WHERE a.user_id=(SELECT auth.uid()) AND public.lovebug_v6_permanent_user()
    AND c.archived_at IS NULL AND c.deleting_at IS NULL
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.lovebug_v6_my_active_couple() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.lovebug_v6_my_active_couple() TO authenticated;

CREATE OR REPLACE FUNCTION public.lovebug_v6_create_couple(p_invite text,p_title text DEFAULT 'our little album')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_couple uuid; v_title text; v_uid uuid:=(SELECT auth.uid());
BEGIN
  IF NOT public.lovebug_v6_permanent_user() THEN RAISE EXCEPTION 'Google sign-in required'; END IF;
  IF p_invite IS NULL OR p_invite !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'Invalid invitation'; END IF;
  -- Serialize concurrent create/join requests by this account.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_uid::text,0));
  IF public.lovebug_v6_my_active_couple() IS NOT NULL THEN
    RAISE EXCEPTION 'Disconnect from your current album before connecting with someone new';
  END IF;
  v_title:=coalesce(nullif(btrim(p_title),''),'our little album');
  IF char_length(v_title)>60 THEN RAISE EXCEPTION 'Album name is too long'; END IF;
  INSERT INTO public.lovebug_v6_couples(owner_id,title) VALUES(v_uid,v_title) RETURNING id INTO v_couple;
  INSERT INTO public.lovebug_v6_members(couple_id,user_id) VALUES(v_couple,v_uid);
  INSERT INTO public.lovebug_v6_invites(couple_id,invitation_hash,expires_at)
  VALUES(v_couple,encode(sha256(convert_to(p_invite,'UTF8')),'hex'),now()+interval '7 days');
  INSERT INTO public.lovebug_v6_active_links(user_id,couple_id,updated_at)
  VALUES(v_uid,v_couple,now()) ON CONFLICT(user_id) DO UPDATE
  SET couple_id=excluded.couple_id,updated_at=now();
  RETURN v_couple;
END;
$$;

CREATE OR REPLACE FUNCTION public.lovebug_v6_join_couple(p_invite text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_couple uuid; v_owner uuid; v_uid uuid:=(SELECT auth.uid());
BEGIN
  IF NOT public.lovebug_v6_permanent_user() THEN RAISE EXCEPTION 'Google sign-in required'; END IF;
  IF p_invite IS NULL OR p_invite !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'Invalid or expired invitation'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_uid::text,0));
  IF public.lovebug_v6_my_active_couple() IS NOT NULL THEN
    RAISE EXCEPTION 'Disconnect from your current album before connecting with someone new';
  END IF;
  SELECT c.id,c.owner_id INTO v_couple,v_owner
  FROM public.lovebug_v6_couples c JOIN public.lovebug_v6_invites i ON i.couple_id=c.id
  WHERE i.invitation_hash=encode(sha256(convert_to(p_invite,'UTF8')),'hex')
  AND i.redeemed_at IS NULL AND i.expires_at>now()
  AND c.archived_at IS NULL AND c.deleting_at IS NULL
  FOR UPDATE OF c;
  IF v_couple IS NULL THEN RAISE EXCEPTION 'Invalid or expired invitation'; END IF;
  IF v_owner=v_uid THEN RAISE EXCEPTION 'You created this invitation'; END IF;
  IF (SELECT count(*) FROM public.lovebug_v6_members WHERE couple_id=v_couple)>=2 THEN
    RAISE EXCEPTION 'This album already has two members';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.lovebug_v6_active_links WHERE user_id=v_owner AND couple_id=v_couple) THEN
    RAISE EXCEPTION 'This invitation is no longer active';
  END IF;
  INSERT INTO public.lovebug_v6_members(couple_id,user_id) VALUES(v_couple,v_uid);
  INSERT INTO public.lovebug_v6_active_links(user_id,couple_id,updated_at)
  VALUES(v_uid,v_couple,now()) ON CONFLICT(user_id) DO UPDATE
  SET couple_id=excluded.couple_id,updated_at=now();
  UPDATE public.lovebug_v6_invites SET redeemed_at=now() WHERE couple_id=v_couple;
  RETURN v_couple;
END;
$$;

CREATE OR REPLACE FUNCTION public.lovebug_v6_rotate_invite(p_couple uuid,p_invite text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NOT public.lovebug_v6_permanent_user() OR
     NOT EXISTS(SELECT 1 FROM public.lovebug_v6_couples c
       JOIN public.lovebug_v6_active_links a ON a.couple_id=c.id AND a.user_id=c.owner_id
       WHERE c.id=p_couple AND c.owner_id=(SELECT auth.uid()) AND c.archived_at IS NULL AND c.deleting_at IS NULL)
  THEN RAISE EXCEPTION 'Only the connected creator can renew the invitation'; END IF;
  IF p_invite IS NULL OR p_invite !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'Invalid invitation'; END IF;
  PERFORM 1 FROM public.lovebug_v6_couples WHERE id=p_couple FOR UPDATE;
  IF (SELECT count(*) FROM public.lovebug_v6_members WHERE couple_id=p_couple)>=2 THEN
    RAISE EXCEPTION 'This album already has two members'; END IF;
  INSERT INTO public.lovebug_v6_invites(couple_id,invitation_hash,expires_at,redeemed_at)
  VALUES(p_couple,encode(sha256(convert_to(p_invite,'UTF8')),'hex'),now()+interval '7 days',NULL)
  ON CONFLICT(couple_id) DO UPDATE SET invitation_hash=excluded.invitation_hash,
    expires_at=excluded.expires_at,redeemed_at=NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.lovebug_v6_rename_couple(p_couple uuid,p_title text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_title text:=btrim(coalesce(p_title,''));
BEGIN
  IF NOT public.lovebug_v6_permanent_user() THEN RAISE EXCEPTION 'Google sign-in required'; END IF;
  IF char_length(v_title)<1 OR char_length(v_title)>60 THEN RAISE EXCEPTION 'Album names must be 1-60 characters'; END IF;
  UPDATE public.lovebug_v6_couples c SET title=v_title
  WHERE c.id=p_couple AND c.archived_at IS NULL AND c.deleting_at IS NULL
    AND EXISTS(SELECT 1 FROM public.lovebug_v6_active_links a
      WHERE a.user_id=(SELECT auth.uid()) AND a.couple_id=c.id)
    AND EXISTS(SELECT 1 FROM public.lovebug_v6_members m
      WHERE m.user_id=(SELECT auth.uid()) AND m.couple_id=c.id);
  IF NOT FOUND THEN RAISE EXCEPTION 'Only current members can rename the album'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.lovebug_v6_disconnect(p_couple uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NOT public.lovebug_v6_permanent_user() THEN RAISE EXCEPTION 'Google sign-in required'; END IF;
  -- Lock against joining; preserve all memberships and photos for independent recovery.
  PERFORM 1 FROM public.lovebug_v6_couples WHERE id=p_couple FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Album not found'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.lovebug_v6_active_links a
     JOIN public.lovebug_v6_members m ON m.couple_id=a.couple_id AND m.user_id=a.user_id
     WHERE a.user_id=(SELECT auth.uid()) AND a.couple_id=p_couple)
  THEN RAISE EXCEPTION 'You are not connected to this album'; END IF;
  UPDATE public.lovebug_v6_couples SET archived_at=now()
  WHERE id=p_couple AND archived_at IS NULL;
  UPDATE public.lovebug_v6_active_links SET couple_id=NULL,updated_at=now() WHERE couple_id=p_couple;
  UPDATE public.lovebug_v6_invites SET redeemed_at=now() WHERE couple_id=p_couple;
END;
$$;
REVOKE ALL ON FUNCTION public.lovebug_v6_create_couple(text,text),public.lovebug_v6_join_couple(text),
  public.lovebug_v6_rotate_invite(uuid,text),public.lovebug_v6_rename_couple(uuid,text),
  public.lovebug_v6_disconnect(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.lovebug_v6_create_couple(text,text),public.lovebug_v6_join_couple(text),
  public.lovebug_v6_rotate_invite(uuid,text),public.lovebug_v6_rename_couple(uuid,text),
  public.lovebug_v6_disconnect(uuid) TO authenticated;

-- Archived photos remain readable by BOTH previous members for recovery, but
-- they cannot be silently changed or removed by either member.
DROP POLICY IF EXISTS "v6 upload owns photos" ON public.lovebug_v6_photos;
CREATE POLICY "v6 upload owns photos" ON public.lovebug_v6_photos FOR INSERT TO authenticated WITH CHECK (
  public.lovebug_v6_permanent_user() AND owner_id=(SELECT auth.uid())
  AND ((scope='personal' AND couple_id IS NULL) OR (scope='shared' AND
  public.lovebug_v6_is_member(couple_id) AND EXISTS (
    SELECT 1 FROM public.lovebug_v6_couples c
    WHERE c.id=couple_id AND c.archived_at IS NULL AND c.deleting_at IS NULL)))
);
DROP POLICY IF EXISTS "v6 uploader deletes own photos" ON public.lovebug_v6_photos;
CREATE POLICY "v6 uploader deletes own photos" ON public.lovebug_v6_photos FOR DELETE TO authenticated USING (
  public.lovebug_v6_permanent_user() AND owner_id=(SELECT auth.uid()) AND
  (scope='personal' OR EXISTS (
    SELECT 1 FROM public.lovebug_v6_couples c
    WHERE c.id=couple_id AND c.archived_at IS NULL AND c.deleting_at IS NULL))
);
DROP POLICY IF EXISTS "v6 private photos upload" ON storage.objects;
CREATE POLICY "v6 private photos upload" ON storage.objects FOR INSERT TO authenticated WITH CHECK (
  bucket_id='lovebug-v6-private' AND public.lovebug_v6_permanent_user()
  AND (((storage.foldername(name))[1]='personal' AND (storage.foldername(name))[2]=(SELECT auth.uid())::text)
  OR ((storage.foldername(name))[1]='shared' AND EXISTS (
    SELECT 1 FROM public.lovebug_v6_members m
    JOIN public.lovebug_v6_couples c ON c.id=m.couple_id
    WHERE m.user_id=(SELECT auth.uid()) AND c.archived_at IS NULL AND c.deleting_at IS NULL
      AND m.couple_id::text=(storage.foldername(name))[2])))
);
DROP POLICY IF EXISTS "v6 private photos owner removal" ON storage.objects;
CREATE POLICY "v6 private photos owner removal" ON storage.objects FOR DELETE TO authenticated USING (
  bucket_id='lovebug-v6-private' AND public.lovebug_v6_permanent_user()
  AND owner_id=(SELECT auth.uid())::text AND
  (((storage.foldername(name))[1]='personal') OR
   ((storage.foldername(name))[1]='shared' AND EXISTS (
      SELECT 1 FROM public.lovebug_v6_couples c
      WHERE c.id::text=(storage.foldername(name))[2]
      AND c.archived_at IS NULL AND c.deleting_at IS NULL)))
);
COMMIT;
