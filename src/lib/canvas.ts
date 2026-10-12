import type { EditorDraft, StickerItem, ThemeKey } from '../types';
import { THEMES } from './themes';

export const PRINT_WIDTH = 500;
export const PRINT_HEIGHT = 1080;
export const PHOTO_X = 40;
export const PHOTO_Y = 101;
export const PHOTO_W = 420;
export const PHOTO_H = 206;
export const PHOTO_GAP = 10;

export type CanvasRenderOptions = {
  photos: (string | null)[];
  theme: ThemeKey;
  draft: EditorDraft;
  images: Map<string, HTMLImageElement>;
  selectedId?: string | null;
  previewLine?: import('../types').DrawStroke | null;
};

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, fill?: string, stroke?: string, lineWidth = 1) {
  ctx.beginPath(); ctx.roundRect(x, y, w, h, r);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lineWidth; ctx.stroke(); }
}

function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number, focusY = 50) {
  const iw = img.naturalWidth, ih = img.naturalHeight;
  if (!iw || !ih) return;
  const ratio = Math.max(w / iw, h / ih);
  const scaledW = iw * ratio, scaledH = ih * ratio;
  ctx.drawImage(img, x + (w - scaledW) / 2, y + (h - scaledH) * Math.max(0, Math.min(100, focusY)) / 100, scaledW, scaledH);
}

function frameFilter(filter: EditorDraft['filter']) {
  switch (filter) {
    case 'warm': return 'sepia(15%) saturate(120%) contrast(102%)';
    case 'dreamy': return 'brightness(108%) saturate(84%) contrast(95%)';
    case 'vintage': return 'sepia(37%) saturate(70%) contrast(94%)';
    case 'bw': return 'grayscale(100%) contrast(109%)';
    default: return 'none';
  }
}

function drawStroke(ctx: CanvasRenderingContext2D, stroke: import('../types').DrawStroke) {
  const points = stroke.points;
  if (points.length === 0) return;
  ctx.save();
  ctx.strokeStyle = stroke.color;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = stroke.width;
  ctx.beginPath(); ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
  if (points.length === 1) ctx.lineTo(points[0].x + .05, points[0].y + .05);
  ctx.stroke(); ctx.restore();
}

export function stickerAt(item: StickerItem, px: number, py: number): boolean {
  const angle = -item.rotation * Math.PI / 180;
  const dx = px - item.x, dy = py - item.y;
  const localX = dx * Math.cos(angle) - dy * Math.sin(angle);
  const localY = dx * Math.sin(angle) + dy * Math.cos(angle);
  return Math.abs(localX) <= item.width / 2 + 8 && Math.abs(localY) <= item.height / 2 + 8;
}

