# Lovebug Booth v0.6.1 - Cloud Album clarity and sharing

This patch applies **on top of v0.6**. No existing albums, membership records, private photos, invite hashes or stored objects are removed.

## Why this update

- Google-hosted consent screen displays the Supabase auth domain by default. The project reference is not a client secret. Set **Google Auth Platform > Branding** to Lovebug Booth if desired, but changing the auth host shown in Google's consent UI generally needs a Supabase custom auth domain (paid).
- Previously, only photos saved in **this browser's local album** could be uploaded to cloud albums. A previously uploaded personal cloud photo had no share action.
- Duplicate album names such as `test` gave identical dropdown options, and the always-visible **Create a shared album** field looked like an editable selected-album name.
- Shared albums showed no member identity. Users couldn't tell who they were about to share their pictures with.

## Apply

1. Apply the Git AM patch on top of v0.6; check `git status --short` beforehand.
2. In Supabase SQL Editor run `supabase/migrations/20261013_005_cloud_albums_v061.sql` **after** the v0.6 migration (`004`). It only adds two restricted functions.
3. Restart the local Vite app with `VITE_LOVEBUG_CLOUD_ENABLED=true` in `.env.local`.
4. Run `npm run typecheck` and `npm run build`. Do not enable production cloud saving until the checks below pass.
5. When ready, `git push origin main`; Vercel deploys the new frontend if Git integration is active.

### New database functions

- `lovebug_v6_album_members(p_couple uuid)`: returns only that album's two approved permanent members (name, email, creator marker). A third account or temporary anonymous room user gets no rows. Email addresses are not copied into `public.lovebug_v6_members`.
- `lovebug_v6_rename_couple(p_couple uuid, p_title text)`: updates only the selected album's title, only by its creator, enforcing a 1-60 character limit.

Both are `SECURITY DEFINER` functions with their access explicitly limited to signed-in sessions and further checked for the `is_anonymous` claim. Do **not** make these RPCs public or change their authorization logic.

## What changed for users

1. Choose **My private photos**. Pick the destination in **When sharing a private photo, send a copy to** and click **Share a copy** on the photo. Confirm the exact album before sharing. This uploads a new, separately authorized object to the selected shared album. It does **not** remove or make public the personal original.
2. Choose **Shared with someone**. The selected album's name, creation date, creator, and both members' Google names/emails appear. The member card polls every 30 seconds when the page is visible, so the host can see when a second member joins. Use **Refresh** to load photos shared by the other person.
3. The album dropdown shows title + creation date + an identifying short suffix, even when names are repeated.
4. The **Create another album** and **Join a different album** forms are collapsed when an album exists, making it clear they're actions for a *different* album. The owner can instead choose **Rename** on the active album.
5. If this browser has no local strips, the Shared view points to **My private photos** so users can copy an existing cloud strip instead of taking pictures again.

## Two-account tests (required)

- [ ] Google OAuth returns to the album on desktop and phone.
- [ ] Private photo saved on device A appears on device B **when signed into the same Google account** (not a different account). Use Refresh if needed.
- [ ] Account A creates a shared album, account B joins with its one-time invitation.
- [ ] A sees **B's Google name/email** and B sees A's, with creator/joined labels.
- [ ] A creates *two albums with the same title*. Both are distinguishable in the picker. Switching selection changes the active title and membership cards; the create-new field never pretends to rename the selected album.
- [ ] A (creator) renames a selected album; B sees that new title after refreshing.
- [ ] A shares a photo already stored in *My private photos* to the shared album. B refreshes and downloads it. A's personal original is still private.
- [ ] B can independently upload a local strip to their shared album, and A can download it.
- [ ] A third, uninvited Google account cannot list the shared album, call `lovebug_v6_album_members` to obtain names/emails, or download objects from the private storage bucket.
- [ ] An anonymous Quick Room guest also cannot call album-member or rename RPCs or access cloud photos.
- [ ] Ordinary guest photos, local backups, stickers and the Health/Keep-Alive job still work.
- [ ] **Disconnect one participant during editing and confirm the other can finish locally.** Never remove this regression test.

## Known boundaries

- Members' Google name and email are intentionally shown only to the other approved member of their shared album, so they can verify they joined the right person.
- Shared-photo uploads make a separate copy in a private bucket. There's no automatic copying, public link, or move from personal storage. Deleting the shared copy does not delete the private original, and vice versa.
- This version doesn't add full cloud account deletion, restore, or storage quotas. Those are required before wide public cloud release.
- The original single-couple v0.4 prototype remains dormant. It should not be reopened to public users.
- Google consent branding: https://supabase.com/docs/guides/auth/social-login/auth-google and https://supabase.com/docs/guides/platform/custom-domains
