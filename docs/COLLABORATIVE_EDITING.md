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
