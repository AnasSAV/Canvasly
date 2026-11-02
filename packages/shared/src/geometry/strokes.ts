import type { Rect } from './box';
import type { Vec } from './vec';

const hypot = Math.hypot;

export function pointInPolygon(p: Vec, polygon: readonly number[]): boolean {
  let inside = false;
  const n = polygon.length;
  for (let i = 0, j = n - 2; i < n; j = i, i += 2) {
    const xi = polygon[i]!;
    const yi = polygon[i + 1]!;
    const xj = polygon[j]!;
    const yj = polygon[j + 1]!;
    if (yi > p.y !== yj > p.y && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * What's left of a flat [x0, y0, x1, y1, ...] stroke after erasing circles around `centers`.
 * Null if the stroke isn't touched. Pieces too short to draw are dropped.
 */
export function eraseFromStroke(
  points: readonly number[],
  centers: readonly Vec[],
  radius: number,
): number[][] | null {
  const pieces: number[][] = [];
  let piece: number[] = [];
  let touched = false;
  for (let i = 0; i + 1 < points.length; i += 2) {
    const x = points[i]!;
    const y = points[i + 1]!;
    if (centers.some((c) => hypot(x - c.x, y - c.y) <= radius)) {
      touched = true;
      if (piece.length >= 4) pieces.push(piece);
      piece = [];
    } else {
      piece.push(x, y);
    }
  }
  if (!touched) return null;
  if (piece.length >= 4) pieces.push(piece);
  return pieces;
}

export type RecognizedStroke =
  { kind: 'line'; start: Vec; end: Vec } | { kind: 'ellipse' | 'rect' | 'triangle' | 'diamond'; rect: Rect };

function toVecs(points: readonly number[]): Vec[] {
  const out: Vec[] = [];
  for (let i = 0; i + 1 < points.length; i += 2) out.push({ x: points[i]!, y: points[i + 1]! });
  return out;
}

/** Ramer-Douglas-Peucker: the points that matter, within `eps` of the original path. */
function simplify(pts: readonly Vec[], eps: number): Vec[] {
  if (pts.length < 3) return [...pts];
  const a = pts[0]!;
  const b = pts[pts.length - 1]!;
  const len = hypot(b.x - a.x, b.y - a.y);
  let far = -1;
  let farDist = eps;
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i]!;
    const d =
      len === 0
        ? hypot(p.x - a.x, p.y - a.y)
        : Math.abs((b.x - a.x) * (a.y - p.y) - (a.x - p.x) * (b.y - a.y)) / len;
    if (d > farDist) {
      far = i;
      farDist = d;
    }
  }
  if (far === -1) return [a, b];
  return [...simplify(pts.slice(0, far + 1), eps).slice(0, -1), ...simplify(pts.slice(far), eps)];
}

/** The corners of a closed path: simplified, then with nearly straight vertices removed. */
function corners(pts: readonly Vec[], diagonal: number): Vec[] {
  // Split at the point farthest from the start, because simplifying a closed loop needs two distinct ends.
  const start = pts[0]!;
  let far = 0;
  pts.forEach((p, i) => {
    if (hypot(p.x - start.x, p.y - start.y) > hypot(pts[far]!.x - start.x, pts[far]!.y - start.y)) far = i;
  });
  const eps = diagonal * 0.06;
  const loop = [...simplify(pts.slice(0, far + 1), eps).slice(0, -1), ...simplify(pts.slice(far), eps)];
  loop.pop(); // the end of a closed path repeats its start

  const merged: Vec[] = [];
  for (const p of loop) {
    const prev = merged[merged.length - 1];
    if (!prev || hypot(p.x - prev.x, p.y - prev.y) > diagonal * 0.08) merged.push(p);
  }
  return merged.filter((p, i) => {
    const a = merged[(i + merged.length - 1) % merged.length]!;
    const b = merged[(i + 1) % merged.length]!;
    const v1 = { x: a.x - p.x, y: a.y - p.y };
    const v2 = { x: b.x - p.x, y: b.y - p.y };
    const cos = (v1.x * v2.x + v1.y * v2.y) / (hypot(v1.x, v1.y) * hypot(v2.x, v2.y) || 1);
    return cos > -0.87; // keep anything sharper than about 150 degrees
  });
}

/**
 * Local, rule-based sketch recognition for the smart drawing tool: a straight line, ellipse, rectangle,
 * triangle or diamond. Null means it should stay as ink, including anything drawn smaller than `minSize`.
 */
export function recognizeStroke(points: readonly number[], minSize = 16): RecognizedStroke | null {
  const pts = toVecs(points);
  if (pts.length < 6) return null;
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const rect: Rect = {
    x: Math.min(...xs),
    y: Math.min(...ys),
    w: Math.max(...xs) - Math.min(...xs),
    h: Math.max(...ys) - Math.min(...ys),
  };
  const diagonal = hypot(rect.w, rect.h);
  if (diagonal < minSize) return null;

  let length = 0;
  for (let i = 1; i < pts.length; i++) {
    length += hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y);
  }
  const start = pts[0]!;
  const end = pts[pts.length - 1]!;
  const gap = hypot(end.x - start.x, end.y - start.y);

  if (gap > length * 0.15) return gap / length > 0.95 ? { kind: 'line', start, end } : null;
  if (Math.min(rect.w, rect.h) < minSize / 2) return null;

  // Radius of each point in the bounding box's unit circle: all near 1 for an ellipse.
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  const deviation =
    pts.reduce(
      (sum, p) => sum + Math.abs(hypot((p.x - cx) / (rect.w / 2), (p.y - cy) / (rect.h / 2)) - 1),
      0,
    ) / pts.length;
  if (deviation < 0.08) return { kind: 'ellipse', rect };

  const vertices = corners(pts, diagonal);
  const near = (p: Vec, x: number, y: number) =>
    Math.abs(p.x - x) < rect.w * 0.25 && Math.abs(p.y - y) < rect.h * 0.25;
  const right = rect.x + rect.w;
  const bottom = rect.y + rect.h;
  const onlyNear = (targets: [number, number][]) =>
    targets.every(([x, y]) => vertices.some((v) => near(v, x, y)));

  if (vertices.length === 3) {
    // The triangle shape points up, so anything else stays as ink rather than being flipped.
    const top = vertices.filter((v) => v.y < rect.y + rect.h * 0.3);
    const base = vertices.filter((v) => v.y > bottom - rect.h * 0.3);
    return top.length === 1 && base.length === 2 ? { kind: 'triangle', rect } : null;
  }
  if (vertices.length === 4) {
    const box: [number, number][] = [
      [rect.x, rect.y],
      [right, rect.y],
      [right, bottom],
      [rect.x, bottom],
    ];
    if (onlyNear(box)) return { kind: 'rect', rect };
    const sides: [number, number][] = [
      [cx, rect.y],
      [right, cy],
      [cx, bottom],
      [rect.x, cy],
    ];
    if (onlyNear(sides)) return { kind: 'diamond', rect };
  }
  return null;
}
