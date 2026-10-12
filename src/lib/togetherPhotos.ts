import { loadImage } from './photos';
import { CUSTOM_BACKGROUND_ID, getCustomBackground } from './customBackdrop';

export type SceneKey = 'blush' | 'butter' | 'lavender' | 'mint';
export type BackdropKey = 'original' | 'garden' | 'cafe' | 'beach' | 'moon' | 'custom';
export const BACKDROPS: Record<BackdropKey, { name: string; description: string; asset?: string; tint: string }> = {
  original: { name: 'Original cameras', description: 'Keep both real rooms', tint: '#f6d5e2' },
  garden: { name: 'Flower garden', description: 'A date among the flowers', asset: '/backgrounds/garden.svg', tint: '#d9f1e2' },
  cafe: { name: 'Little café', description: 'One cozy table for two', asset: '/backgrounds/cafe.svg', tint: '#f4dacd' },
  beach: { name: 'Sunset beach', description: 'Same sunset, two hearts', asset: '/backgrounds/beach.svg', tint: '#ffe6c5' },
  moon: { name: 'Moonlight rooftop', description: 'Our own starry night', asset: '/backgrounds/moon.svg', tint: '#d5d5ef' },
  custom: { name: 'Our own photo', description: 'A place that means something to us', tint: '#f9e6ed' },
};
const backdropImages = new Map<BackdropKey, HTMLImageElement>();
export function preloadBackdrop(key: BackdropKey): void {
  if (key === 'original' || key === 'custom' || backdropImages.has(key)) return;
  const image = new Image();
  image.src = BACKDROPS[key].asset!;
  backdropImages.set(key, image);
}


export const SCENES: Record<SceneKey, { name: string; background: string; accent: string }> = {
  blush: { name: 'Strawberry picnic', background: '#f7d6e0', accent: '#b75b7d' },
  butter: { name: 'Sunny afternoon', background: '#fff0c8', accent: '#bc835e' },
  lavender: { name: 'Moonlight date', background: '#e5dcf8', accent: '#8468a8' },
  mint: { name: 'Garden daydream', background: '#def1e5', accent: '#679582' },
};

export type PhotoLetter = {
  kind: 'lovebug-photo-letter';
  version: 1;
  createdAt: number;
  photos: [string, string, string, string];
};

const MAX_FILE_BYTES = 12 * 1024 * 1024;
const MAX_IMAGE_CHARS = 3_000_000;
const PHOTO_FORMAT = /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;

export function completePhotoSet(photos: (string | null)[]): photos is [string, string, string, string] {
  return photos.length === 4 && photos.every((photo): photo is string => typeof photo === 'string' && photo.length > 0);
}

export function createPhotoLetter(photos: (string | null)[]): PhotoLetter {
  if (!completePhotoSet(photos)) throw new Error('Take or upload all four pictures first.');
  if (!photos.every(photo => photo.length <= MAX_IMAGE_CHARS && PHOTO_FORMAT.test(photo))) {
    throw new Error('Only four camera photos (JPEG, PNG or WebP) can go into a photo letter.');
  }
  return { kind: 'lovebug-photo-letter', version: 1, createdAt: Date.now(), photos };
}

