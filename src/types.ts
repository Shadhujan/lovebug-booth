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
};
export type DrawStroke = { id: string; points: { x: number; y: number }[]; color: string; width: number };
export type EditorDraft = {
  stickers: StickerItem[];
  strokes: DrawStroke[];
  filter: 'none' | 'warm' | 'dreamy' | 'vintage' | 'bw';
  caption: string;
  /** Each slot's 0=top, 50=center, 100=bottom strip crop. */
  photoFocusY?: number[];
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
