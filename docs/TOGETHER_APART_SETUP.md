> **Current v0.5 setup:** This document describes historical v0.2–v0.3 experimental rooms. For the secure public-ready signaling flow, follow **[SECURE_LIVE_ROOMS.md](SECURE_LIVE_ROOMS.md)**. Do not re-enable public Realtime channels based on old instructions below.

# Together Apart v0.2.1 - setup and testing

Two ways to take a photo strip together while living apart:

- **Live Together (experimental):** WebRTC connects both cameras. Supabase Realtime carries room presence, call negotiation, theme choices and the countdown. Photos are not uploaded by this feature.
- **Photo Letters (works offline from the other person):** each person takes/uploads 4 photos, exports a `.json` photo letter, and privately sends it to the other. Once one person has both letters, they can combine four photos composed into a shared frame and continue into the original editor.

## 1. Apply the patch and install dependencies

```powershell
# Run inside your clone of Shadhujan/lovebug-booth
# The git am command is provided alongside the patch download.
npm install
npm run typecheck
npm run build
npm run dev
```

`Photo Letters` and the original solo booth need no Supabase setup.

## 2. Turn on live room signaling

1. In Supabase, open your `lovebug-booth` project. Copy its **Project URL** and **publishable** API key (`sb_publishable_...`) from the Connect dialog.
2. In your project root, create `.env.local` (copy `.env.example`) and enter:

   ```env
   VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_YOUR_PUBLIC_KEY
   ```

3. Restart `npm run dev` after editing `.env.local`.
4. **Obsolete for v0.5:** Do not enable public Realtime access. The secure flow requires the SQL migration and anonymous Auth sign-in described in SECURE_LIVE_ROOMS.md.
5. **Never** put a database password, `service_role`, `sb_secret`, or a TURN credential in a `VITE_` variable. Never commit `.env.local`.

## 3. Test with two actual devices

For cameras on two phones or on a laptop and phone across networks, deploy the site with **HTTPS** (Cloudflare Pages / Netlify / Vercel). `localhost` camera permission works locally on the computer; ordinary `http://192.168.*` may not.

Cloudflare Pages configuration:

| Field | Value |
| --- | --- |
| Framework preset | Vite |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Environment variables | `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` |

When deployed, test:

1. Open the HTTPS site on the first device. Choose **Together Apart > Live Together** and create a room. Allow camera permission.
2. Copy the entire invite link and send it to your girlfriend privately.
3. She opens the invite link on her phone over HTTPS. It should open the live tab. She allows camera permission.
4. Verify both participants can see their own camera and the other's camera. Audio is intentionally disabled.
5. The host changes the scrapbook border and the **Closer Together / Balanced / Classic Split** option. Both screens should show the same combined-photo preview, with no hidden difference in cropping.
6. Turn on **Flip your photo** and **Flip partner photo** separately; check both previews match. The local *selfie thumbnail* mirror setting is separate and does not change the saved photo.
7. Move the per-person framing sliders to keep your faces in the combined picture. The composition guide is optional and is not exported.
8. The host clicks **take four photos together**. Both receive approximately synchronized countdowns, each generates four side-by-side images, and both can open the Sticker Playground when finished.
9. Finish and download on both devices, verify the PNG and optional browser-local album. No cloud photo persistence is involved.
10. Test camera denial, leaving rooms, page refresh, guest disconnect/rejoin and network failure. Switch to Photo Letters if WebRTC cannot connect.

## 4. Test Photo Letters

1. Both open **Together Apart > Photo Letters** independently.
2. Each uses **open my camera** (or **upload four**) to make a set of four camera photos. Note that sample SVG demo pictures cannot be exported as photo letters.
3. Each clicks **download my photo letter (.json)**. The `.json` contains private embedded camera photos.
4. Send that file to each other using a private messaging channel, not a public GitHub repository.
5. Import your partner's `.json` with **choose their photo letter**, or use **or upload their four photos** if they sent normal images instead.
6. Select **Closer Together** or **Balanced**, review the first-pair preview, adjust flips and framing, then click **combine our four pictures**, then decorate, download or save to your own browser-local album.

## Important limits

