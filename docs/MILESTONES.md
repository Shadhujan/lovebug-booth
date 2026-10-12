# Lovebug Booth - phased implementation

The UI concept is approved. Keep all work mobile-first and verify behavior on a real Android phone, not just desktop resizing.

## Phase A - Current ZIP: Local-first photo booth (v0.1)

- [x] Responsive homepage with the strawberry-pink scrapbook visual identity.
- [x] Frame theme selection and pose roulette.
- [x] Camera capture with countdown, multi-shot loop, review/retake, photo upload fallback.
- [x] Original sticker pack, drag/move/resize/rotate, layering, text, doodles, undo/redo.
- [x] Browser-based custom cutout creator with shape masks and a simple edge-color eraser.
- [x] Save to local album using IndexedDB, PNG export/download.
- [x] README and zero-secret configuration scaffold.
- [ ] User-side: install dependencies, run `npm run typecheck`, `npm run build`, use a real phone over HTTPS.

## Phase B - Long-distance photo booth (v0.2)

- [x] Together Apart mobile-first entry point, tabs, and private-link room UX.
- [x] Photo Letters: separate four-photo capture, portable file export/import, blended composite into the existing editor.
- [x] WebRTC live two-camera connection with Supabase Realtime signaling and presence (STUN-only; experimental).
- [x] Host-controlled scrapbook frames and approximately synchronized four-shot capture.
- [x] v0.2.1: preview and export share the same frame renderer and crop.
- [x] v0.2.1: optional close/balanced/classic blend, flip each photo, and per-person horizontal framing sliders.
- [x] v0.2.1: locally mirrored selfie thumbnail by default, normal partner preview and unmirrored saved output by default.
- [x] v0.2.1: Photo Letters uses the same composition options and preview.
- [x] Camera track cleanup on leave, public-link risk warnings, network failure fallback.
- [ ] User-side: configure publishable Supabase values, install dependencies, run TypeScript/build, and test two different networks and Android phones over HTTPS.
- [x] v0.3: optional live, on-device person segmentation, move/resize people and illustrated shared virtual backgrounds, with original-camera fallback.
- [x] v0.3: Photo Letters also support both people in a shared virtual scene.
- [ ] User-side: two-device Android/WebRTC testing of the cutout model, battery usage, edge quality and saved photo results.
- [ ] Production TURN relay and stronger connection recovery where needed.
- [ ] Signed-in private room membership and Realtime authorization policies (public invite link is not secure).

## Phase C - Shared private album with Supabase (later)

- [ ] Link the existing Supabase project via its Project URL and **publishable** key only.
- [ ] Two private accounts (passwordless email OTP/magic link or another appropriate method).
- [ ] Server-side membership model for exactly one invited couple; do not assume an email address alone grants access.
- [ ] Private Supabase Storage bucket for originals and exported strips.
- [ ] Row Level Security (RLS) for albums, membership and all photo records; Storage policies tied to authenticated membership and album ID. Test forbidden cross-user reads/writes.
- [ ] Use signed URLs or authenticated storage operations; do not make the photos public.
- [ ] Local-only and cloud-saving states clearly distinguished; never upload without explicit action.
- [ ] Invitation, revoke-access and deletion handling.

## Phase D - Extra moments

- [ ] Advanced freehand selection/brush eraser for custom cutouts.
- [ ] Optional on-device subject segmentation if practical, with no silent photo uploads.
- [ ] More frames (2-shot, collage, Polaroid); photo-by-photo sticker editing if desired.
- [ ] Animated photo strips/GIFs, sound toggle, photo booth sound effects.
- [ ] Better first-use tutorial for pinch/rotate and accessibility.
- [ ] Installable PWA/offline-friendly caching after production behavior stabilizes.
- [x] Optional long-distance booth combining photos captured separately on each phone.

## Manual acceptance check for Phase A

1. On desktop, open home -> setup -> Try demo, and confirm all 4 photos render.
2. Decorate: add a bow, drag it onto one image, resize/rotate with the handles, then undo and redo.
3. Switch to Doodles, draw on the strip, then return to stickers.
4. Make a text sticker and edit it. Try the filter options and change the footer caption.
5. Create a custom cutout from a picture, place and resize it. Reload and confirm it appears in your sticker box.
6. Finish, download PNG, save to local album; verify download and album entry.
7. Return to home and album, verify browser persistence; delete a saved strip and confirm.
8. On Android over HTTPS, grant camera access and try four countdown captures, then retake one shot.
9. Confirm layout works at 360 px wide and sticker gestures don't scroll the page during dragging.
10. Check camera-denied path and upload fallback.

## Scope & privacy

This is a just-for-fun couple app with no billing, no analytics tracking, and no public social feed. Keep personal photos out of Git. Supabase is *not yet connected* in Phase A; don't describe browser-local album as synced between devices.

## Acceptance check for Together Apart

See [TOGETHER_APART_SETUP.md](TOGETHER_APART_SETUP.md) for setup, both-phone live tests, Photo Letters steps, privacy cautions and network limitations.

## v0.3.4 — Together Apart shared controls and personal scenes

- [x] Both participants edit the live composition; latest edit wins.
- [x] Shared countdown selection, while the room host still begins the shoot.
- [x] Upload a personal background in either browser and transfer it through
  the existing WebRTC data channel, without public cloud storage.
- [x] Display transfer readiness and keep capture disabled until the shared
  background is available on both devices.
- [x] Use personal background images in offline Photo Letters too.
- [ ] User-side: test live image transfer and cutout capture on two real phones.
