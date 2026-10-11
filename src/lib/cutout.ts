import { fileToDataURL, loadImage } from './photos';

export type CutoutShape = 'circle' | 'heart' | 'rounded' | 'original';

function shapePath(ctx: CanvasRenderingContext2D, shape: CutoutShape, x: number, y: number, w: number, h: number) {
  ctx.beginPath();
  if (shape === 'circle') ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
  else if (shape === 'heart') {
    const cx = x + w / 2;
    ctx.moveTo(cx, y + h * .95);
    ctx.bezierCurveTo(x + w * .04, y + h * .64, x - w * .06, y + h * .2, x + w * .24, y + h * .16);
    ctx.bezierCurveTo(cx - w * .05, y + h * .04, cx, y + h * .27, cx, y + h * .27);
    ctx.bezierCurveTo(cx, y + h * .27, cx + w * .08, y + h * .04, x + w * .76, y + h * .16);
    ctx.bezierCurveTo(x + w * 1.06, y + h * .2, x + w * .96, y + h * .64, cx, y + h * .95);
  }
  else ctx.roundRect(x, y, w, h, shape === 'rounded' ? 72 : 8);
  ctx.closePath();
}

function clearConnectedBackground(canvas: HTMLCanvasElement, tolerance: number) {
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return;
  const { width, height } = canvas;
  const data = context.getImageData(0, 0, width, height);
  const pixels = data.data;
  const pixelCount = width * height;
  const visited = new Uint8Array(pixelCount);
  const queue = new Uint32Array(pixelCount);
  let end = 0, head = 0;
  // Average the four corner colors; good for simple solid-color backgrounds.
  const p = [0, width - 1, (height - 1) * width, pixelCount - 1];
  const bg = [0, 0, 0];
  for (const index of p) for (let channel = 0; channel < 3; channel++) bg[channel] += pixels[index * 4 + channel] / p.length;
  const thresholdSquared = 3 * tolerance * tolerance;
  const enqueue = (i: number) => {
    if (visited[i]) return;
    visited[i] = 1;
    const off = i * 4;
    const d0 = pixels[off] - bg[0], d1 = pixels[off + 1] - bg[1], d2 = pixels[off + 2] - bg[2];
    if (d0 * d0 + d1 * d1 + d2 * d2 <= thresholdSquared) queue[end++] = i;
  };
  for (let x = 0; x < width; x++) { enqueue(x); enqueue((height - 1) * width + x); }
  for (let y = 0; y < height; y++) { enqueue(y * width); enqueue(y * width + width - 1); }
  while (head < end) {
    const i = queue[head++];
    pixels[i * 4 + 3] = 0;
    const x = i % width, y = Math.floor(i / width);
    if (x > 0) enqueue(i - 1);
    if (x < width - 1) enqueue(i + 1);
    if (y > 0) enqueue(i - width);
    if (y < height - 1) enqueue(i + width);
  }
  context.putImageData(data, 0, 0);
}

export async function makeCutout(file: File, shape: CutoutShape, removeBackground: boolean, tolerance: number): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Please choose an image.');
  if (file.size > 15 * 1024 * 1024) throw new Error('Choose a picture smaller than 15 MB.');
  const img = await loadImage(await fileToDataURL(file));
  const size = 480, margin = 22;
  const working = document.createElement('canvas');
  working.width = size; working.height = size;
  const wctx = working.getContext('2d');
  if (!wctx) throw new Error('Your browser does not support image editing.');
  const a = img.naturalWidth / img.naturalHeight;
  const destA = 1;
  let sx = 0, sy = 0, sw = img.naturalWidth, sh = img.naturalHeight;
  if (a > destA) { sw = sh; sx = (img.naturalWidth - sw) / 2; }
  else { sh = sw; sy = (img.naturalHeight - sh) / 2; }
  wctx.drawImage(img, sx, sy, sw, sh, 0, 0, size, size);
  if (removeBackground) clearConnectedBackground(working, tolerance);

  const result = document.createElement('canvas');
  result.width = size; result.height = size;
  const ctx = result.getContext('2d');
  if (!ctx) throw new Error('Your browser does not support cutouts.');
  const inset = shape === 'original' ? 10 : margin;
  ctx.save();
  shapePath(ctx, shape, inset, inset, size - inset * 2, size - inset * 2);
  ctx.clip();
  ctx.drawImage(working, inset, inset, size - inset * 2, size - inset * 2);
  ctx.restore();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 15;
  ctx.lineJoin = 'round';
  shapePath(ctx, shape, inset, inset, size - inset * 2, size - inset * 2);
  ctx.stroke();
  return result.toDataURL('image/png');
}