- **Not yet an authenticated private room.** The random invitation is unguessable in normal use, but anyone who obtains the link can subscribe to the public room. Neither photos nor audio are intentionally sent through Supabase, but room metadata/connection messages are visible to its subscribers. Do not use this for sensitive content until room membership and Auth/RLS policies have been added.
- **STUN-only connectivity:** some mobile carriers, corporate Wi-Fi networks and symmetric NATs need a TURN relay. This release intentionally does not ship a TURN credential. It shows a failure notice and the Photo Letters fallback is available.
- **No sound:** camera video only, not a video calling app. Use your normal call app for audio if desired.
- **Not frame-perfect synchronization:** network timing affects when each phone takes a shot. Both capture their own composition locally, rather than uploading one central master file.
- **No AI person segmentation yet:** the soft merge blends full camera images, so strong differences in lighting or rooms will remain visible. The scrapbook background colors the single outer border, not the background behind each person. Removing actual backgrounds requires a later on-device segmentation phase with careful Android performance testing. **Classic Split** is available when a soft blend looks unnatural.
- **No online album yet:** the album remains local to each browser. Download your important photos; do not depend on browser storage as a backup.
- **Public repo:** never commit personal photo letters, camera pictures, `.env.local`, or secret keys.

## v0.2.1 framing acceptance checks

1. In the live room, compare each large combined preview to the downloaded image. The large preview should include exactly the same crop, overlap, colors and photo order; the optional dashed safe-area guide and countdown are not saved.
2. Before the shot, adjust each framing slider; face positions should update immediately on both connected clients when changed by the host.
3. Verify the host's photo occupies the same left/right side on both devices even when the guest uses the opposite physical camera order.
4. Test each orientation setting independently: local selfie *thumbnail* mirror, host photo flip, guest photo flip. Saved results should follow only the host/guest photo flips.
5. With very different real backgrounds, try Balanced or Classic Split. Feathering does not magically remove walls, and can ghost people if both stand within the center overlap.
6. Offline Photo Letters: import both sets, check first-photo preview, change layout/flip/framing and confirm all four outputs match the selected crop.
7. On Android over HTTPS, check that the combined preview stays smooth enough, both mini camera tiles remain visible, and controls do not overflow at 360 px.

## v0.2.2: adjustments while viewing the photo

- On a wide desktop (1250px viewport or above), a **scrollable adjustment inspector** appears beside the original 850px-wide live composition. Scroll the inspector, not the page, while adjusting; the photo preview stays visible at its original size.
- On smaller desktops, tablets, and phones, press **adjust our photo** above the picture to open the adjustment drawer without changing the picture's size. The app scrolls the full-size photo into view and provides a continuously refreshed small copy inside the drawer. Close the drawer with **done**, **done adjusting**, or `Escape`.
- The live photo preview and the drawer's small preview use the same composition pixels. The second preview is only a visual aid; it does not alter cropping, zoom, or image resolution.
- The **take four photos together** button now sits immediately under the full-size picture. Starting the countdown closes the drawer automatically so neither person misses the shot. The shot progress, result thumbnails, and **decorate our photos** button remain below the preview.
- The guest can inspect the same settings but cannot modify the host's shared composition. Mirroring of the local selfie thumbnail is unchanged.
- No new Supabase tables, keys, packages, or database migrations are needed.

### Visual acceptance checks

1. On a 1440px desktop, verify the live composition stays 850px wide while the adjustment inspector is visible alongside it. Scroll the inspector to the bottom and keep the photo in view.
2. At 1100px viewport width, open the adjustment panel using its button; it may float over the edge of the main photo, but its miniature shows the entire picture so you can still see framing changes.
3. On Android/iPhone widths around 360-430px, tap **adjust our photo**. The main picture must keep its original width and remain visible above the bottom drawer. Adjust layout, crop, border, and mirror. The miniature preview must update along with the main frame.
4. Close and reopen the drawer, then use the capture button near the picture. The drawer must close for the countdown. After four photos, use **decorate our photos** to enter the existing editor.
5. Confirm Photo Letters, the solo booth, and sticker tools are unchanged.

## v0.3 virtual backgrounds

See [SHARED_VIRTUAL_BACKGROUNDS.md](SHARED_VIRTUAL_BACKGROUNDS.md). This adds optional lazy-loaded person segmentation and four local illustrated scenes without changing Supabase configuration. Original cameras remains the default and works if the model is blocked or slow. Both phones must refresh after deploying the update.

## v0.3.5 - Flash choice and Photo Letters

- Each person sees their own **Flash MY screen** checkbox next to the capture controls. Each device remembers its own preference and starts with flash OFF. The setting does not modify the partner's screen; together you may choose neither / only one / both.
- Host and guest see the other's flash preference, but cannot change it. The room creator still starts the countdown.
- The screen briefly brightens while capturing, without requesting flashlight/torch permissions. Hardware LED flash is not supported by this release. If a person is sensitive to bright flashes, leave it off.
- In Photo Letters, choose photo-pair 1-4 and modify framing individually; select **use this framing for all 4** if desired. You may replace your own or your partner's photo for just the selected pair.
- After shooting in the solo booth, the Review step shows each exact film-strip crop. Adjust any photo vertically, or retake a single shot; you should not have to restart all four.
