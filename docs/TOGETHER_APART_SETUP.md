# Together Apart v0.2 - setup and testing

Two ways to take a photo strip together while living apart:

- **Live Together (experimental):** WebRTC connects both cameras. Supabase Realtime carries room presence, call negotiation, theme choices and the countdown. Photos are not uploaded by this feature.
- **Photo Letters (works offline from the other person):** each person takes/uploads 4 photos, exports a `.json` photo letter, and privately sends it to the other. Once one person has both letters, they can combine four side-by-side photos and continue into the original editor.

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
4. In Supabase, verify **Realtime > Settings > Allow public access** is enabled for these experimental public channels. They use the random channel `lovebug-together:<room-id>` and do not require database tables or migrations.
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
5. The host changes the scrapbook frame; the guest should see the same selection. Choose 3-second shots for the first run.
6. The host clicks **take four photos together**. Both receive approximately synchronized countdowns, each generates four side-by-side images, and both can open the Sticker Playground when finished.
7. Finish and download on both devices, verify the PNG and optional browser-local album. No cloud photo persistence is involved.
8. Test camera denial, leaving rooms, page refresh, guest disconnect/rejoin and network failure. Switch to Photo Letters if WebRTC cannot connect.

## 4. Test Photo Letters

1. Both open **Together Apart > Photo Letters** independently.
2. Each uses **open my camera** (or **upload four**) to make a set of four camera photos. Note that sample SVG demo pictures cannot be exported as photo letters.
3. Each clicks **download my photo letter (.json)**. The `.json` contains private embedded camera photos.
4. Send that file to each other using a private messaging channel, not a public GitHub repository.
5. Import your partner's `.json` with **choose their photo letter**, or use **or upload their four photos** if they sent normal images instead.
6. Select a color and optional photo order, click **combine our four pictures**, then decorate, download or save to your own browser-local album.

## Important limits

- **Not yet an authenticated private room.** The random invitation is unguessable in normal use, but anyone who obtains the link can subscribe to the public room. Neither photos nor audio are intentionally sent through Supabase, but room metadata/connection messages are visible to its subscribers. Do not use this for sensitive content until room membership and Auth/RLS policies have been added.
- **STUN-only connectivity:** some mobile carriers, corporate Wi-Fi networks and symmetric NATs need a TURN relay. This release intentionally does not ship a TURN credential. It shows a failure notice and the Photo Letters fallback is available.
- **No sound:** camera video only, not a video calling app. Use your normal call app for audio if desired.
- **Not frame-perfect synchronization:** network timing affects when each phone takes a shot. Both capture their own composition locally, rather than uploading one central master file.
- **No AI person segmentation yet:** both entire camera views appear in two framed panels. The common background sets the scrapbook border color. Real-time person-only cutouts with one replacement scene need a later on-device segmentation phase with careful Android performance testing.
- **No online album yet:** the album remains local to each browser. Download your important photos; do not depend on browser storage as a backup.
- **Public repo:** never commit personal photo letters, camera pictures, `.env.local`, or secret keys.
