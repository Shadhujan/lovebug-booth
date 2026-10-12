import type { DrawStroke } from '../types';

type Point = { x: number; y: number };

// Erase only the doodle paths, never the underlying photos or stickers.
// Sample long pen segments so the eraser can cut a line in the middle.
function distanceToSegment(point: Point, a: Point, b: Point): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared ? Math.min(1, Math.max(0, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared)) : 0;
  return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy));
}

export function eraseDoodleSegments(strokes: DrawStroke[], from: Point, to: Point, radius: number): DrawStroke[] {
  let anyChanged = false;
  const output: DrawStroke[] = [];
  for (const stroke of strokes) {
    if (!stroke.points.length) { output.push(stroke); continue; }
    const sampled: Point[] = [stroke.points[0]];
    for (let i = 1; i < stroke.points.length; i++) {
      const start = stroke.points[i-1], end = stroke.points[i];
      const steps = Math.max(1, Math.ceil(Math.hypot(end.x-start.x, end.y-start.y)/4));
      for (let j = 1; j <= steps; j++) sampled.push({ x: start.x+(end.x-start.x)*j/steps, y: start.y+(end.y-start.y)*j/steps });
    }
    const fragments: Point[][] = [];
    let current: Point[] = [];
    let touched = false;
    for (const point of sampled) {
      if (distanceToSegment(point, from, to) <= radius + stroke.width/2) {
        touched = true;
        if (current.length) { fragments.push(current); current = []; }
      } else current.push(point);
    }
    if (current.length) fragments.push(current);
    if (!touched) { output.push(stroke); continue; }
    anyChanged = true;
    fragments.forEach((points, index) => output.push({ ...stroke, id: index === 0 ? stroke.id : `${stroke.id}:erased-${index}`, points }));
  }
  return anyChanged ? output : strokes;
}
