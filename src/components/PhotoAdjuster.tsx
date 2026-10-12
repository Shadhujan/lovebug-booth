import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { PHOTO_H, PHOTO_W } from '../lib/canvas';
import { loadImage } from '../lib/photos';
import {
  DEFAULT_PHOTO_FRAMING, drawFramedPhoto, moveFramedPhoto,
  normalizePhotoFraming,
} from '../lib/photoFraming';
import type { PhotoFraming } from '../types';

type Props = {
  source: string;
  index: number;
  framing: PhotoFraming;
  onChange: (framing: PhotoFraming) => void;
};

type Point = { x: number; y: number };
type Gesture = { start: PhotoFraming; middle: Point; distance: number };

const PREVIEW_SCALE = 2;
const clampZoom = (value: number) => Math.max(1, Math.min(3, value));

export default function PhotoAdjuster({ source, index, framing, onChange }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const image = useRef<HTMLImageElement | null>(null);
  const frameRef = useRef(framing);
  const changeRef = useRef(onChange);
  const pointers = useRef(new Map<number, Point>());
  const gesture = useRef<Gesture | null>(null);
  const [loadError, setLoadError] = useState(false);
  frameRef.current = framing;
  changeRef.current = onChange;

  const paint = useCallback(() => {
    const ctx = canvas.current?.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(PREVIEW_SCALE, 0, 0, PREVIEW_SCALE, 0, 0);
    ctx.clearRect(0, 0, PHOTO_W, PHOTO_H);
    ctx.fillStyle = '#fce4e9';
    ctx.fillRect(0, 0, PHOTO_W, PHOTO_H);
    const bitmap = image.current;
    if (bitmap) {
      drawFramedPhoto(ctx, bitmap, 0, 0, PHOTO_W, PHOTO_H, frameRef.current);
    }
  }, []);

  useEffect(() => { paint(); }, [framing, paint]);
  useEffect(() => {
    let valid = true;
    image.current = null;
    setLoadError(false);
    paint();
    void loadImage(source).then(bitmap => {
      if (!valid) return;
      image.current = bitmap;
      paint();
    }).catch(() => { if (valid) setLoadError(true); });
    return () => { valid = false; image.current = null; };
  }, [source, paint]);

  const update = useCallback((next: PhotoFraming) => {
    const clean = normalizePhotoFraming(next);
    frameRef.current = clean;
    paint();
    changeRef.current(clean);
  }, [paint]);

  const getPoint = (event: ReactPointerEvent<HTMLCanvasElement>): Point => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * PHOTO_W / rect.width,
      y: (event.clientY - rect.top) * PHOTO_H / rect.height,
    };
  };

  // Restart the gesture when another finger arrives/leaves, so the image never jumps.
  const startGesture = () => {
    const points = [...pointers.current.values()].slice(0, 2);
    if (!points.length) { gesture.current = null; return; }
    const middle = points.length === 2
      ? { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 }
      : points[0];
    const distance = points.length === 2
      ? Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y) : 0;
    gesture.current = { start: frameRef.current, middle, distance };
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!image.current) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, getPoint(event));
    startGesture();
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!pointers.current.has(event.pointerId) || !image.current || !gesture.current) return;
    pointers.current.set(event.pointerId, getPoint(event));
    const points = [...pointers.current.values()].slice(0, 2);
    const middle = points.length === 2
      ? { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 }
      : points[0];
    const start = gesture.current;
    const nextZoom = points.length === 2 && start.distance > 0
      ? clampZoom(start.start.zoom * Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y) / start.distance)
      : start.start.zoom;
    update(moveFramedPhoto(
      start.start, middle.x - start.middle.x, middle.y - start.middle.y,
      image.current.naturalWidth, image.current.naturalHeight,
      PHOTO_W, PHOTO_H, nextZoom,
    ));
  };

  const onPointerEnd = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size) startGesture(); else gesture.current = null;
  };

  const setZoom = useCallback((zoom: number) => {
    if (!image.current) return;
    update(normalizePhotoFraming({ ...frameRef.current, zoom: clampZoom(zoom) }));
  }, [update]);

  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      if (!image.current) return;
      event.preventDefault();
      setZoom(frameRef.current.zoom * Math.exp(-event.deltaY * 0.0012));
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, [setZoom]);

  const onKeyDown = (event: ReactKeyboardEvent<HTMLCanvasElement>) => {
    if (!image.current) return;
    const distance = event.shiftKey ? 22 : 9;
    const delta: Record<string, Point> = {
      ArrowLeft: { x: -distance, y: 0 }, ArrowRight: { x: distance, y: 0 },
      ArrowUp: { x: 0, y: -distance }, ArrowDown: { x: 0, y: distance },
    };
    if (delta[event.key]) {
      event.preventDefault();
      update(moveFramedPhoto(frameRef.current, delta[event.key].x, delta[event.key].y,
        image.current.naturalWidth, image.current.naturalHeight, PHOTO_W, PHOTO_H));
    } else if (event.key === '+' || event.key === '=') {
      event.preventDefault(); setZoom(frameRef.current.zoom + 0.15);
    } else if (event.key === '-') {
      event.preventDefault(); setZoom(frameRef.current.zoom - 0.15);
    } else if (event.key === '0' || event.key === 'Home') {
      event.preventDefault(); update(DEFAULT_PHOTO_FRAMING);
    }
  };

  return <>
    <div className="review-shot-photo review-photo-adjuster" style={{ aspectRatio: `${PHOTO_W} / ${PHOTO_H}` }}>
      <canvas
        ref={canvas}
        width={PHOTO_W * PREVIEW_SCALE}
        height={PHOTO_H * PREVIEW_SCALE}
        tabIndex={0}
        role="img"
        aria-label={`Photo ${index + 1}. Drag to reposition. Pinch or use the buttons to zoom. Arrow keys move the photo, plus and minus zoom, zero resets.`}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onContextMenu={event => event.preventDefault()}
      />
      <small>0{index + 1} / 04</small>
      {loadError && <span role="alert" className="review-photo-load-error">Couldn't preview this photo</span>}
    </div>
    <div className="review-frame-actions">
      <span>drag photo to adjust <small>pinch or scroll to zoom</small></span>
      <div className="review-zoom-actions" aria-label={`Zoom for photo ${index + 1}`}>
        <button type="button" onClick={() => setZoom(frameRef.current.zoom - 0.2)} disabled={framing.zoom <= 1.001} aria-label={`Zoom out photo ${index + 1}`}>-</button>
        <output aria-label={`Zoom level photo ${index + 1}`}>{Math.round(framing.zoom * 100)}%</output>
        <button type="button" onClick={() => setZoom(frameRef.current.zoom + 0.2)} disabled={framing.zoom >= 2.999} aria-label={`Zoom in photo ${index + 1}`}>+</button>
        <button type="button" className="review-reset-frame" disabled={Math.abs(framing.panX) < .001 && Math.abs(framing.panY) < .001 && framing.zoom === 1} onClick={() => update(DEFAULT_PHOTO_FRAMING)}>reset</button>
      </div>
    </div>
  </>;
}
