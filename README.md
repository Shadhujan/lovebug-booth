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
- Supabase is reserved for the *next* milestone: private two-person log-in and shared album, with RLS + private Storage. No Supabase secrets belong in frontend files.

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

Visit the generated HTTPS URL on her phone. The app is mobile-responsive. For a shared cloud album, finish Supabase integration first (future milestone); until then, use **Download Strip** and share the PNG yourself.

### Supabase project

Your Supabase project can stay active, but **v0.1 doesn't connect to it**. The file `.env.example` is a future-facing template, not something you must configure now. We will add secure passwordless sign-in, member-scoped policies, a private storage bucket, and an album shared across your two accounts in the next milestone.

### Code layout

```text
src/
  components/        # Each interactive screen + custom cutout editor
  lib/canvas.ts      # Strip composition and sticker rendering
  lib/cutout.ts      # Browser-only shape/background cutout processing
  lib/photos.ts      # Capture and photo compression
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
