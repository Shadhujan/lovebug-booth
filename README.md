# Lovebug Booth ♡

**Four photos. Two lovebugs. So many stickers.**

A playful, mobile-first couples photo booth. This is a personal project, not a business: open the booth, take or upload four pictures, decorate the strip with handmade stickers and cutouts, and save your little moments.

![Approved Sticker Playground visual concept](docs/approved-sticker-playground-concept.png)

> The concept illustration is a design reference. The actual UI uses responsive HTML/CSS and an interactive Canvas editor, rather than a flattened screenshot.

## Get started (Windows PowerShell)

Prerequisites: Node.js 22.12+ or 24+, npm, Git. The versions you already have (Node 24.16, npm 11.5.2) are suitable.

```powershell
# In your local clone of https://github.com/Shadhujan/lovebug-booth
npm install
npm run dev
```

Open `http://localhost:5173` on your laptop. **Try the illustrated demo first** to test the editor without granting camera permission.

### Together Apart v0.2 (new)

Two ways to make pictures together while far away:

- **Live Together (experimental):** two camera feeds in a temporary invite-link room using WebRTC and Supabase Realtime signaling, synchronized four-shot countdown, shared scrapbook frame choices and direct handoff to Sticker Playground.
- **Photo Letters:** independent four-photo captures, portable private `.json` photo packs, offline/asynchronous side-by-side composition, then the normal sticker editor.

The original solo photo booth remains available. The common frame background is a decorative border in v0.2; AI removal of both real backgrounds is planned for a later release. These experimental room links are **not authenticated private rooms** yet. See the complete setup, phone test steps, privacy limits and TURN relay note in [Together Apart setup](docs/TOGETHER_APART_SETUP.md).

### Features in v0.1

- Responsive scrapbook-style homepage and navigation, designed for mobile touch.
- Four original photo-strip themes and a funny pose roulette.
- Browser camera capture with per-shot countdown (3, 5, or 10 seconds), review, retake, and photo uploads.
- Original, illustrated demo photos so you can explore without a camera.
- Canvas-based drag-and-drop sticker playground; resize and rotate handles, touch pinch gestures, duplicate, delete, layer order, undo/redo.
- Fourteen original SVG stickers, plus text stickers and handwritten captions.
- Doodle mode with brush colors and sizes; five photo looks (including black and white).
- Custom sticker maker: import your own picture, shape cutout (circle, heart, rounded, original), optional *simple plain-color background remover*, and a persistent local sticker box.
- High-quality PNG downloads, final result screen, and an album that saves photos in this browser with IndexedDB.
- No account required, no trackers, and no automatic cloud upload.

### Important privacy details

- **The album is local-only in v0.1.** Saving on your laptop does **not** make it available on her phone. Browser data clearing or changing browsers can remove the album; download anything you care about.
- The supplied custom background remover is based on edge colors; it is **not an AI model** and may be inaccurate with busy photo backgrounds. Circle/heart shaped cutouts always work.
- Browser camera access is supported on `localhost` or an HTTPS website. On another device over plain `http://192.168.x.x`, you can browse/use photo uploads but camera access may be unavailable.
- This repository is currently public: **never commit personal photos, real keys, local `.env` files, or tokens.** The demo illustrations and sticker art are original.
- No third-party Pinterest images are shipped. Pinterest was used as visual inspiration, not a source of unlicensed assets.

### Tech stack

- React 19 + TypeScript + Vite 7
- Small handcrafted responsive CSS stylesheet (no large CSS framework required)
- Browser Camera API, Canvas 2D, Pointer Events, IndexedDB, PNG export
- Static deployment compatible with Cloudflare Pages / Netlify / Vercel
- Supabase Realtime is optional in v0.2 for signaling temporary live rooms; private two-person login and shared album with RLS + private Storage remain future work. No secret keys belong in frontend files.

### Scripts

```powershell
npm run dev          # local development
npm run typecheck    # TypeScript validation
npm run build        # production static site to dist/
npm run preview      # preview the build
```

### Deployment (when ready for her phone)

Use a static host that provides HTTPS, such as Cloudflare Pages. Connect your GitHub repo and configure:

| Setting | Value |
| --- | --- |
| Framework | Vite |
| Build command | `npm run build` |
| Output directory | `dist` |

Visit the generated HTTPS URL on her phone. The app is mobile-responsive. Live Together also needs your publishable Supabase variables configured for the Pages deployment. For a shared cloud album, complete the separate Auth/Storage integration later; until then, use **Download Strip** and share the PNG yourself.

### Supabase project

The original solo booth and Photo Letters work without Supabase. **Live Together requires only Supabase Realtime** plus the Project URL and publishable key in `.env.local` (or your deployment environment variables). Do not commit that local file. Room links are unlisted, not authenticated; private albums with verified membership and Storage policies will come later. [Full setup guide](docs/TOGETHER_APART_SETUP.md).

### Code layout

```text
src/
  components/        # Each interactive screen + custom cutout editor
  lib/canvas.ts      # Strip composition and sticker rendering
  lib/cutout.ts      # Browser-only shape/background cutout processing
  lib/photos.ts      # Capture and photo compression
  lib/togetherPhotos.ts  # Photo Letters and side-by-side composition
  lib/storage.ts     # IndexedDB local album and sticker box
  lib/themes.ts      # Frame themes, pose prompts and sticker catalog
  types.ts           # Domain types
  styles.css         # Responsive art direction
public/
  stickers/           # Original, reusable SVG sticker pack
  demo/               # Original placeholder portraits
  favicon.svg
  manifest.webmanifest
```

See [Milestones](docs/MILESTONES.md) for the feature roadmap.

---

Made for two people and their silly little moments. ♡
