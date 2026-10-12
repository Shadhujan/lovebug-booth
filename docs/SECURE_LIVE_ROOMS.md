# Lovebug Booth v0.5 — Secure Together Apart ♡

This milestone replaces public Supabase Realtime channels with **server-authorized temporary two-person rooms**. **Normal single-device booth, Photo Letters, custom backgrounds, stickers, and local memories stay unchanged.** No Google account or cloud photo upload is required for live rooms.

## One-time Supabase setup (required before deploying v0.5)

1. In Supabase → **Authentication → Providers / Sign In → Anonymous Sign-Ins**, enable anonymous sign-ins. This creates an ephemeral *Supabase Auth user*, not a Google login or account form. Guest identity persists only in this browser tab's session storage; after closing or clearing it, the user cannot reclaim the same identity.
2. In Supabase → **SQL Editor**, run **all** of `supabase/migrations/20261012_002_secure_live_rooms.sql`. This creates `lovebug_live_rooms` and `lovebug_live_guests`, six minimal RPC functions plus a membership check, and Realtime RLS policies.
3. In Supabase → **Realtime → Settings**, turn **Allow public access** OFF for public release. This blocks the old unprotected public channels. **Do not turn off Realtime** itself. Supabase Realtime must be running to connect two cameras.
4. Check that any existing Realtime policies don't inadvertently allow unrelated broad topics. The new migration uses **restrictive** policies for `lovebug-secure:*` topics, in addition to targeted permissive policies, specifically to avoid an earlier permissive policy bypassing room membership.
5. Confirm the same `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` variables exist in Vercel and `.env.local`. No new keys or other environment variables are needed. **Never** put a service-role key, secret key, room PIN, or a user's session JWT in frontend environment variables.
6. Run `npm run typecheck` and `npm run build`, then deploy `npx vercel --prod`. Both participants must reload the site after deployment. **Old 32-character v0.4 room links are no longer valid; create fresh v0.5 invitations.**

> **Order matters:** Set up the SQL and anonymous authentication first. The v0.5 client will not fall back to public signaling if a migration is missing or an RPC fails.

## How rooms work

### Quick Room

- Host creates a server-side room; Supabase generates a random UUID for its unlisted link.
- Host sends the invite link privately. Anyone who gets that link **may request** entry but **cannot join the camera call without host approval**.
- The host sees a pending request and taps **Approve guest** or **Decline**.
- Until approved, the guest gets **no camera prompt and no access** to the private WebRTC signaling channel.
- Once approved, the guest and host open their own cameras and create the same two-person session as before.

### Locked Room

- Exactly the same sequence, but the guest must enter a **six-digit PIN** before requesting host approval. The host should send the PIN **separately** from the link.
- PIN is stored as a salted SHA-256 hash in the database, **not** in the invitation URL, Realtime channel, or Git repo.
- Five wrong PINs temporarily lock that room's PIN entry for ten minutes. Lockout is per room (someone who already has the link can deliberately cause a temporary lockout).
- A PIN is only one defense; the **host must still approve** the guest.
- The PIN is shown to the host when created. On refresh, the host's existing room can resume, but the PIN itself is intentionally not retrievable. Keep the PIN in private chat or start a new room.

### Room rules

- **No public room list, search, or matchmaking.** All rooms are unlisted.
- Maximum **one host plus one approved guest**, with only one pending guest request at a time.
- A room expires automatically after **45 minutes** or when the host taps **End this room for everyone**.
- If a guest leaves, the host may approve another guest; a declined guest cannot keep retrying the same request with their existing anonymous identity.
- Explicit Leave/End updates the database and disconnects this app's camera/WebRTC channel. Abrupt tab closure cannot guarantee server-side cleanup; the room still expires after 45 minutes.
- Signed-in cloud accounts, if you configure those in a future release, are **not required** for temporary rooms. Live sessions use a separate session-scoped anonymous Auth client.

## Privacy and important security limits

