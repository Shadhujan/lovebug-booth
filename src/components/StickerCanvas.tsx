import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react';
import type { DrawStroke, EditorDraft, Phase, StickerItem, ThemeKey } from '../types';
import { drawStrip, handleAt, PRINT_HEIGHT, PRINT_WIDTH, stickerAt } from '../lib/canvas';
import { makeId } from '../lib/themes';

export type StickerCanvasHandle = { exportDataURL: () => Promise<string> };
type Props = {
  photos: (string | null)[];
  theme: ThemeKey;
  draft: EditorDraft;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onCommit: (draft: EditorDraft) => void;
  mode: Phase;
  brushColor: string;
  brushSize: number;
};

type Point = { x: number; y: number };
type DragState = {
  mode: 'drag' | 'rotate' | 'resize' | 'draw' | 'pinch';
  start: Point;
  item?: StickerItem;
  draft: EditorDraft;
  drawing?: DrawStroke;
  pointerCount?: number;
  initialDistance?: number;
  initialAngle?: number;
};

function copyDraft(draft: EditorDraft): EditorDraft {
  return { ...draft, stickers: draft.stickers.map(item => ({ ...item })), strokes: draft.strokes.map(stroke => ({ ...stroke, points: stroke.points.map(p => ({ ...p })) })) };
}

