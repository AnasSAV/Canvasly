import { rotateAround, type Vec } from './vec';

/** Axis-aligned rectangle. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Rectangle rotated `rotation` degrees around its (x, y) origin — Konva's node model. */
export interface OrientedBox extends Rect {
  rotation: number;
}

export function localToWorld(b: OrientedBox, p: Vec): Vec {
  return rotateAround({ x: b.x + p.x, y: b.y + p.y }, { x: b.x, y: b.y }, b.rotation);
}

export function worldToLocal(b: OrientedBox, p: Vec): Vec {
  const unrotated = rotateAround(p, { x: b.x, y: b.y }, -b.rotation);
  return { x: unrotated.x - b.x, y: unrotated.y - b.y };
}

export function corners(b: OrientedBox): [Vec, Vec, Vec, Vec] {
  return [
    localToWorld(b, { x: 0, y: 0 }),
    localToWorld(b, { x: b.w, y: 0 }),
    localToWorld(b, { x: b.w, y: b.h }),
    localToWorld(b, { x: 0, y: b.h }),
  ];
}

export function boxCenter(b: OrientedBox): Vec {
  return localToWorld(b, { x: b.w / 2, y: b.h / 2 });
}

export function boundsOfPoints(points: readonly Vec[]): Rect {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  if (minX === Infinity) return { x: 0, y: 0, w: 0, h: 0 };
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/** Axis-aligned bounds of an oriented box. */
export function aabb(b: OrientedBox): Rect {
  if (!b.rotation) return { x: b.x, y: b.y, w: b.w, h: b.h };
  return boundsOfPoints(corners(b));
}

export function unionRects(rects: Iterable<Rect>): Rect | null {
  let out: Rect | null = null;
  for (const r of rects) {
    if (!out) {
      out = { ...r };
      continue;
    }
    const x = Math.min(out.x, r.x);
    const y = Math.min(out.y, r.y);
    out = {
      x,
      y,
      w: Math.max(out.x + out.w, r.x + r.w) - x,
      h: Math.max(out.y + out.h, r.y + r.h) - y,
    };
  }
  return out;
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x <= b.x + b.w && b.x <= a.x + a.w && a.y <= b.y + b.h && b.y <= a.y + a.h;
}

export function rectContainsRect(outer: Rect, inner: Rect): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.w <= outer.x + outer.w &&
    inner.y + inner.h <= outer.y + outer.h
  );
}

export function rectContainsPoint(r: Rect, p: Vec): boolean {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}

/** Rect spanning two arbitrary corner points. */
export function rectFromPoints(a: Vec, b: Vec): Rect {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) };
}

export function expandRect(r: Rect, margin: number): Rect {
  return { x: r.x - margin, y: r.y - margin, w: r.w + margin * 2, h: r.h + margin * 2 };
}