- No photos, frames, or microphone audio are uploaded to Supabase. Photo Letters are local file exports. Live Together sends the **camera video through WebRTC** directly between participants; Supabase handles private signaling (SDP, ICE candidates), approval, and room metadata.
- Browser camera permission is still requested by each device independently; no participant can grant camera access on another device.
- STUN (currently Google's public STUN server) and browser WebRTC can reveal network information (including IP addresses) to network services and the other participant. There is no TURN relay, so some network combinations will still fail. Photo Letters is the fallback.
- Supabase Realtime caches authorization while a channel is connected. After approval is revoked or a room expires, honest clients disconnect on their next status check (approximately 2.5 seconds), but a **malicious existing client might stay connected until its JWT expires or authorization refreshes**. Do not claim immediate server-forced socket revocation.
- Room metadata expired over a day ago is pruned opportunistically when someone creates another room; old rows may remain until that happens. Anonymous sign-ins also create Auth user rows; for a large public audience, plan spam/rate-limiting/CAPTCHA controls, usage limits, a retention policy for expired room data, and privacy disclosures before launch. This migration limits concurrent host rooms per user and wrong PIN attempts per room, **not per IP address**.
- The existing v0.4 single-couple cloud album is hidden in v0.4.1 and **is not enabled** by this patch. Do not advertise a multi-couple cloud album yet.
- Because a room ID is a bearer invitation, don't put it in public forums. Host approval and Locked Room PINs provide additional protection.

## Acceptance checklist — test on two different devices and networks

1. **Quick Room:** A creates room, B follows invitation. B sees **Ask to join**; B is **not** asked for camera permission while waiting. A sees the request.
2. A declines. B sees that the request was declined and **cannot** join the channel. Create a new room for the next test.
3. Create a second Quick Room. A approves B. Only now does B see a camera-permission prompt. Both videos, custom scenes, countdown, mirrors, and photo capture still work.
4. From a third browser/incognito user C, try joining the same link. The request must say **room full**. C cannot subscribe to `lovebug-secure:<room ID>` even if they write their own browser code.
5. **Locked Room:** A creates it. B's wrong PIN is refused; the correct PIN yields **waiting for approval**, not immediate camera access. A approves. Verify the two-camera session.
6. Refresh the approved guest's **same tab**: membership should restore. Opening the link on a new phone/tab may create another guest identity and require approval or be refused if full.
7. A ends the room: B's app disconnects, camera tracks stop, and the invite cannot be reused. B leaves: A can approve a new guest.
8. Test on Vercel HTTPS and with different networks. If WebRTC fails due to NAT/firewalls, Photo Letters must still work as before.
9. Negative RLS check: From an unrelated anonymous Auth user, a private `lovebug-secure:` Realtime channel must fail subscription. **Do not ship publicly if this succeeds.**
10. Recheck solo capture, local photo ZIP backup, custom stickers, and Photo Letters; this patch is not supposed to change them.

## Troubleshooting

- **"Anonymous Sign-Ins" error:** Enable Supabase Authentication → Anonymous Sign-Ins. Google OAuth setup is unrelated.
- **"Run the v0.5 migration":** Run the complete SQL script on the *same* Supabase project specified in Vercel and `.env.local`.
- **"Secure signaling failed":** Verify the Realtime policies, migration, project key, and that host approved this guest. For public release, disable `Allow public access` while keeping Realtime running.
- **"This room already has someone waiting":** Host should approve or decline the current request; rooms intentionally have one guest seat.
- **PIN lockout:** Wait ten minutes or let the host create a fresh room and PIN.
- **Camera works locally but not on LAN HTTP:** Web cameras typically require HTTPS; use the Vercel deployment.
- **Camera/video connection fails on mobile networks:** A TURN relay may be required. Photo Letters remains available.

## Rollout / rollback

This is a new SQL migration and doesn't modify the private album tables. If you roll back the frontend to a version before v0.5, those old clients may still use the unprotected **public** Realtime channel. **Keep public channel access disabled** and don't roll back to the old live-room flow on a public deployment. Database tables can remain unused; avoid dropping them while a room is active.

## v0.5.1 follow-up: finish photos together

Opening Sticker Playground no longer calls `lovebug_live_leave`. Both people may opt into collaborative sticker editing, or edit their photos separately. The host's four JPEGs and editing operations transfer directly over WebRTC DataChannel; the database retains only secure room admission/expiry metadata. Guest access is still checked every ~2.5 seconds. The 45-minute expiry is **not** extended while decorating, and expiring/revoking access does not delete photos already in the user's browser. See [Collaborative Editing](COLLABORATIVE_EDITING.md) for testing and privacy limits.
