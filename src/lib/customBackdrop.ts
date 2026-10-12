/**
 * Temporary, in-memory backgrounds chosen by either person.
 * We resize every upload before sharing it directly through a WebRTC data
 * channel; the photo never goes to Supabase Storage or the Git repository.
 */
export const CUSTOM_BACKGROUND_ID = /^[a-f0-9]{32}$/;
export const MAX_CUSTOM_BACKGROUND_CHARS = 850_000;
export const CUSTOM_BACKGROUND_CHUNK = 12_000;
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export type CustomBackground = { id: string; dataUrl: string; image: HTMLImageElement };
const backgrounds = new Map<string, CustomBackground>();

export function getCustomBackground(id: string | null): CustomBackground | undefined {
  return id ? backgrounds.get(id) : undefined;
}

function getNewId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, n => n.toString(16).padStart(2, '0')).join('');
}

function loadAsImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('This background picture could not be opened. Try a JPEG or PNG.'));
    img.src = url;
  });
}

export async function registerCustomBackground(id: string, dataUrl: string): Promise<CustomBackground> {
  if (!CUSTOM_BACKGROUND_ID.test(id) || dataUrl.length > MAX_CUSTOM_BACKGROUND_CHARS
    || !/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(dataUrl)) {
    throw new Error('This shared background is not a supported photo.');
  }
  const image = await loadAsImage(dataUrl);
  if (!image.naturalWidth || !image.naturalHeight) throw new Error('This background has no readable picture.');
  const background = { id, dataUrl, image };
  backgrounds.set(id, background);
  // Prevent a long photo-date session from accumulating unbounded images.
  while (backgrounds.size > 4) backgrounds.delete(backgrounds.keys().next().value!);
  return background;
}

export async function createCustomBackground(file: File): Promise<CustomBackground> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    throw new Error('Choose a JPEG, PNG, or WebP background image.');
  }
  if (file.size > MAX_UPLOAD_BYTES) throw new Error('Please choose a background smaller than 10 MB.');
  const objectUrl = URL.createObjectURL(file);
  let image: HTMLImageElement;
  try { image = await loadAsImage(objectUrl); }
  finally { URL.revokeObjectURL(objectUrl); }

  // Crop to the same photo rectangle seen inside the booth, not the whole strip.
  const canvas = document.createElement('canvas');
  canvas.width = 1200; canvas.height = 770;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser cannot resize a background image.');
  const sourceRatio = image.naturalWidth / image.naturalHeight;
  const targetRatio = canvas.width / canvas.height;
  let sx = 0, sy = 0, sw = image.naturalWidth, sh = image.naturalHeight;
  if (sourceRatio > targetRatio) {
    sw = image.naturalHeight * targetRatio;
    sx = (image.naturalWidth - sw) / 2;
  } else {
    sh = image.naturalWidth / targetRatio;
    sy = (image.naturalHeight - sh) / 2;
  }
  ctx.drawImage(image, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  let dataUrl = canvas.toDataURL('image/jpeg', 0.78);
  if (dataUrl.length > MAX_CUSTOM_BACKGROUND_CHARS) dataUrl = canvas.toDataURL('image/jpeg', 0.55);
  if (dataUrl.length > MAX_CUSTOM_BACKGROUND_CHARS) throw new Error('This background is too detailed to share. Try a simpler photo.');
  return registerCustomBackground(getNewId(), dataUrl);
}
