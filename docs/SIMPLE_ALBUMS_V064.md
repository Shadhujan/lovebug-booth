# Lovebug Booth v0.6.4 - Our memories, without the clutter

**Base:** main `78dab8a` (v0.6.3). This patch is code + opt-in SQL; it does NOT mutate the hosted project automatically.

## What changes

- The only album destinations remain **On this device** and **Our shared album**.
- Every thumbnail is a photo plus a small date. Tap it for full-size viewing, downloading, cloud-backup action (device only) and permitted deletion.
- Device header: small cloud icon for private Google backups, small three-dot menu for ZIP download and clearing this browser. Private cloud backup still needs an explicit action; nothing uploads on its own.
- Shared header: info icon shows both people equally; three dots show Disconnect and the separate Google Sign out. No rename, owner label, old album picker, permanent Past shared memories, or repeated buttons.
- Preserve the original **private invitation code** flow. First show one Connect button; tapping reveals Invite someone / I have a code. New connections start empty.
- Either partner may add a photo directly from **On this device**. It becomes a separate shared copy.
- Either partner may **request** photo removal. The second partner sees a small approval card with photo in the shared album. Keep rejects; Remove approves. **Direct deletion of shared images is removed from client RLS.** An authenticated server function finishes the deletion only after both votes.
- Disconnect closes the pair for both accounts. A goodbye card gives both a ZIP-download option for 7 days. It is not a history view. Once a new connection starts, no previous photos appear. Existing local photos and separate private cloud backups are unchanged.
- The database prevents reading archived albums after 7 days; a new scheduled function deletes expired shared files using Storage API, then deletes records. Existing health scheduler and log are untouched.
- Live Together/Quick Rooms, locked PINs, camera feeds, independent editing, Photo Letters and health logic were deliberately not changed.

## Deployment sequence (important)

1. Check `git status --short`; apply the supplied patch on top of commit `78dab8a` using `git am <patch-file>`. Do not cherry-pick it on an unrelated state.
2. **First deploy the retired `lovebug-delete-album` endpoint** so no old creator-only client can delete an active pair and bypass mutual consent:

   ```powershell
   npx supabase@latest functions deploy lovebug-delete-album --project-ref cwmsqihdtxsfgmslavpk --no-verify-jwt
   ```

3. In Supabase SQL Editor, run **only** `supabase/migrations/20261013_008_shared_memory_consensus.sql`. This migration preserves existing records, adds consent requests, and blocks direct shared-photo deletion. Do not rerun previous migrations.
4. Provision a **new, separate** random token of at least 40 characters named `LOVEBUG_CLEANUP_GITHUB_TOKEN` in both GitHub Actions secrets and Supabase Edge Function secrets. Do not reuse, remove or replace either existing health token, and never put server secrets in `VITE_` variables. Deploy the two new functions:

   ```powershell
   npx supabase@latest functions deploy lovebug-photo-removal --project-ref cwmsqihdtxsfgmslavpk --no-verify-jwt
   npx supabase@latest functions deploy lovebug-memory-cleanup --project-ref cwmsqihdtxsfgmslavpk --no-verify-jwt
   ```

   The functions check credentials internally. The cleanup job cannot run until the new token is configured.
5. Run `npm install`, `npm run typecheck`, `npm run build`, and `npm run dev`. Verify the two-account scenarios before deploying the existing Vercel site. The separate cleanup GitHub Action runs daily; manually dispatch it once to confirm success. If not configured, access still expires at seven days, but physical Storage cleanup waits.
6. Cloud features require the existing Supabase environment variables and `VITE_LOVEBUG_CLOUD_ENABLED=true` where intentionally enabled.

## Important security and reliability tests (two independent Google accounts)

1. Invite/join using the **existing private code**. A new pair starts with no photos; a third account cannot read any files or names.
2. On-device gallery: photo/date only, open viewer, download, remove with confirmation, explicit private cloud backup and restore. Device ZIP and Clear All behind three dots. Verify 320px and 390px widths.
3. In the shared album, either member adds a saved local photo. Confirm the original device copy survives.
4. Both accounts can see the photo; both see the same info panel with no role labels.
5. Account A requests removal. Account B sees the approval **inside the album**, even after being offline; before approval neither can remove the file. B chooses Keep: file remains.
6. Retry removal and choose Remove from account B: file disappears for both. Attempt direct Supabase Storage DELETE or metadata DELETE as each account: both must be denied for a shared photo.
7. Disconnect as either member. Account B sees goodbye card on reload; both can download a ZIP during seven days. Sign out and sign back in does not disconnect.
8. A new connection is empty and does not display old memories, even while the old goodbye album is within its seven-day window.
9. After seven days, old photos and partner identity are unreadable through database and Storage RLS; the daily job purges files and expired album records. Do not move real clocks forward in production for this check: use a disposable test project/transaction.
10. Regression: Quick Room and Locked Room approval, both cameras, four combined photos, sticker synchronization. **Disconnect one participant during live editing and verify the other can finish locally.** Health checks must still pass.

## Fresh testing reset (optional and destructive)

Use `node scripts/reset-cloud-test-data.mjs` for a **dry run** (requires an admin key available only in your terminal). It lists objects in `lovebug-v6-private` and counts v6 album tables; it does not touch any content by default.

When you decide to permanently erase **all** cloud test photos and v6 connections for all Google accounts, set `LOVEBUG_RESET_CONFIRM=cwmsqihdtxsfgmslavpk` privately and add `--confirm`. Never commit an admin key. The script removes files through Supabase Storage API, then clears only the v6 test album tables (including pending approval requests). It never truncates `storage.objects` directly and never touches **secrets, auth users, `keep_alive_log`, live room signaling, or browser IndexedDB**.

The **older** `lovebug-private` bucket is skipped by default. Use `--include-legacy` only after separately confirming any prototype test photos can be destroyed; it does not clear legacy prototype SQL tables. Avoid running any reset until you have saved photographs you care about. Do not run it while someone is using a room/album.
