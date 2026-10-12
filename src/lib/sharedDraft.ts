import type { DrawStroke, EditorDraft, PhotoFraming, StickerItem } from '../types';

/** Small, item-level edits let two lovebugs add different stickers/doodles without
 * replacing one another's entire scrapbook. If both edit the SAME item at once,
 * the last received edit wins. No photos or passwords are included. */
export type DraftDelta = {
  stickers?: StickerItem[];
  removedStickers?: string[];
  stickerOrder?: string[];
  strokes?: DrawStroke[];
  removedStrokes?: string[];
  filter?: EditorDraft['filter'];
  caption?: string;
  photoFraming?: PhotoFraming[];
  frame?: { index: number; value: PhotoFraming };
};

type Identified = { id: string };
const changed = (a: unknown, b: unknown) => JSON.stringify(a) !== JSON.stringify(b);
function listDelta<T extends Identified>(before: T[], after: T[]) {
  const earlier = new Map(before.map(item => [item.id, item]));
  const later = new Set(after.map(item => item.id));
  return {
    upsert: after.filter(item => changed(earlier.get(item.id), item)),
    remove: before.filter(item => !later.has(item.id)).map(item => item.id),
  };
}

export function diffDraft(before: EditorDraft, after: EditorDraft): DraftDelta {
  const stickers = listDelta(before.stickers, after.stickers);
  const strokes = listDelta(before.strokes, after.strokes);
  const beforeOrder = before.stickers.map(item => item.id);
  const afterOrder = after.stickers.map(item => item.id);
  // Only reorder an unchanged set of stickers, never overwrite a partner's new ones.
  const reorder = !stickers.upsert.length && !stickers.remove.length && changed(beforeOrder, afterOrder);
  return {
    ...(stickers.upsert.length ? { stickers: stickers.upsert } : {}),
    ...(stickers.remove.length ? { removedStickers: stickers.remove } : {}),
    ...(reorder ? { stickerOrder: afterOrder } : {}),
    ...(strokes.upsert.length ? { strokes: strokes.upsert } : {}),
    ...(strokes.remove.length ? { removedStrokes: strokes.remove } : {}),
    ...(before.filter !== after.filter ? { filter: after.filter } : {}),
    ...(before.caption !== after.caption ? { caption: after.caption } : {}),
    ...(changed(before.photoFraming, after.photoFraming) ? { photoFraming: after.photoFraming } : {}),
  };
}

export function hasDraftChanges(delta: DraftDelta): boolean { return Object.keys(delta).length > 0; }

function merge<T extends Identified>(before: T[], updates: T[] = [], removed: string[] = []): T[] {
  const deleted = new Set(removed);
  const byId = new Map(updates.map(item => [item.id, item]));
  const result = before.filter(item => !deleted.has(item.id)).map(item => byId.get(item.id) ?? item);
  const seen = new Set(result.map(item => item.id));
  for (const item of updates) if (!seen.has(item.id) && !deleted.has(item.id)) { result.push(item); seen.add(item.id); }
  return result;
}

