export type ThemeKey = 'strawberry' | 'peach' | 'lilac' | 'mint';
export type Screen = 'home' | 'setup' | 'camera' | 'review' | 'editor' | 'finish' | 'album' | 'together';
export type StickerItem = {
  id: string;
  kind: 'image' | 'text';
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  src?: string;
  text?: string;
  color?: string;
  /** Stable stacking order for peer-to-peer shared editing. */
  layer?: number;
};
export type PhotoFraming = { panX: number; panY: number; zoom: number };
export type DrawStroke = { id: string; points: { x: number; y: number }[]; color: string; width: number };
export type EditorDraft = {
  stickers: StickerItem[];
  strokes: DrawStroke[];
  filter: 'none' | 'warm' | 'dreamy' | 'vintage' | 'bw';
  caption: string;
  /** Old v0.3.5 crop positions, retained when opening an older draft. */
  photoFocusY?: number[];
  /** Drag position (-1..1) and zoom (1..3) saved separately per shot. */
  photoFraming?: PhotoFraming[];
};
export type AlbumEntry = {
  id: string;
  createdAt: number;
  theme: ThemeKey;
  image: Blob;
  note: string;
};
export type SavedSticker = { id: string; createdAt: number; src: string };
export type Phase = 'edit' | 'draw' | 'erase';
