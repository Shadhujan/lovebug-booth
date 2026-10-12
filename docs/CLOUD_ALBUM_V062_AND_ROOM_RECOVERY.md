# Lovebug Booth v0.6.2 — room recovery and calmer cloud albums

This patch applies after **v0.6.1**. Do not run an older migration again.

## Why this update exists

The approved Quick Room sometimes connected neither camera after Google/cloud setup. Server Realtime logs showed repeated Presence-handler errors, so the live room now discovers its peer by a tiny private Broadcast `hello`. It keeps the same server-approved membership, the same private `lovebug-secure:<room-id>` topic, the same WebRTC video and shared sticker channels, and the same offline editing fallback. It does **not** create an unsecured public channel or upload photos to Supabase.

The album now has a single visible navigation row: **On this device · Private album · Our shared album**. The shared view shows one selected partner and a recognizable name; older test albums are still accessible in a collapsed recovery menu. A new invitation is only needed if there is no album yet. Photos can be opened large, downloaded, and deleted by their uploader. Either approved member can rename a shared album.

## Apply and validate locally

```powershell
# Run in D:\Projects\lovebug-booth, after v0.6.1

git status --short
git am "$env:USERPROFILE\Downloads\Lovebug_Booth_v0.6.2_Room_Recovery_and_Simple_Albums_git-am.patch"
npm run typecheck
npm run build
npm run dev
```

Do **not** deploy to the public Vercel project until the two-device regression tests pass.

## Supabase setup (once)

1. Run `supabase/migrations/20261013_006_cloud_album_simplify.sql` in the SQL Editor. It changes album rename permissions so **either approved member** can rename, and prevents new uploads while an album is being deleted. It does **not** delete any existing photos, albums, accounts, or storage objects.
2. Deploy the new protected function:

```powershell
npx supabase@latest functions deploy lovebug-delete-album --project-ref cwmsqihdtxsfgmslavpk --no-verify-jwt
```

The `--no-verify-jwt` flag is specific to this function: it performs user-token validation with `auth.getUser` itself. The service role key stays **only in Supabase Edge Function secrets**, never in the Vite env or GitHub. Supabase normally provides `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` inside hosted Edge Functions.

3. Verify Google Sign-In is still enabled, Anonymous Sign-Ins remain enabled, the private Realtime RLS policies are still in place, and the v0.6.2 SQL migration has succeeded. No Realtime SQL policy changes are needed.

### Deleting a shared album

Only the creator can **delete the entire album**, with a typed-name confirmation. It deletes shared Storage objects through the Storage API and then removes its database membership, invite and photo records. Both people lose access to those shared copies. Personal cloud photos and local browser photos are not touched. An album with over 500 shared photos is blocked from automated deletion to avoid a timeout; contact support / handle the large gallery separately.

If a network/Storage error interrupts deletion, refresh and retry the **same** selected album. New shared uploads are blocked during deletion. Never manually delete `storage.objects` through SQL: that would leave orphaned files.

### Important: existing multiple albums

v0.6.1 allowed users to create several albums, some with duplicate names. This patch does **not** erase or merge them automatically. An already connected pair is preferred when the page loads; earlier albums remain in a collapsed **Other albums from earlier versions** selector. Delete old test albums deliberately, after saving any photos you wish to keep. Do not confuse the shared album's name with its unique ID.

## Acceptance checklist (two separate browsers/devices)

- [ ] Create Quick Room **without** signing into Google; see the join request even when scrolled down.
- [ ] Approve the guest; both browsers discover each other and both camera feeds display.
- [ ] Create a Locked Room; bad PIN is rejected and valid PIN still requires approval.
- [ ] A third person cannot join a room with two approved participants.
- [ ] Make four combined photos and decorate together; sticker movement, undo, finish notices, and mobile layout still work.
- [ ] **Disconnect one participant during editing and confirm the other can finish locally.** Mandatory regression check; never remove this.
- [ ] Sign into Google on both browser profiles; using the **same Google account** on two devices shows the same Private album photos.
- [ ] Connect two **different** accounts; both see their names, only those accounts can view shared photos, and the third account is denied.
- [ ] Both members can rename Our shared album; refresh the other browser to confirm.
- [ ] Private cloud photo is still private; sharing creates a deliberate copy in Our shared album.
- [ ] Tap a cloud photo to open full-size, then download it. Uploader can delete their own photo.
- [ ] Creator can delete a *test* shared album with a typed confirmation; the other member then loses that album and its shared photos. Personal and device photos remain.
- [ ] Reload at 320px, 390px and desktop widths; all cloud controls remain reachable and nothing scrolls horizontally.
- [ ] GitHub Actions + your 4-hour cron keep-alive still pass; this patch never modifies them.

## If secure signaling still fails

The private room remains RLS-protected, even while the Realtime provider is having technical issues. If both devices get "Secure room connection interrupted," please save the browser console details (`CHANNEL_ERROR`/`TIMED_OUT`, network WebSocket close code), and check Supabase Realtime logs. Avoid switching Realtime public access ON as a workaround.

No changes to the v0.5 room SQL are required. Offline Photo Letters always remains available as fallback.