export function applyDraftDelta(base: EditorDraft, delta: DraftDelta): EditorDraft {
  let stickers = merge(base.stickers, delta.stickers, delta.removedStickers);
  if (stickers.some(item => item.layer !== undefined)) {
    // A stable layer (and UUID tie-break) makes two simultaneous sticker adds
    // appear in exactly the same order on both phones.
    stickers = [...stickers].sort((a,b) => (a.layer ?? -1) - (b.layer ?? -1) || a.id.localeCompare(b.id));
  }
  if (delta.stickerOrder) {
    const order = new Map(delta.stickerOrder.map((id, i) => [id, i]));
    stickers = [...stickers].sort((a,b) => (order.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (order.get(b.id) ?? Number.MAX_SAFE_INTEGER));
  }
  return {
    ...base,
    stickers,
    strokes: merge(base.strokes, delta.strokes, delta.removedStrokes),
    ...(delta.filter !== undefined ? { filter: delta.filter } : {}),
    ...(delta.caption !== undefined ? { caption: delta.caption } : {}),
    ...(delta.photoFraming !== undefined ? { photoFraming: delta.photoFraming } : {}),
    ...(delta.frame && delta.frame.index >= 0 && delta.frame.index < 4 ? { photoFraming: Array.from({length:4}, (_,i) => i === delta.frame!.index ? delta.frame!.value : base.photoFraming?.[i] ?? {panX:0,panY:0,zoom:1}) } : {}),
  };
}

/** Undo only the properties and IDs changed by this person's action. */
export function invertDraftDelta(before: EditorDraft, delta: DraftDelta): DraftDelta {
  const originalStickers = new Map(before.stickers.map(item => [item.id, item]));
  const originalStrokes = new Map(before.strokes.map(item => [item.id, item]));
  const affectedStickers = [...(delta.stickers ?? []).map(item => item.id), ...(delta.removedStickers ?? [])];
  const affectedStrokes = [...(delta.strokes ?? []).map(item => item.id), ...(delta.removedStrokes ?? [])];
  return {
    ...(affectedStickers.length ? {
      stickers: affectedStickers.flatMap(id => originalStickers.has(id) ? [originalStickers.get(id)!] : []),
      removedStickers: affectedStickers.filter(id => !originalStickers.has(id)),
    } : {}),
    ...(affectedStrokes.length ? {
      strokes: affectedStrokes.flatMap(id => originalStrokes.has(id) ? [originalStrokes.get(id)!] : []),
      removedStrokes: affectedStrokes.filter(id => !originalStrokes.has(id)),
    } : {}),
    ...(delta.stickerOrder ? { stickerOrder: before.stickers.map(item => item.id) } : {}),
    ...(delta.filter !== undefined ? { filter: before.filter } : {}),
    ...(delta.caption !== undefined ? { caption: before.caption } : {}),
    ...(delta.photoFraming !== undefined ? { photoFraming: before.photoFraming ?? [] } : {}),
    ...(delta.frame ? { frame: { index: delta.frame.index, value: before.photoFraming?.[delta.frame.index] ?? {panX:0,panY:0,zoom:1} } } : {}),
  };
}

/** Guard untrusted peer payloads before handing them to the canvas renderer. */
export function isDraftDelta(value: unknown): value is DraftDelta {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const d = value as DraftDelta;
  const keys = Object.keys(d);
  if (!keys.length || keys.some(key => !['stickers', 'removedStickers', 'stickerOrder', 'strokes', 'removedStrokes', 'filter', 'caption', 'photoFraming', 'frame'].includes(key))) return false;
  if (d.filter !== undefined && !['none','warm','dreamy','vintage','bw'].includes(d.filter)) return false;
  if (d.caption !== undefined && (typeof d.caption !== 'string' || d.caption.length > 38)) return false;
  const ids = (items?: unknown) => items === undefined || (Array.isArray(items) && items.length <= 120 && items.every(item => typeof item === 'string' && item.length <= 90));
  if (!ids(d.removedStickers) || !ids(d.removedStrokes) || !ids(d.stickerOrder)) return false;
  if (d.stickers !== undefined && (!Array.isArray(d.stickers) || d.stickers.length > 120 || !d.stickers.every(item => item && typeof item.id === 'string' && item.id.length <= 90 && ['image','text'].includes(item.kind) && [item.x,item.y,item.width,item.height,item.rotation].every(n => typeof n === 'number' && Number.isFinite(n)) && (item.layer === undefined || Number.isFinite(item.layer)) && (item.src === undefined || (typeof item.src === 'string' && item.src.length < 2_000_000 && (/^\/stickers\/[a-z0-9-]+\.svg$/i.test(item.src) || /^data:image\/(png|jpeg|webp);base64,/.test(item.src))))))) return false;
  if (d.strokes !== undefined && (!Array.isArray(d.strokes) || d.strokes.length > 120 || !d.strokes.every(line => line && typeof line.id === 'string' && typeof line.color === 'string' && typeof line.width === 'number' && Array.isArray(line.points) && line.points.length <= 6000 && line.points.every((p: {x:number;y:number}) => Number.isFinite(p.x) && Number.isFinite(p.y))))) return false;
  if (d.frame && (!Number.isInteger(d.frame.index) || d.frame.index < 0 || d.frame.index > 3 || !Number.isFinite(d.frame.value?.panX) || !Number.isFinite(d.frame.value?.panY) || !Number.isFinite(d.frame.value?.zoom))) return false;
  if (d.photoFraming !== undefined && (!Array.isArray(d.photoFraming) || d.photoFraming.length !== 4 || !d.photoFraming.every(p => Number.isFinite(p?.panX) && Number.isFinite(p?.panY) && Number.isFinite(p?.zoom)))) return false;
  return true;
}
