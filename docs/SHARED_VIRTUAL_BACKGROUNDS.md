# Lovebug Booth v0.3 — Our shared little world ♡

A virtual-scene option for **Together Apart** (Live Together and Photo Letters). The familiar camera merge remains the default, and the camera preview dimensions, frame border, sticker editor, and album are unchanged.

## What this release adds

1. In **Together Apart → Live Together**, open **adjust our photo** (or the desktop side inspector).
2. Choose **Our shared little world → Flower garden / Little café / Sunset beach / Moonlight rooftop**.
3. Both browsers lazily fetch MediaPipe's SelfieSegmenter model and remove the original rooms from *both* camera feeds on each user's own device. The scene and controls sync through the existing Supabase Realtime channel.
4. Wait until both phones report their cutouts are ready. Only then is **take four photos together** enabled.
5. Adjust **Closer Together / Balanced**, the existing horizontal sliders, **Person size**, flip, border colors, and the same full-size photo preview.
6. Each device captures four finished images using the exact same composition renderer as the live preview. Continue to the familiar sticker editor.
7. If a phone is slow, the model doesn't load, or the hair edge is messy, select **Original cameras**. The original soft/blended camera experience works without the person model.

**Photo Letters** supports the same backdrops. After uploading both sets of four pictures, choose a scene, wait for the first pair's preview to finish segmentation, then click combine. Each of the four pairs is cut out on the importing device before export. The original JSON photo-letter format is unchanged.

## Install, build, deploy

This patch adds one dependency to `package.json`: `@mediapipe/tasks-vision@1.1.0`.

```powershell
# First apply the v0.3 git-am patch (see patch delivery message)
npm install
npm run typecheck
npm run build
npm run dev
# When verified, commit the package-lock.json update made by npm install
# git add package-lock.json
# git commit -m "chore: lock MediaPipe vision dependency"
# git push origin main
```

Your Vercel environment variables are unchanged. No new Supabase tables, migrations, API routes, or credentials are required. When deployed, hard-refresh both phone browsers so both use the updated room message format.

### External model files

The JavaScript runtime is installed from npm; when first enabling a virtual background the app fetches:

- MediaPipe WASM from the version-pinned jsDelivr CDN (`@mediapipe/tasks-vision@1.1.0`).
- The official SelfieSegmenter model from Google Cloud Storage (MediaPipe's published model URL).

Camera frames and photos are processed locally **without sending them to these endpoints**. However, the MediaPipe npm privacy notice states its tasks may send usage/performance metrics to Google; evaluate this disclosure before later calling the application fully tracker-free. Model loading requires internet connectivity the first time. This release uses an illustrated, locally hosted SVG for each scene; no Pinterest images are redistributed.

## Two-device acceptance checks

- Verify original mode still works and the live photo preview remains exactly the same size as v0.2.2.
- One phone creates a room, the other joins on its own network. Both cameras connect as in v0.2.2.
- The host chooses Flower garden. Both should eventually see two **transparent people in the same garden**, not two separate rooms, and both show ready status.
- Move each person and change their size on the host. Both previews should agree. Try the independent mirror and swap toggles.
- Capture four pictures. Check the finished photos show the scene, cutouts, scrapbook border, and placement as previewed. Use the Sticker Playground and download the strip.
- Choose Original cameras without ending the call and confirm the old merge still works. Deny network access to model CDN or try an unsupported browser and check the warning + original fallback.
- Try Photo Letters: import both sets, select Little café, combine and decorate. Switch back to Original cameras and verify the previous fallback still works.
- On Android, watch frame rate and device heat. Cutouts update at reduced frequency to limit mobile load; brief edge artifacts during rapid movement are expected. Good lighting and separation from the real background improve results.

## Honest limitations

- Scene background removal is a client-side preview effect, not studio chroma key. Hair, fine hands, transparent clothes, low light and motion blur can show rough cutout edges.
- Each browser runs segmentation locally on both available camera feeds. Results may differ slightly between devices and segmentation is deliberately slower than the video stream on midrange phones. This is **not** frame-perfect cross-device capture.
- On severe resource constraints, keep Original cameras selected; its camera merge does not depend on the model.
- **Rooms still use public invite-link Realtime channels without signed-in room membership.** An exposed room link is not private. Private authenticated rooms are a separate security milestone. Do not send sensitive content using these experimental rooms.
- STUN-only WebRTC remains in place; production TURN/reconnection improvements are not included here.
- The album remains local to each browser. A shared authenticated Supabase album will be a separate milestone.

## v0.3.3: if the garden appears without either person

A loaded background-removal model does not mean it has recognized both people. The live booth now checks how much foreground the model actually found before saying "ready" or enabling the shutter. Masks that are empty or nearly all foreground are rejected, and the category mask is tried if the confidence mask looks unusable.

- While the model is looking for one or both people, the main preview temporarily shows the **Original cameras** instead of an empty illustration. The virtual background choice is kept; it automatically appears again once both cutouts are valid.
- A warning under the preview tells you to face the camera, brighten the room, and keep your head and shoulders in view. The host can use **Original cameras** immediately without ending the call.
- If a person disappears during a countdown, the four-shot sequence stops rather than exporting a blank person.
- Photo Letters rejects missing subjects with a helpful message instead of producing an empty virtual strip. Choose better-lit photos or Original cameras.
- Neither the shared photo dimensions nor the existing mobile adjustment panel were changed.

Test with normal indoor light and a darker room, including the case where one person walks away from their camera. The real Android segmentation quality still needs testing on both devices.

## v0.3.4 — Adjust together and use your own photo

- Both people can now edit the same live composition, including the backdrop,
  position, size, mirroring, scrapbook border, and countdown. The **most recent
  change** is shown on both devices; only the room creator starts capture.
- Tap **Our own photo** or **upload our own background** in the existing adjustment
  inspector. Choose a JPEG, PNG or WebP (10 MB maximum). The app center-crops
  and compresses it to a 1200 x 770 JPEG before sending it directly to the
  other browser over the existing encrypted WebRTC data channel.
- Backgrounds are kept **in memory only** for this photo date; they are not
  uploaded to Supabase or stored in the online album. The photo itself is
  shared with the other participant through WebRTC. Avoid uploading sensitive
  images into unauthenticated invitation rooms.
- While the picture is being transferred, the booth temporarily displays the
  original cameras and disables capture. After both devices receive it, both
  people should appear in the same selected photo. Person detection and the
  original-camera fallback still work as before.
- The same custom-photo selector works in **Photo Letters** on the device doing
  the merging. Each browser has its own temporary selected background.
- The host still presses **take four photos together** so both phones share
  one countdown. The guest can freely adjust the scene before that.

### Two-device acceptance check

1. Join a room on two devices over HTTPS, open Adjust our photo on **both**.
2. From the guest, select Moonlight Rooftop; confirm the host sees it too.
3. Change the guest's size and mirror settings; confirm the host sees the same
   composition. Change a setting from the host and verify the reverse.
4. Select **Our own photo** from the guest's phone, upload an ordinary JPEG,
   wait for the transfer to finish, and confirm the same photo on both devices.
5. Try a photo from the host as well. Confirm both sides see the newest photo.
6. Start four captures only after both people are detected and the shared
   background is ready, then compare preview versus exported strip.
7. Switch to Original cameras. Confirm the live session and solo photo booth
   still work. Test the upload option in Photo Letters separately.
