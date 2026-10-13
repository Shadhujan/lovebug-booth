# Lovebug Booth v0.6.3 — Two albums, safe disconnect

## What changed

- Only **On this device** and **Our shared album** appear in the main navigation.
- Device photos support the **same full-size photo viewer** as cloud photos, download and deletion.
- An optional, collapsed **My cloud backups** section lives on the device page. It is personal cloud storage, not a third album. Nothing uploads automatically.
- Sign in only to back up, restore, or share photos. Google and guest camera sessions remain separate.
- Each account can be part of one **current** shared connection at a time. **Connect with someone** creates an invitation; joining it activates one shared album with an empty initial gallery.
- Both members can rename and add pictures from the device or private backups. A shared picture remains a distinct copy.
- **Disconnect** ends the active connection for **both** members and prevents further sharing. Previously shared pictures are **retained read-only** in Past shared memories, visible to both former members; both can download a ZIP or preserve their own private backup copies.
- New connections create new empty shared albums. Old data is not automatically deleted.

## Install on top of v0.6.2

1. Apply the v0.6.3 Git AM patch on a clean working tree with `git am`.
2. Run `supabase/migrations/20261013_007_two_albums_and_disconnect.sql` in Supabase SQL Editor. **Do not run older migrations again.**
3. Keep `VITE_LOVEBUG_CLOUD_ENABLED=true` **only in local development** while testing.
4. Run `npm install`, `npm run typecheck`, `npm run build` and `npm run dev`.
5. Redeploy the **existing** deletion Edge Function to protect archived memories: `npx supabase@latest functions deploy lovebug-delete-album --project-ref YOUR_PROJECT_REF --no-verify-jwt`. No new packages or secrets are required. Room and health functions are unchanged.
6. Only enable production cloud after all security and two-account checks pass.

## Security and privacy

- Cloud uploads require a permanent Google account. Room guest sessions use a separate Supabase client.
- The new RPCs enforce one active connection per account and require server-verified membership to create, join, rename, rotate invitations, or disconnect.
- The migration makes archived shared albums **read-only** using database and Storage RLS. Members retain read/download permission for recovery. Archived albums do not auto-expire or auto-delete.
- A disconnect operation **does not** delete any photo or membership, nor copy photos without consent.
- Choosing **Keep copies in my cloud, then disconnect** downloads and reuploads the shared pictures sequentially as independent private backups. If any copy fails, disconnecting stops and the user remains connected. Repeated attempts are idempotent.
- Choosing **Disconnect without making new copies** ends sharing but leaves read-only recoverable copies. Both people can decide independently later what to preserve.
- Sign out only ends the Google session; it does not disconnect the couple or erase any memory. The guest room client stays separate.
- Previous test albums remain accessible from the small **Past shared memories** section, regardless of duplicate album names.
- The existing album-deletion Edge Function now rejects deletion of an archived album. This prevents the former creator from deleting the other person’s recoverable photos. Permanent deletion is removed from the everyday UI; do not invoke this endpoint for disconnect.

## Acceptance checklist

- [ ] The main album displays only two destinations at 320px, 390px and desktop.
- [ ] Local photo opens the same full-size viewer as cloud photos; Escape and Close work.
- [ ] Local download, removal and ZIP backup still work.
- [ ] Backing up a local photo is an explicit action; Google login alone never uploads.
- [ ] Private backup can be viewed, downloaded, restored to the device and deleted.
- [ ] A cloud backup can be explicitly shared into the connected album.
- [ ] A signed-in user without an active connection can invite or join; the shared album starts empty.
- [ ] A second active relationship cannot be created or joined until the current one is disconnected.
- [ ] Both shared-album members can rename, view, download and share photos.
- [ ] Third Google account and anonymous guest cannot read, rename, share, disconnect, or view member identities.
- [ ] Keeping cloud copies then disconnecting leaves independent personal backups and ends the active shared connection.
- [ ] If any cloud-copy operation fails, the app does not disconnect.
- [ ] Disconnect without backing up keeps old pictures recoverable for both users.
- [ ] The other person sees the disconnected notice on refresh/within 12 seconds and can recover copies independently.
- [ ] Reconnecting creates a **new empty** album, not the old one.
- [ ] Quick Room: approval, both cameras, locked PIN, 4 photos, shared editing and floating notifications.
- [ ] **Disconnect one participant during live editing and confirm the other can finish locally.** Mandatory regression.
- [ ] GitHub Actions and external cron health endpoint remain unchanged.

## Deliberate limitation

Old shared albums are **archived, not destroyed**. They continue to consume Supabase Storage until a future explicit, mutually safe deletion process is implemented. This is intentional to avoid loss for the person who did not initiate the disconnect.

The entire product remains guest-first. A download or photo-save click never secretly uploads camera frames.
