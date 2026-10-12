-- Lovebug Booth v0.6.2: shared albums are managed by their approved members.
-- No existing album, photo or storage object is deleted by this migration.
BEGIN;

-- A deletion is reserved before Storage objects are removed by the authorized
-- Edge Function. This blocks new shared uploads while deletion is in progress.
ALTER TABLE public.lovebug_v6_couples
  ADD COLUMN IF NOT EXISTS deleting_at timestamptz;

CREATE OR REPLACE FUNCTION public.lovebug_v6_rename_couple(p_couple uuid, p_title text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_title text;
BEGIN
  IF NOT public.lovebug_v6_permanent_user() THEN
    RAISE EXCEPTION 'Sign in with Google to rename an album';
  END IF;
  v_title := btrim(coalesce(p_title, ''));
  IF char_length(v_title) < 1 OR char_length(v_title) > 60 THEN
    RAISE EXCEPTION 'Album names must be between 1 and 60 characters';
  END IF;
  UPDATE public.lovebug_v6_couples c SET title=v_title
    WHERE c.id=p_couple AND c.deleting_at IS NULL
      AND EXISTS (SELECT 1 FROM public.lovebug_v6_members m
                  WHERE m.couple_id=c.id AND m.user_id=(SELECT auth.uid()));
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Only approved album members can rename this album';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.lovebug_v6_rename_couple(uuid,text) FROM public,anon;
GRANT EXECUTE ON FUNCTION public.lovebug_v6_rename_couple(uuid,text) TO authenticated;

-- Existing sharing permissions remain intact. Only *new* uploads into a
-- deleting album are prohibited, including via direct REST/Storage requests.
DROP POLICY IF EXISTS "v6 upload owns photos" ON public.lovebug_v6_photos;
CREATE POLICY "v6 upload owns photos" ON public.lovebug_v6_photos
  FOR INSERT TO authenticated WITH CHECK (
    public.lovebug_v6_permanent_user() AND owner_id=(SELECT auth.uid())
    AND ( (scope='personal' AND couple_id IS NULL)
       OR (scope='shared' AND public.lovebug_v6_is_member(couple_id)
         AND EXISTS (SELECT 1 FROM public.lovebug_v6_couples c
                     WHERE c.id=couple_id AND c.deleting_at IS NULL)) )
  );

DROP POLICY IF EXISTS "v6 private photos upload" ON storage.objects;
CREATE POLICY "v6 private photos upload" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id='lovebug-v6-private' AND public.lovebug_v6_permanent_user()
    AND ( ((storage.foldername(name))[1]='personal'
           AND (storage.foldername(name))[2]=(SELECT auth.uid())::text)
       OR ((storage.foldername(name))[1]='shared'
           AND EXISTS (
             SELECT 1 FROM public.lovebug_v6_members m
             JOIN public.lovebug_v6_couples c ON c.id=m.couple_id
             WHERE m.user_id=(SELECT auth.uid()) AND c.deleting_at IS NULL
               AND m.couple_id::text=(storage.foldername(name))[2]
           )) )
  );
COMMIT;
