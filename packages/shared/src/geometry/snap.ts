import type { Rect } from './box';

export interface Guide {
  /** 'v' = vertical line at x = pos; 'h' = horizontal line at y = pos. */
  orientation: 'v' | 'h';
  pos: number;
  from: number;
  to: number;
}

export interface SnapResult {
  dx: number;
  dy: number;
  guides: Guide[];
}

export const snapToGrid = (v: number, size: number): number => Math.round(v / size) * size;

const xStops = (r: Rect) => [r.x, r.x + r.w / 2, r.x + r.w];
const yStops = (r: Rect) => [r.y, r.y + r.h / 2, r.y + r.h];

function bestOffset(moving: number[], targets: Rect[], stops: (r: Rect) => number[], threshold: number) {
  let best: number | null = null;
  for (const t of targets) {
    for (const ts of stops(t)) {
      for (const ms of moving) {
        const d = ts - ms;
        if (Math.abs(d) <= threshold && (best === null || Math.abs(d) < Math.abs(best))) best = d;
      }
    }
  }
  return best;
}

/**
 * Snap a moving rect's edges/centers to the edges/centers of `targets`.
 * Returns the correction to apply and the guide lines to draw (computed after snapping).
 */
export function snapRect(moving: Rect, targets: Rect[], threshold: number): SnapResult {
  const dx = bestOffset(xStops(moving), targets, xStops, threshold) ?? 0;
  const dy = bestOffset(yStops(moving), targets, yStops, threshold) ?? 0;
  const snapped = { ...moving, x: moving.x + dx, y: moving.y + dy };
  const guides: Guide[] = [];
  const eps = 0.5;

  for (const pos of xStops(snapped)) {
    const hits = targets.filter((t) => xStops(t).some((s) => Math.abs(s - pos) < eps));
    if (hits.length === 0) continue;
    const ys = hits.flatMap((t) => [t.y, t.y + t.h]).concat(snapped.y, snapped.y + snapped.h);
    guides.push({ orientation: 'v', pos, from: Math.min(...ys), to: Math.max(...ys) });
  }
  for (const pos of yStops(snapped)) {
    const hits = targets.filter((t) => yStops(t).some((s) => Math.abs(s - pos) < eps));
    if (hits.length === 0) continue;
    const xs = hits.flatMap((t) => [t.x, t.x + t.w]).concat(snapped.x, snapped.x + snapped.w);
    guides.push({ orientation: 'h', pos, from: Math.min(...xs), to: Math.max(...xs) });
  }
  return { dx, dy, guides };
}