const StickerCanvas = forwardRef<StickerCanvasHandle, Props>(function StickerCanvas(props, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imagesRef = useRef(new Map<string, HTMLImageElement>());
  const loadsRef = useRef(new Map<string, Promise<void>>());
  const propsRef = useRef(props);
  const stateRef = useRef<DragState | null>(null);
  const activePointers = useRef(new Map<number, Point>());
  const transientRef = useRef<{ draft: EditorDraft; line: DrawStroke | null } | null>(null);
  const selectedRef = useRef(props.selectedId);
  propsRef.current = props;

  const render = useCallback((draft?: EditorDraft, selected?: string | null, line?: DrawStroke | null) => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const p = propsRef.current;
    drawStrip(ctx, { photos: p.photos, theme: p.theme, draft: draft || p.draft, images: imagesRef.current, selectedId: selected === undefined ? selectedRef.current : selected, previewLine: line });
  }, []);

  const loadAsset = useCallback((source: string): Promise<void> => {
    if (loadsRef.current.has(source)) return loadsRef.current.get(source)!;
    const promise = new Promise<void>((resolve) => {
      const img = new Image();
      img.onload = () => { imagesRef.current.set(source, img); render(); resolve(); };
      img.onerror = () => { resolve(); }; // An unavailable image doesn't break the editor.
      img.src = source;
    });
    loadsRef.current.set(source, promise);
    return promise;
  }, [render]);

  const sources = [...props.photos.filter((p): p is string => Boolean(p)), ...props.draft.stickers.map(s => s.src).filter((p): p is string => Boolean(p))];
  useEffect(() => {
    for (const source of sources) void loadAsset(source);
    render();
  // sources changes are covered by the stable source-list signature; canvas redraws when editing props change.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sources.join('|'), props.draft, props.theme, props.selectedId, loadAsset, render]);

  useEffect(() => {
    selectedRef.current = props.selectedId;
    render();
  }, [props.selectedId, render]);

  useImperativeHandle(ref, () => ({
    exportDataURL: async () => {
      const p = propsRef.current;
      await Promise.all([...p.photos.filter((s): s is string => Boolean(s)), ...p.draft.stickers.map(s => s.src).filter((s): s is string => Boolean(s))].map(loadAsset));
      const output = document.createElement('canvas');
      const quality = 2.4;
      output.width = Math.round(PRINT_WIDTH * quality);
      output.height = Math.round(PRINT_HEIGHT * quality);
      const ctx = output.getContext('2d');
      if (!ctx) throw new Error('Could not export this photo strip.');
      ctx.setTransform(quality, 0, 0, quality, 0, 0);
      drawStrip(ctx, { photos: p.photos, theme: p.theme, draft: p.draft, images: imagesRef.current });
      return output.toDataURL('image/png');
    },
  }), [loadAsset]);

  const getPoint = (event: React.PointerEvent<HTMLCanvasElement>): Point => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * PRINT_WIDTH / rect.width, y: (event.clientY - rect.top) * PRINT_HEIGHT / rect.height };
  };

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    const point = getPoint(event);
    activePointers.current.set(event.pointerId, point);
    event.currentTarget.setPointerCapture(event.pointerId);
    const p = propsRef.current;
    if (p.mode === 'draw') {
      const stroke: DrawStroke = { id: makeId(), color: p.brushColor, width: p.brushSize, points: [point] };
      stateRef.current = { mode: 'draw', start: point, draft: copyDraft(p.draft), drawing: stroke };
      transientRef.current = { draft: copyDraft(p.draft), line: stroke };
      render(p.draft, null, stroke);
      return;
    }

    if (activePointers.current.size === 2 && selectedRef.current) {
      const item = (transientRef.current?.draft || p.draft).stickers.find(s => s.id === selectedRef.current);
      if (item) {
        const [a, b] = [...activePointers.current.values()];
        stateRef.current = {
          mode: 'pinch', start: point, item: { ...item }, draft: copyDraft(transientRef.current?.draft || p.draft),
          initialDistance: Math.hypot(a.x - b.x, a.y - b.y),
          initialAngle: Math.atan2(b.y - a.y, b.x - a.x),
        };
        return;
      }
    }
    const current = p.draft.stickers.find(item => item.id === selectedRef.current);
    const handle = current ? handleAt(current, point.x, point.y) : null;
    let item = current;
    if (!handle || !item) item = [...p.draft.stickers].reverse().find(s => stickerAt(s, point.x, point.y));
    if (!item) {
      selectedRef.current = null; p.onSelect(null); render(p.draft, null);
      stateRef.current = null; return;
    }
    selectedRef.current = item.id; p.onSelect(item.id);
    stateRef.current = { mode: current?.id === item.id && handle ? handle : 'drag', start: point, item: { ...item }, draft: copyDraft(p.draft) };
    render(p.draft, item.id);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!activePointers.current.has(event.pointerId)) return;
    const point = getPoint(event);
    activePointers.current.set(event.pointerId, point);
    const state = stateRef.current;
    if (!state) return;
    if (state.mode === 'draw' && state.drawing) {
      state.drawing.points.push(point);
      transientRef.current = { draft: state.draft, line: state.drawing };
      render(state.draft, null, state.drawing);
      return;
    }
    if (!state.item) return;
    const item = state.draft.stickers.find(s => s.id === state.item!.id);
    if (!item) return;
    const base = state.item;
    if (state.mode === 'drag') {
      item.x = Math.max(0, Math.min(PRINT_WIDTH, base.x + point.x - state.start.x));
      item.y = Math.max(0, Math.min(PRINT_HEIGHT, base.y + point.y - state.start.y));
    } else if (state.mode === 'rotate') {
      const before = Math.atan2(state.start.y - base.y, state.start.x - base.x);
      const after = Math.atan2(point.y - base.y, point.x - base.x);
      item.rotation = base.rotation + (after - before) * 180 / Math.PI;
    } else if (state.mode === 'resize') {
      const before = Math.max(10, Math.hypot(state.start.x - base.x, state.start.y - base.y));
      const after = Math.max(10, Math.hypot(point.x - base.x, point.y - base.y));
      const scale = Math.min(4, Math.max(.2, after / before));
      item.width = Math.max(45, Math.min(430, base.width * scale));
      item.height = Math.max(36, Math.min(430, base.height * scale));
    } else if (state.mode === 'pinch' && activePointers.current.size >= 2) {
      const [a, b] = [...activePointers.current.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      const angle = Math.atan2(b.y - a.y, b.x - a.x);
      const scale = Math.max(.2, Math.min(4, distance / Math.max(1, state.initialDistance || 1)));
      item.width = Math.max(45, Math.min(430, base.width * scale));
      item.height = Math.max(36, Math.min(430, base.height * scale));
      item.rotation = base.rotation + (angle - (state.initialAngle || 0)) * 180 / Math.PI;
    }
    transientRef.current = { draft: state.draft, line: null };
    render(state.draft, item.id);
  };

  const stopPointer = (event: React.PointerEvent<HTMLCanvasElement>) => {
    activePointers.current.delete(event.pointerId);
    const state = stateRef.current;
    if (!state) return;
    if (state.mode === 'pinch' && activePointers.current.size > 0) return;
    if (state.mode === 'draw' && state.drawing) {
      if (state.drawing.points.length === 1) state.drawing.points.push({ ...state.drawing.points[0] });
      state.draft.strokes.push(state.drawing);
    }
    if (state.mode === 'draw' || (state.item && transientRef.current)) propsRef.current.onCommit(state.draft);
    stateRef.current = null; transientRef.current = null;
    render(state.draft);
  };

  return (
    <div className="canvas-shell" aria-label="Editable four-photo strip">
      <canvas
        ref={canvasRef}
        className="editor-canvas"
        width={PRINT_WIDTH}
        height={PRINT_HEIGHT}
        aria-label={props.mode === 'draw' ? 'Draw on the photo strip' : 'Drag stickers or use the round handles to rotate and resize them'}
        role="img"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={stopPointer}
        onPointerCancel={stopPointer}
        onContextMenu={event => event.preventDefault()}
        style={{ touchAction: 'none', cursor: props.mode === 'draw' ? 'crosshair' : 'grab' }}
      />
    </div>
  );
});

export default StickerCanvas;