export function downloadPhotoLetter(photos: (string | null)[]): void {
  const pack = createPhotoLetter(photos);
  const blob = new Blob([JSON.stringify(pack)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `lovebug-photo-letter-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export async function readPhotoLetter(file: File): Promise<PhotoLetter> {
  if (file.size > MAX_FILE_BYTES) throw new Error('This photo letter is too large (12 MB maximum).');
  let raw: unknown;
  try { raw = JSON.parse(await file.text()); }
  catch { throw new Error('This is not a readable Lovebug photo letter.'); }
  if (!raw || typeof raw !== 'object') throw new Error('This is not a Lovebug photo letter.');
  const pack = raw as Partial<PhotoLetter>;
  if (pack.kind !== 'lovebug-photo-letter' || pack.version !== 1 || !Array.isArray(pack.photos) || !completePhotoSet(pack.photos)) {
    throw new Error('Wrong photo-letter format. Please send the .json exported by Lovebug Booth.');
  }
  if (!pack.photos.every(photo => photo.length <= MAX_IMAGE_CHARS && PHOTO_FORMAT.test(photo))) {
    throw new Error('The letter contains an unsupported picture.');
  }
  // Image decode rejects malformed data URLs before they reach the editor.
  await Promise.all(pack.photos.map(loadImage));
  return { kind: 'lovebug-photo-letter', version: 1, createdAt: typeof pack.createdAt === 'number' ? pack.createdAt : Date.now(), photos: pack.photos };
}

// The same renderer is used by live preview, live capture, and Photo Letters.
// Its only input differences are the canvas size and the image sources.
export type TogetherLayout = 'close' | 'balanced' | 'classic';
export type TogetherComposition = {
  scene: SceneKey;
  backdrop: BackdropKey;
  customBackgroundId: string | null;
  scaleHost: number;
  scaleGuest: number;
  swap: boolean;
  layout: TogetherLayout;
  mirrorHost: boolean;
  mirrorGuest: boolean;
  focusHost: number;
  focusGuest: number;
};

export const TOGETHER_WIDTH = 1100;
export const TOGETHER_HEIGHT = 825;
export const DEFAULT_COMPOSITION: TogetherComposition = {
  scene: 'blush', backdrop: 'original', customBackgroundId: null, scaleHost: 100, scaleGuest: 100, swap: false, layout: 'close',
  mirrorHost: false, mirrorGuest: false,
  focusHost: 50, focusGuest: 50,
};

export function isTogetherComposition(value: unknown): value is TogetherComposition {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<TogetherComposition>;
  return typeof item.scene === 'string' && Object.prototype.hasOwnProperty.call(SCENES, item.scene)
    && typeof item.backdrop === 'string' && Object.prototype.hasOwnProperty.call(BACKDROPS, item.backdrop)
    && (item.customBackgroundId === null || (typeof item.customBackgroundId === 'string' && CUSTOM_BACKGROUND_ID.test(item.customBackgroundId)))
    && (item.backdrop !== 'custom' || item.customBackgroundId !== null)
    && Number.isFinite(item.scaleHost) && item.scaleHost! >= 70 && item.scaleHost! <= 140
    && Number.isFinite(item.scaleGuest) && item.scaleGuest! >= 70 && item.scaleGuest! <= 140
    && (item.layout === 'close' || item.layout === 'balanced' || item.layout === 'classic')
    && typeof item.swap === 'boolean'
    && typeof item.mirrorHost === 'boolean' && typeof item.mirrorGuest === 'boolean'
    && typeof item.focusHost === 'number' && Number.isFinite(item.focusHost) && item.focusHost >= 0 && item.focusHost <= 100
    && typeof item.focusGuest === 'number' && Number.isFinite(item.focusGuest) && item.focusGuest >= 0 && item.focusGuest <= 100;
}

export type TogetherSource = { image: CanvasImageSource; width: number; height: number };
export type TogetherCutouts = { host: TogetherSource; guest: TogetherSource };

type PhotoArea = { x: number; y: number; w: number; h: number };
function drawVirtualBackground(ctx: CanvasRenderingContext2D, composition: TogetherComposition, photo: PhotoArea): void {
  const backdrop = composition.backdrop;
  const chosen = BACKDROPS[backdrop];
  preloadBackdrop(backdrop);
  ctx.fillStyle = chosen.tint;
  ctx.fillRect(photo.x, photo.y, photo.w, photo.h);
  const image = backdrop === 'custom' ? getCustomBackground(composition.customBackgroundId)?.image : backdropImages.get(backdrop);
  if (image?.complete && image.naturalWidth) {
    ctx.drawImage(image, photo.x, photo.y, photo.w, photo.h);
  }
}

function placePerson(ctx: CanvasRenderingContext2D, subject: TogetherSource, photo: PhotoArea,
  center: number, focus: number, scale: number, mirror: boolean): void {
  const height = photo.h * 1.02 * scale / 100;
  const width = height * subject.width / subject.height;
  const x = photo.x + photo.w * (center + (focus - 50) * 0.004) - width / 2;
  const y = photo.y + photo.h - height + 15;
  ctx.save();
  if (mirror) {
    ctx.translate(x * 2 + width, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(subject.image, x, y, width, height);
  ctx.restore();
}

function drawVirtualScene(ctx: CanvasRenderingContext2D, composition: TogetherComposition,
  photo: PhotoArea, cutouts: TogetherCutouts): void {
  drawVirtualBackground(ctx, composition, photo);
  const left = composition.swap ? cutouts.guest : cutouts.host;
  const right = composition.swap ? cutouts.host : cutouts.guest;
  const scaleLeft = composition.swap ? composition.scaleGuest : composition.scaleHost;
  const scaleRight = composition.swap ? composition.scaleHost : composition.scaleGuest;
  const mirrorLeft = composition.swap ? composition.mirrorGuest : composition.mirrorHost;
  const mirrorRight = composition.swap ? composition.mirrorHost : composition.mirrorGuest;
  const focusLeft = composition.swap ? composition.focusGuest : composition.focusHost;
  const focusRight = composition.swap ? composition.focusHost : composition.focusGuest;
  const center = composition.layout === 'close' ? 0.39 : composition.layout === 'balanced' ? 0.32 : 0.26;
  placePerson(ctx, left, photo, center, focusLeft, scaleLeft, mirrorLeft);
  placePerson(ctx, right, photo, 1 - center, focusRight, scaleRight, mirrorRight);
}


function scrapbookBackground(ctx: CanvasRenderingContext2D, scene: SceneKey): void {
  const theme = SCENES[scene];
  ctx.fillStyle = theme.background;
  ctx.fillRect(0, 0, TOGETHER_WIDTH, TOGETHER_HEIGHT);
  ctx.save();
  ctx.globalAlpha = 0.19;
  ctx.fillStyle = '#ffffff';
  for (let x = 0; x < TOGETHER_WIDTH; x += 54) ctx.fillRect(x, 0, 22, TOGETHER_HEIGHT);
  for (let y = 0; y < TOGETHER_HEIGHT; y += 54) ctx.fillRect(0, y, TOGETHER_WIDTH, 22);
  ctx.restore();
}

function coverWithFocus(
  ctx: CanvasRenderingContext2D, source: TogetherSource, x: number, y: number,
  w: number, h: number, focalPoint: number, mirror: boolean,
): void {
  if (!source.width || !source.height) throw new Error('Both cameras must be ready to take a picture.');
  let sx = 0, sy = 0, sw = source.width, sh = source.height;
  const sourceRatio = source.width / source.height;
  const targetRatio = w / h;
  if (sourceRatio > targetRatio) {
    sw = source.height * targetRatio;
    sx = (source.width - sw) * focalPoint / 100;
  } else {
    sh = source.width / targetRatio;
    sy = (source.height - sh) / 2;
  }
  ctx.save();
  // Mirror affects both the shared canvas preview and the exported photo.
  if (mirror) {
    ctx.translate(x * 2 + w, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(source.image, sx, sy, sw, sh, x, y, w, h);
  ctx.restore();
}

/**
 * Draw the single finished booth frame. The video previews are not separately
 * object-fit cropped; the actual result of this renderer is shown on screen.
 *
 * Original mode softly merges real rooms; virtual mode composites two
 * transparent subject cutouts over the same illustrated background.
 */
export function drawTogetherFrame(
  canvas: HTMLCanvasElement,
  host: TogetherSource,
  guest: TogetherSource,
  composition: TogetherComposition,
  scratch?: HTMLCanvasElement,
  cutouts?: TogetherCutouts,
): void {
  if (!host.width || !host.height || !guest.width || !guest.height) {
    throw new Error('Wait for both camera feeds before capturing.');
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is unavailable on this device.');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(canvas.width / TOGETHER_WIDTH, 0, 0, canvas.height / TOGETHER_HEIGHT, 0, 0);
  scrapbookBackground(ctx, composition.scene);

  const photo = { x: 34, y: 76, w: 1032, h: 662 };
  const left = composition.swap ? guest : host;
  const right = composition.swap ? host : guest;
  const mirrorLeft = composition.swap ? composition.mirrorGuest : composition.mirrorHost;
  const mirrorRight = composition.swap ? composition.mirrorHost : composition.mirrorGuest;
  const focusLeft = composition.swap ? composition.focusGuest : composition.focusHost;
  const focusRight = composition.swap ? composition.focusHost : composition.focusGuest;

  ctx.save();
  ctx.beginPath();
  ctx.roundRect(photo.x, photo.y, photo.w, photo.h, 16);
  ctx.clip();
  ctx.fillStyle = '#f8e9ee';
  ctx.fillRect(photo.x, photo.y, photo.w, photo.h);

  if (composition.backdrop !== 'original' && cutouts) {
    drawVirtualScene(ctx, composition, photo, cutouts);
  } else {
  // A single photo rectangle: no internal white frame, black gap or visible gutter.
  const overlap = composition.layout === 'close' ? 76 : composition.layout === 'balanced' ? 30 : 0;
  const sideWidth = (photo.w + overlap) / 2;
  const rightX = photo.x + photo.w - sideWidth;
  coverWithFocus(ctx, left, photo.x, photo.y, sideWidth, photo.h, focusLeft, mirrorLeft);

  if (overlap === 0) {
    coverWithFocus(ctx, right, rightX, photo.y, sideWidth, photo.h, focusRight, mirrorRight);
  } else {
    // Reuse one scratch canvas across preview frames to avoid allocating every RAF.
    const layer = scratch ?? document.createElement('canvas');
    if (layer.width !== canvas.width) layer.width = canvas.width;
    if (layer.height !== canvas.height) layer.height = canvas.height;
    const layerCtx = layer.getContext('2d');
    if (!layerCtx) throw new Error('Your device could not create the merge layer.');
    layerCtx.setTransform(1, 0, 0, 1, 0, 0);
    layerCtx.clearRect(0, 0, layer.width, layer.height);
    layerCtx.setTransform(layer.width / TOGETHER_WIDTH, 0, 0, layer.height / TOGETHER_HEIGHT, 0, 0);
    coverWithFocus(layerCtx, right, rightX, photo.y, sideWidth, photo.h, focusRight, mirrorRight);
    layerCtx.globalCompositeOperation = 'destination-in';
    const fade = layerCtx.createLinearGradient(rightX, 0, rightX + overlap, 0);
    fade.addColorStop(0, 'rgba(0,0,0,0)');
    fade.addColorStop(1, 'rgba(0,0,0,1)');
    layerCtx.fillStyle = fade;
    layerCtx.fillRect(rightX, photo.y, sideWidth, photo.h);
    layerCtx.globalCompositeOperation = 'source-over';
    ctx.drawImage(layer, 0, 0, TOGETHER_WIDTH, TOGETHER_HEIGHT);
  }

  }
  // A gentle matching grade across the entire image reduces lighting differences.
  ctx.fillStyle = 'rgba(255,236,239,0.08)';
  ctx.fillRect(photo.x, photo.y, photo.w, photo.h);
  const vignette = ctx.createLinearGradient(photo.x, 0, photo.x + photo.w, 0);
  vignette.addColorStop(0, 'rgba(78,39,59,0.10)');
  vignette.addColorStop(0.16, 'rgba(78,39,59,0)');
  vignette.addColorStop(0.84, 'rgba(78,39,59,0)');
  vignette.addColorStop(1, 'rgba(78,39,59,0.10)');
  ctx.fillStyle = vignette;
  ctx.fillRect(photo.x, photo.y, photo.w, photo.h);
  ctx.restore();

  ctx.textAlign = 'center';
  ctx.fillStyle = '#fffefe';
  ctx.font = 'bold 24px Trebuchet MS, sans-serif';
  ctx.fillText('ONE LITTLE PHOTO DATE', TOGETHER_WIDTH / 2, 48);
  ctx.fillStyle = SCENES[composition.scene].accent;
  ctx.font = 'bold 22px Trebuchet MS, sans-serif';
  ctx.fillText('YOU + ME  /  LOVEBUG BOOTH', TOGETHER_WIDTH / 2, 787);
}

export function captureLivePair(
  local: HTMLVideoElement,
  remote: HTMLVideoElement,
  composition: TogetherComposition,
  role: 'host' | 'guest',
  cutouts?: TogetherCutouts,
): string {
  const canvas = document.createElement('canvas');
  canvas.width = TOGETHER_WIDTH;
  canvas.height = TOGETHER_HEIGHT;
  const mine = { image: local, width: local.videoWidth, height: local.videoHeight };
  const theirs = { image: remote, width: remote.videoWidth, height: remote.videoHeight };
  drawTogetherFrame(canvas, role === 'host' ? mine : theirs, role === 'guest' ? mine : theirs, composition, undefined, cutouts);
  return canvas.toDataURL('image/jpeg', 0.90);
}

export async function composePhotoLetters(
  yours: (string | null)[],
  partner: (string | null)[],
  composition: TogetherComposition,
): Promise<string[]> {
  if (!completePhotoSet(yours) || !completePhotoSet(partner)) throw new Error('Both photo letters need four pictures.');
  const pairs = await Promise.all(yours.map(async (photo, index) => [await loadImage(photo), await loadImage(partner[index])] as const));
  if (composition.backdrop === 'custom' && !getCustomBackground(composition.customBackgroundId)) {
    throw new Error('Upload your custom background again before combining these photos.');
  }
  const processor = composition.backdrop === 'original' ? null
    : await (await import('./personCutout')).PersonCutoutProcessor.create('IMAGE');
  try {
    const combined: string[] = [];
    for (const [mine, theirs] of pairs) {
    const canvas = document.createElement('canvas');
    canvas.width = TOGETHER_WIDTH;
    canvas.height = TOGETHER_HEIGHT;
    const cutouts: TogetherCutouts | undefined = processor ? {
      host: processor.cutout(mine, mine.naturalWidth, mine.naturalHeight),
      guest: processor.cutout(theirs, theirs.naturalWidth, theirs.naturalHeight),
    } : undefined;
    drawTogetherFrame(canvas,
      { image: mine, width: mine.naturalWidth, height: mine.naturalHeight },
      { image: theirs, width: theirs.naturalWidth, height: theirs.naturalHeight },
      composition, undefined, cutouts,
    );
    combined.push(canvas.toDataURL('image/jpeg', 0.90));
    // Let the browser update its loading state on slower Android devices.
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    }
    return combined;
  } finally { processor?.close(); }
}
