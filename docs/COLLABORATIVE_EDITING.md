# Lovebug Booth v0.5.1 — Together after the photo ♡

This is an incremental update on top of v0.5 secure Quick Rooms and Locked Rooms. **The room's host no longer ends the whole room by opening Sticker Playground.** Both approved participants can complete the photo date on their own devices.

## How to use

1. Create a Quick or Locked Room, approve your invited guest, and take four photos as usual.
2. The post-capture screen appears on **both** phones. The room stays open; you don't have to take the pictures again.
3. The host's four saved JPEGs transfer directly over an ordered WebRTC data channel. Shared editing becomes available only when the second device acknowledges the matching photo set. If transfer fails, both devices still have their locally captured photos for **Make my own version**.
4. **Decorate together:** BOTH people tap this option. One person's choice never forces the other person to participate. Adjust the four photo crops, then enter Sticker Playground. Stickers, doodles, filters, and captions synchronize while connected. Changes to different stickers and strokes are merged, and undo/redo tracks your own operations.
5. **Make my own version:** Either person may choose this independently, adjust the four photos and decorate locally. Their edits are not sent to the other person.
6. **Finish** on either device, then **Keep on this device**, **Download photo strip**, or **Share photo** using the native share sheet (when supported; otherwise download). Saving uses IndexedDB only. The other person can keep editing their own copy.

## What remains unchanged

- Both room types require server approval, and Locked Room retains its six-digit PIN.
- The two-camera preview size, soft merge, person-cutout backgrounds, flash choices, composition panel, photo strip layouts and sticker editor styling.
- The four-shot Review crop/reframe controls and preview/export consistency.
- Photo Letters and the normal solo photo booth.
- No public camera-room listing, no mandatory account, and no cloud photo storage.

## Connection and privacy boundaries

- The v0.5 private, RLS-authorized Supabase Realtime channel still carries **WebRTC signaling** and camera session metadata. The **images and decorating operations are transferred over an encrypted WebRTC DataChannel** after room approval, not inserted into Supabase tables or Storage.
- The second device receives the host's four saved JPEGs so both shared editors start with the same images. Each participant should explicitly choose **Decorate together** before the shared editor opens.
- Individual editing never sends sticker or crop changes. Custom photo stickers are shared as data images only when inserted into a live shared strip; creating local stickers still saves them locally.
- Each completed image is exported locally. Native sharing sends it to an app chosen by the user, not Lovebug Booth servers.
- If the room expires, approval is revoked, or the connection closes while editing, the browser keeps its **already-received** photos and draft; continued changes are local. The current room doesn't auto-extend beyond its original 45 minutes.
- Simultaneous edits to the *same* sticker, filter, or caption use the last received change. Concurrent independent stickers have stable layer ordering. Disconnects during transfer cannot guarantee a complete shared photo set; use the individual mode instead.
- This is ephemeral collaboration. Refreshing or closing the tab during editing can lose any **unfinished** in-memory draft. Save/download important completed photos.

## Required configuration

**No new SQL migration, npm dependency or environment variable is needed.** Your v0.5 secure room migration and Anonymous Sign-Ins configuration must already be working. Keep Supabase Realtime on, with public channel access disabled as directed by `SECURE_LIVE_ROOMS.md`.

## Two-device acceptance tests

- [ ] The pink **Adjust our photo** button briefly pulses after both cameras connect, shows its hint until opened, and does not animate endlessly. With reduced-motion enabled it uses a static outline.
- [ ] Host creates Quick Room; guest approved; both capture four shots. Neither device lands on an ended-room page.
- [ ] Guest and host see four post-capture thumbnails. **Decorate together** waits for the photo transfer acknowledgment.
- [ ] Only host selects **Decorate together**: host sees the waiting state; guest isn't forced into editing.
- [ ] Both select **Decorate together**: both can reframe photos and the saved strip matches the crop previews.
- [ ] Host adds a sticker; guest sees it. Guest doodles; host sees it. Host moves a sticker; guest sees its new placement. Undo should not erase the other person's independent doodle.
- [ ] Add two stickers rapidly on different devices and verify both display the same stacking order. Try one custom photo cutout sticker, filters, and the caption.
- [ ] Repeat in a Locked Room, then select **Make my own version** independently; changes must **not** appear on the other phone.
- [ ] Both finish at different times, download and save locally, and try the Share action (or its download fallback).
- [ ] Host closes/ends room while guest is editing; guest still has their photo and can finish/download. Test again when the room expires.
- [ ] Normal solo booth and Photo Letters still work. Verify at 320px, 360px, 390px, and desktop widths.