export function drawStrip(ctx: CanvasRenderingContext2D, opts: CanvasRenderOptions) {
  const { photos, theme, draft, images, selectedId, previewLine } = opts;
  const t = THEMES[theme];
  ctx.clearRect(0, 0, PRINT_WIDTH, PRINT_HEIGHT);
  // A delicate paper strip with repeated printed gingham threads.
  ctx.fillStyle = t.background; ctx.fillRect(0, 0, PRINT_WIDTH, PRINT_HEIGHT);
  ctx.fillStyle = 'rgba(255,255,255,.11)';
  for (let i = 0; i < PRINT_WIDTH; i += 26) ctx.fillRect(i, 0, 12, PRINT_HEIGHT);
  for (let j = 0; j < PRINT_HEIGHT; j += 26) ctx.fillRect(0, j, PRINT_WIDTH, 12);
  ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 3;
  ctx.setLineDash([6, 8]); ctx.strokeRect(13, 13, PRINT_WIDTH - 26, PRINT_HEIGHT - 26); ctx.restore();

  roundedRect(ctx, 65, 32, 370, 48, 24, 'rgba(255,255,255,.5)');
  ctx.fillStyle = t.ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = 'bold 24px "Trebuchet MS", sans-serif';
  ctx.fillText('you + me  ♡  lovebug club', PRINT_WIDTH / 2, 56);

  for (let i = 0; i < 4; i++) {
    const x = PHOTO_X, y = PHOTO_Y + i * (PHOTO_H + PHOTO_GAP);
    ctx.shadowColor = 'rgba(112,59,73,.15)'; ctx.shadowBlur = 7; ctx.shadowOffsetY = 4;
    roundedRect(ctx, x - 4, y - 4, PHOTO_W + 8, PHOTO_H + 8, 7, '#ffffff');
    ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    ctx.save(); ctx.beginPath(); ctx.roundRect(x, y, PHOTO_W, PHOTO_H, 4); ctx.clip();
    const img = photos[i] ? images.get(photos[i]!) : null;
    if (img && img.complete && img.naturalWidth) {
      ctx.filter = frameFilter(draft.filter);
      drawCover(ctx, img, x, y, PHOTO_W, PHOTO_H, draft.photoFocusY?.[i] ?? 50);
      ctx.filter = 'none';
    } else {
      ctx.fillStyle = i % 2 ? t.paper : t.highlight;
      ctx.fillRect(x, y, PHOTO_W, PHOTO_H);
      ctx.fillStyle = t.ink; ctx.font = 'italic 23px Georgia, serif';
      ctx.fillText('a little moment, just for us  ♡', PRINT_WIDTH / 2, y + 100);
    }
    ctx.restore();
  }

  ctx.textAlign = 'center'; ctx.fillStyle = t.ink;
  ctx.font = 'italic 24px Georgia, serif';
  ctx.fillText(draft.caption.trim().slice(0, 38) || 'just us, always ♡', PRINT_WIDTH / 2, 1003);
  ctx.font = 'bold 12px "Trebuchet MS", sans-serif';
  ctx.fillText('LOVEBUG BOOTH   ·   MADE WITH LOVE', PRINT_WIDTH / 2, 1036);

  for (const stroke of draft.strokes) drawStroke(ctx, stroke);
  if (previewLine) drawStroke(ctx, previewLine);

  for (const item of draft.stickers) {
    ctx.save();
    ctx.translate(item.x, item.y);
    ctx.rotate(item.rotation * Math.PI / 180);
    ctx.shadowColor = 'rgba(99,50,62,.19)'; ctx.shadowOffsetY = 3; ctx.shadowBlur = 5;
    if (item.kind === 'image' && item.src) {
      const image = images.get(item.src);
      if (image && image.complete && image.naturalWidth) {
        ctx.drawImage(image, -item.width / 2, -item.height / 2, item.width, item.height);
      }
    } else if (item.kind === 'text') {
      roundedRect(ctx, -item.width / 2, -item.height / 2, item.width, item.height, 21, 'rgba(255,255,252,.96)', '#fff', 4);
      ctx.fillStyle = item.color || '#da5a82'; ctx.shadowBlur = 0;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const size = Math.max(14, Math.min(32, 29 * (item.height / 60)));
      ctx.font = `bold ${size}px "Trebuchet MS", sans-serif`;
      ctx.fillText((item.text || 'love ♡').slice(0, 32), 0, 1, item.width - 16);
    }
    ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    if (selectedId === item.id) {
      ctx.strokeStyle = '#fefeff'; ctx.lineWidth = 3; ctx.setLineDash([8, 6]);
      ctx.strokeRect(-item.width / 2 - 5, -item.height / 2 - 5, item.width + 10, item.height + 10);
      ctx.setLineDash([]);
      ctx.fillStyle = '#f8f6ff'; ctx.strokeStyle = '#df7299'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(item.width / 2, item.height / 2, 11, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -item.height / 2); ctx.lineTo(0, -item.height / 2 - 30); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, -item.height / 2 - 33, 11, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
    }
    ctx.restore();
  }
}

export function handleAt(item: StickerItem, px: number, py: number): 'rotate' | 'resize' | null {
  const angle = -item.rotation * Math.PI / 180;
  const dx = px - item.x, dy = py - item.y;
  const x = dx * Math.cos(angle) - dy * Math.sin(angle);
  const y = dx * Math.sin(angle) + dy * Math.cos(angle);
  if (Math.hypot(x, y - (-item.height / 2 - 33)) < 23) return 'rotate';
  if (Math.hypot(x - item.width / 2, y - item.height / 2) < 26) return 'resize';
  return null;
}
