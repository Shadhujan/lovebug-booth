-- Lovebug Booth v0.6.1 - identity and naming for two-person cloud albums.
-- Run AFTER 20261013_004_cloud_albums_v6.sql. No existing photos, memberships,
-- invitations, or storage objects are deleted or changed by this migration.
BEGIN;

-- Deliberately restricted to one album at a time. Do not expose the raw auth.users
-- table or store email addresses in a browser-readable public membership table.
CREATE OR REPLACE FUNCTION public.lovebug_v6_album_members(p_couple uuid)
RETURNS TABLE (
  user_id uuid,
  display_name text,
  email text,
  is_owner boolean,
  joined_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT m.user_id,
         left(coalesce(
           nullif(btrim(u.raw_user_meta_data->>'full_name'), ''),
           nullif(btrim(u.raw_user_meta_data->>'name'), ''),
           split_part(coalesce(u.email, 'lovebug'), '@', 1)
         ), 80)::text AS display_name,
         coalesce(u.email, '')::text AS email,
         (c.owner_id = m.user_id) AS is_owner,
         m.joined_at
    FROM public.lovebug_v6_members m
    JOIN public.lovebug_v6_couples c ON c.id = m.couple_id
    JOIN auth.users u ON u.id = m.user_id
   WHERE m.couple_id = p_couple
     AND public.lovebug_v6_permanent_user()
     AND EXISTS (
       SELECT 1 FROM public.lovebug_v6_members own
       WHERE own.couple_id = p_couple AND own.user_id = (SELECT auth.uid())
     )
   ORDER BY m.joined_at ASC;
$$;
REVOKE ALL ON FUNCTION public.lovebug_v6_album_members(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.lovebug_v6_album_members(uuid) TO authenticated;

-- The create-album field is NOT an editor. Renaming is explicit, available only
-- to the album owner, and doesn't allow changes to any other columns.
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
  UPDATE public.lovebug_v6_couples
     SET title = v_title
   WHERE id = p_couple AND owner_id = (SELECT auth.uid());
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Only the album creator can rename this album';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.lovebug_v6_rename_couple(uuid,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.lovebug_v6_rename_couple(uuid,text) TO authenticated;

COMMIT;
