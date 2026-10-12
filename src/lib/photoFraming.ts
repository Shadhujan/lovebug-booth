import type { PhotoFraming } from '../types';

export const DEFAULT_PHOTO_FRAMING: PhotoFraming = { panX: 0, panY: 0, zoom: 1 };
export const MAX_PHOTO_ZOOM = 3;

function bound(value: number, min: number, max: number): number {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min;
}

/**
 * The pan values are normalized to available cover overflow: -1 = left/top
 * edge of the image has been pushed to the far edge, +1 = the opposite.
 * Drag gestures move the source in the same direction as the finger.
 */
export function normalizePhotoFraming(value?: Partial<PhotoFraming> | null, legacyFocusY = 50): PhotoFraming {
  return {
    panX: bound(value?.panX ?? 0, -1, 1),
    panY: bound(value?.panY ?? (1 - bound(legacyFocusY, 0, 100) / 50), -1, 1),
    zoom: bound(value?.zoom ?? 1, 1, MAX_PHOTO_ZOOM),
  };
}

export function frameGeometry(
  imageWidth: number, imageHeight: number, frameWidth: number, frameHeight: number,
  framing: PhotoFraming,
) {
  const photo = normalizePhotoFraming(framing);
  const scale = Math.max(frameWidth / imageWidth, frameHeight / imageHeight) * photo.zoom;
  const width = imageWidth * scale;
  const height = imageHeight * scale;
  const overflowX = Math.max(0, width - frameWidth);
  const overflowY = Math.max(0, height - frameHeight);
  return {
    width, height, overflowX, overflowY,
    x: (frameWidth - width) / 2 + photo.panX * overflowX / 2,
    y: (frameHeight - height) / 2 + photo.panY * overflowY / 2,
  };
}

/** Identical crop logic for the Review preview and exported sticker strip. */
export function drawFramedPhoto(
  ctx: CanvasRenderingContext2D, image: HTMLImageElement,
  x: number, y: number, width: number, height: number, framing: PhotoFraming,
): void {
  if (!image.naturalWidth || !image.naturalHeight) return;
  const position = frameGeometry(image.naturalWidth, image.naturalHeight, width, height, framing);
  ctx.drawImage(image, x + position.x, y + position.y, position.width, position.height);
}

export function moveFramedPhoto(
  start: PhotoFraming, deltaX: number, deltaY: number,
  imageWidth: number, imageHeight: number, frameWidth: number, frameHeight: number,
  nextZoom = start.zoom,
): PhotoFraming {
  const zoom = bound(nextZoom, 1, MAX_PHOTO_ZOOM);
  const geometry = frameGeometry(imageWidth, imageHeight, frameWidth, frameHeight, { ...start, zoom });
  return normalizePhotoFraming({
    zoom,
    panX: geometry.overflowX > 0.001 ? start.panX + (2 * deltaX / geometry.overflowX) : 0,
    panY: geometry.overflowY > 0.001 ? start.panY + (2 * deltaY / geometry.overflowY) : 0,
  });
}
