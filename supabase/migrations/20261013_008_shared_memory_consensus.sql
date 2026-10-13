-- Lovebug Booth v0.6.4: equal shared-photo removal; seven-day goodbye.
-- Non-destructive migration. Apply only AFTER v0.6.3 (007).
BEGIN;

ALTER TABLE public.lovebug_v6_couples
  ADD COLUMN IF NOT EXISTS recovery_until timestamptz;
UPDATE public.lovebug_v6_couples
  SET recovery_until = archived_at + INTERVAL '7 days'
  WHERE archived_at IS NOT NULL AND recovery_until IS NULL;

-- A former partner can read an archived album for seven days, then nothing:
-- no lingering photo, Storage, membership, album metadata or identity access.
CREATE OR REPLACE FUNCTION public.lovebug_v6_is_member(p_couple uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT public.lovebug_v6_permanent_user() AND EXISTS (
    SELECT 1 FROM public.lovebug_v6_members m
    JOIN public.lovebug_v6_couples c ON c.id = m.couple_id
    WHERE m.couple_id = p_couple AND m.user_id = (SELECT auth.uid())
      AND (c.archived_at IS NULL OR c.recovery_until > now())
  );
$$;
REVOKE ALL ON FUNCTION public.lovebug_v6_is_member(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lovebug_v6_is_member(uuid) TO authenticated;

-- v0.6.3 disconnect's preserved rows now receive an expiry timestamp.
CREATE OR REPLACE FUNCTION public.lovebug_v6_disconnect(p_couple uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT public.lovebug_v6_permanent_user() THEN RAISE EXCEPTION 'Google sign-in required'; END IF;
  PERFORM 1 FROM public.lovebug_v6_couples WHERE id=p_couple FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Album not found'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.lovebug_v6_active_links a
    JOIN public.lovebug_v6_members m ON m.couple_id=a.couple_id AND m.user_id=a.user_id
    WHERE a.user_id=(SELECT auth.uid()) AND a.couple_id=p_couple)
  THEN RAISE EXCEPTION 'You are not connected to this album'; END IF;
  UPDATE public.lovebug_v6_couples
    SET archived_at=now(), recovery_until=now()+interval '7 days'
    WHERE id=p_couple AND archived_at IS NULL;
  UPDATE public.lovebug_v6_active_links SET couple_id=NULL,updated_at=now() WHERE couple_id=p_couple;
  UPDATE public.lovebug_v6_invites SET redeemed_at=now() WHERE couple_id=p_couple;
END;
$$;

-- Preserve the v0.6.1 RPC shape but never expose old partner identities after expiry.
CREATE OR REPLACE FUNCTION public.lovebug_v6_album_members(p_couple uuid)
RETURNS TABLE(user_id uuid,display_name text,email text,is_owner boolean,joined_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT m.user_id,
         left(coalesce(nullif(btrim(u.raw_user_meta_data->>'full_name'), ''),
                       nullif(btrim(u.raw_user_meta_data->>'name'), ''),
                       split_part(coalesce(u.email, 'lovebug'), '@', 1)),80)::text,
         coalesce(u.email,'')::text, (c.owner_id=m.user_id), m.joined_at
  FROM public.lovebug_v6_members m
  JOIN public.lovebug_v6_couples c ON c.id=m.couple_id
  JOIN auth.users u ON u.id=m.user_id
  WHERE m.couple_id=p_couple AND public.lovebug_v6_is_member(p_couple)
  ORDER BY m.joined_at ASC;
$$;
REVOKE ALL ON FUNCTION public.lovebug_v6_album_members(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.lovebug_v6_album_members(uuid) TO authenticated;

-- Storage SELECT must match the same seven-day deadline as table RLS.
DROP POLICY IF EXISTS "v6 private photos read" ON storage.objects;
CREATE POLICY "v6 private photos read" ON storage.objects FOR SELECT TO authenticated USING (
  bucket_id='lovebug-v6-private' AND public.lovebug_v6_permanent_user() AND (
    ((storage.foldername(name))[1]='personal' AND
     (storage.foldername(name))[2]=(SELECT auth.uid())::text)
    OR ((storage.foldername(name))[1]='shared' AND EXISTS (
      SELECT 1 FROM public.lovebug_v6_members m
      JOIN public.lovebug_v6_couples c ON c.id=m.couple_id
      WHERE m.user_id=(SELECT auth.uid())
        AND m.couple_id::text=(storage.foldername(name))[2]
        AND (c.archived_at IS NULL OR c.recovery_until>now())
    ))
  )
);

-- Prevent either user from deleting shared photos or files directly; this must
-- instead be a two-party request finalized by the authenticated Edge Function.
DROP POLICY IF EXISTS "v6 uploader deletes own photos" ON public.lovebug_v6_photos;
CREATE POLICY "v6 uploader deletes own photos" ON public.lovebug_v6_photos
FOR DELETE TO authenticated USING (
  public.lovebug_v6_permanent_user() AND owner_id=(SELECT auth.uid()) AND scope='personal'
);
DROP POLICY IF EXISTS "v6 private photos owner removal" ON storage.objects;
CREATE POLICY "v6 private photos owner removal" ON storage.objects FOR DELETE TO authenticated USING (
  bucket_id='lovebug-v6-private' AND public.lovebug_v6_permanent_user()
  AND owner_id=(SELECT auth.uid())::text AND (storage.foldername(name))[1]='personal'
  AND (storage.foldername(name))[2]=(SELECT auth.uid())::text
);

CREATE TABLE IF NOT EXISTS public.lovebug_v6_removal_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  couple_id uuid NOT NULL REFERENCES public.lovebug_v6_couples(id) ON DELETE CASCADE,
  photo_id uuid REFERENCES public.lovebug_v6_photos(id) ON DELETE SET NULL,
  requested_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','declined','completed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS lovebug_v6_open_removal_idx
  ON public.lovebug_v6_removal_requests(photo_id)
  WHERE status IN ('pending','approved','completed') AND photo_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS lovebug_v6_removal_couple_idx
  ON public.lovebug_v6_removal_requests(couple_id,created_at DESC);
ALTER TABLE public.lovebug_v6_removal_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lovebug_v6_removal_requests FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.lovebug_v6_removal_requests TO authenticated;
CREATE POLICY "v6 current pair sees removal requests" ON public.lovebug_v6_removal_requests
FOR SELECT TO authenticated USING (
  public.lovebug_v6_permanent_user() AND public.lovebug_v6_is_member(couple_id)
  AND EXISTS (SELECT 1 FROM public.lovebug_v6_couples c
              WHERE c.id=couple_id AND c.archived_at IS NULL AND c.deleting_at IS NULL)
);

CREATE OR REPLACE FUNCTION public.lovebug_v6_request_photo_removal(p_photo uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_couple uuid; v_request uuid;
BEGIN
  IF NOT public.lovebug_v6_permanent_user() THEN RAISE EXCEPTION 'Google sign-in required'; END IF;
  SELECT p.couple_id INTO v_couple FROM public.lovebug_v6_photos p
    WHERE p.id=p_photo AND p.scope='shared' FOR UPDATE;
  IF v_couple IS NULL THEN RAISE EXCEPTION 'Shared photo not found'; END IF;
  IF NOT public.lovebug_v6_is_member(v_couple) OR NOT EXISTS (
    SELECT 1 FROM public.lovebug_v6_couples c
    WHERE c.id=v_couple AND c.archived_at IS NULL AND c.deleting_at IS NULL)
    OR (SELECT count(*) FROM public.lovebug_v6_members WHERE couple_id=v_couple)<>2
  THEN RAISE EXCEPTION 'Both connected people are required'; END IF;
  IF EXISTS (SELECT 1 FROM public.lovebug_v6_removal_requests
             WHERE photo_id=p_photo AND status IN ('pending','approved','completed'))
  THEN RAISE EXCEPTION 'Already waiting for your person to respond'; END IF;
  INSERT INTO public.lovebug_v6_removal_requests(couple_id,photo_id,requested_by)
  VALUES(v_couple,p_photo,(SELECT auth.uid())) RETURNING id INTO v_request;
  RETURN v_request;
END;
$$;

CREATE OR REPLACE FUNCTION public.lovebug_v6_review_photo_removal(p_request uuid,p_approve boolean)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_request public.lovebug_v6_removal_requests%ROWTYPE;
BEGIN
  IF NOT public.lovebug_v6_permanent_user() THEN RAISE EXCEPTION 'Google sign-in required'; END IF;
  SELECT * INTO v_request FROM public.lovebug_v6_removal_requests WHERE id=p_request FOR UPDATE;
  IF NOT FOUND OR v_request.status<>'pending' THEN RAISE EXCEPTION 'Request is no longer pending'; END IF;
  IF v_request.requested_by=(SELECT auth.uid()) THEN RAISE EXCEPTION 'Your person must decide'; END IF;
  IF NOT public.lovebug_v6_is_member(v_request.couple_id) OR NOT EXISTS (
    SELECT 1 FROM public.lovebug_v6_couples c
    WHERE c.id=v_request.couple_id AND c.archived_at IS NULL AND c.deleting_at IS NULL)
  THEN RAISE EXCEPTION 'This shared album is no longer active'; END IF;
  UPDATE public.lovebug_v6_removal_requests
     SET status=CASE WHEN p_approve THEN 'approved' ELSE 'declined' END, resolved_at=now()
   WHERE id=p_request;
  RETURN CASE WHEN p_approve THEN 'approved' ELSE 'declined' END;
END;
$$;
REVOKE ALL ON FUNCTION public.lovebug_v6_request_photo_removal(uuid),
  public.lovebug_v6_review_photo_removal(uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.lovebug_v6_request_photo_removal(uuid),
  public.lovebug_v6_review_photo_removal(uuid,boolean) TO authenticated;

COMMIT;
