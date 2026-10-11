import { loadImage } from './photos';

export type SceneKey = 'blush' | 'butter' | 'lavender' | 'mint';

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

function background(ctx: CanvasRenderingContext2D, scene: SceneKey, w: number, h: number) {
  ctx.fillStyle = SCENES[scene].background;
  ctx.fillRect(0, 0, w, h);
  ctx.save();
  ctx.globalAlpha = 0.28;
  ctx.fillStyle = '#ffffff';
  for (let x = 0; x < w; x += 50) ctx.fillRect(x, 0, 20, h);
  ctx.globalAlpha = 0.16;
  for (let y = 0; y < h; y += 50) ctx.fillRect(0, y, w, 20);
  ctx.restore();
}

function cover(ctx: CanvasRenderingContext2D, image: CanvasImageSource, nativeWidth: number, nativeHeight: number, x: number, y: number, w: number, h: number, mirror: boolean) {
  if (!nativeWidth || !nativeHeight) throw new Error('Both cameras must be ready to take a picture.');
  const sourceRatio = nativeWidth / nativeHeight;
  const destinationRatio = w / h;
  let sx = 0, sy = 0, sw = nativeWidth, sh = nativeHeight;
  if (sourceRatio > destinationRatio) { sw = nativeHeight * destinationRatio; sx = (nativeWidth - sw) / 2; }
  else { sh = nativeWidth / destinationRatio; sy = (nativeHeight - sh) / 2; }
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 19);
  ctx.clip();
  if (mirror) {
    ctx.translate(2 * x + w, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(image, sx, sy, sw, sh, x, y, w, h);
  ctx.restore();
}

function makeCanvas(scene: SceneKey): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = 1100;
  canvas.height = 825;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is unavailable on this device.');
  background(ctx, scene, canvas.width, canvas.height);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 29px Trebuchet MS, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('TOGETHER, EVEN FROM FAR AWAY', canvas.width / 2, 58);
  ctx.font = 'bold 22px Trebuchet MS, sans-serif';
  ctx.fillStyle = SCENES[scene].accent;
  ctx.fillText('YOU + ME  /  LOVEBUG BOOTH', canvas.width / 2, 789);
  return { canvas, ctx };
}

// The v0.2 composition is deliberately side by side. Live person segmentation
// and a true single-scene green-screen composite are planned separately.
export function captureLivePair(local: HTMLVideoElement, remote: HTMLVideoElement, scene: SceneKey, swap: boolean): string {
  const { canvas, ctx } = makeCanvas(scene);
  const left = swap ? remote : local;
  const right = swap ? local : remote;
  cover(ctx, left, left.videoWidth, left.videoHeight, 34, 84, 500, 652, left === local);
  cover(ctx, right, right.videoWidth, right.videoHeight, 566, 84, 500, 652, right === local);
  return canvas.toDataURL('image/jpeg', 0.87);
}

export async function composePhotoLetters(yours: (string | null)[], partner: (string | null)[], scene: SceneKey, swap = false): Promise<string[]> {
  if (!completePhotoSet(yours) || !completePhotoSet(partner)) throw new Error('Both photo letters need four pictures.');
  const pairs = await Promise.all(yours.map(async (photo, index) => [await loadImage(photo), await loadImage(partner[index])] as const));
  return pairs.map(([mine, theirs]) => {
    const { canvas, ctx } = makeCanvas(scene);
    const left = swap ? theirs : mine;
    const right = swap ? mine : theirs;
    cover(ctx, left, left.naturalWidth, left.naturalHeight, 34, 84, 500, 652, false);
    cover(ctx, right, right.naturalWidth, right.naturalHeight, 566, 84, 500, 652, false);
    return canvas.toDataURL('image/jpeg', 0.87);
  });
}