## Release notes / rollback

- Apply the v0.5.1 `git am` patch on top of v0.5, run `npm run typecheck` and `npm run build`, then test on two **HTTPS** devices before deploying to public traffic.
- The new camera-to-editor handoff relies on both devices using v0.5.1. **Refresh both browsers** after deploying. A v0.5 guest cannot understand the new peer-to-peer photo transfer.
- Reverting the frontend to v0.5 reintroduces the old behavior where the host's Decorate button ends the room. No database rollback is required.

## v0.5.2: small collaboration cues, without a new account or storage

- On each participant's first successful camera connection **per room**, the **Adjust our photo** control glows for up to 30 seconds. Opening it stops the glow. A desktop-size inspector gets the same cue because its button is normally hidden. Reduced-motion mode displays an obvious, static highlight instead. The full-size camera view never changes size.
- If one person chooses **Decorate together**, the other person's corresponding choice gets a stronger pink border, a short pulse, and the words **Your lovebug picked this**. Choosing together is still voluntary.
- When a shared sticker is dragged, rotated, resized or pinched, tiny position-only previews are sent at **at most 8 updates per second** over the same WebRTC data channel. The partner sees the movement before pointer release. The final edit is still committed only on release, so undo remains action-based. Doodles retain their existing on-release behavior to avoid streaming large lines.
- Finishing a shared version announces **Your lovebug finished a version** in the partner's editor. This is an in-app status, not an operating-system notification. It does not finish their copy, close their room, or prevent further editing. Going back from a finished image to stickers announces that editing resumed. Completed images are snapshots; to include later edits, return to stickers and finish again.
- **Offline editing is unchanged and mandatory.** A dropped peer connection clears only the ephemeral movement preview. The participant retains already-received photos and committed edits and can finish/download locally. No Supabase schema or cloud photo upload is introduced.

### Extra v0.5.2 acceptance tests

- [ ] Connect two cameras. On BOTH screens, check the vivid pink Adjust our photo cue persists for about 30 seconds if untouched; clicking stops it. On desktop-wide screens, check the inspector highlights instead of an unavailable button.
- [ ] Enable reduced motion: the cue remains visibly outlined without moving.
- [ ] Select Decorate together only on one phone: the other phone's **Decorate together** choice is visibly highlighted before they touch it, but they can still choose independently.
- [ ] With two shared editors open, slowly drag or rotate a sticker: the other phone sees intermediate positions at a modest rate, not only the final jump. Releasing commits the final position and Undo reverses it correctly.
- [ ] Finish on one device while the other edits: show an in-app notification but let the second device finish whenever it wants. Returning to stickers from the finish screen clears the other device's finished indicator.
- [ ] Repeat with a slow or disconnected connection: no blank strip, no lost local draft, no forced room exit. Disconnecting one participant during editing **must always leave the other able to finish locally**.

## v0.5.3 — floating room notifications

- The host sees a **persistent floating join request** from any scroll position. It includes Approve and Decline; only approve someone you recognize. The existing in-page request remains in place. The alert disappears only when the request is decided or the server removes it. No one is ever approved automatically.
- When the other person asks to **Decorate together**, a floating invitation offers a direct opt-in action. The existing highlighted choice remains. Dismissing the invitation does not choose for you.
- While decorating together, **finished** and **editing again** updates stay visible until dismissed or replaced by a newer update, rather than disappearing after eight seconds. Finishing is still an independent snapshot; nobody is forced out of their editor.
- One fixed notice is displayed at a time (join approval before invitation before editing update). The notice moves to the lower edge on small screens, supports keyboard focus and reduced motion, and never requests OS notification permission. No photo or sticker traffic is added.
- The existing **disconnect-and-finish-locally** path is unchanged and remains mandatory to test.

### v0.5.3 acceptance checks

- [ ] Host scrolls to the camera preview, guest asks to join: a floating approval notice appears without scrolling to the top. Verify approving a known guest and declining a separate request.
- [ ] The guest cannot access the camera or room before the host explicitly approves; a third participant remains blocked.
- [ ] After four photos, one person chooses Decorate together: the other sees a floating invitation, can accept it or dismiss it, and is never forced to join.
- [ ] During shared editing, one person finishes: the other sees the fixed notice while busy with stickers. It stays until acknowledged; editing remains available.
- [ ] If that person returns to stickers, the other receives an updated notice.
- [ ] On a 320px/390px phone screen, the notice fits without horizontal overflow. At reduced motion it is still visible but does not animate.
- [ ] **Disconnect one participant during editing and confirm the other can finish and download locally.**
