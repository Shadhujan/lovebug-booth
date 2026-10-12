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
