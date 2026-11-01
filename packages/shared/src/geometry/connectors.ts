import type { ConnectorEnd, ConnectorObject } from '../schemas/objects';
import { boundsOfPoints, boxCenter, localToWorld, worldToLocal, type OrientedBox, type Rect } from './box';
import { SHAPE_VERTICES } from './shapes';
import { dist, type Vec } from './vec';

/** A shape kind, or 'rect' for anything clipped against its bounding box. */
export type OutlineKind = string;

export interface AttachTarget extends OrientedBox {
  outline: OutlineKind;
}

export type GetAttachTarget = (objectId: string) => AttachTarget | undefined;

/** Fixed anchors offered when attaching a connector: the four side midpoints. */
export const SIDE_ANCHORS: readonly [number, number][] = [
  [0.5, 0],
  [1, 0.5],
  [0.5, 1],
  [0, 0.5],
];

/** Smallest positive t such that origin + t*dir hits segment ab; Infinity if none. */
function raySegment(origin: Vec, dir: Vec, a: Vec, b: Vec): number {
  const ex = b.x - a.x;
  const ey = b.y - a.y;
  const denom = dir.x * ey - dir.y * ex;
  if (Math.abs(denom) < 1e-12) return Infinity;
  const t = ((a.x - origin.x) * ey - (a.y - origin.y) * ex) / denom;
  const u = ((a.x - origin.x) * dir.y - (a.y - origin.y) * dir.x) / denom;
  return t > 0 && u >= 0 && u <= 1 ? t : Infinity;
}

/**
 * Point on the target's outline along the ray from its center toward `toward` (world coords).
 * This is the "floating" attachment used by 'auto' anchors.
 */
export function clipToOutline(target: AttachTarget, toward: Vec): Vec {
  const hw = target.w / 2;
  const hh = target.h / 2;
  const c = { x: hw, y: hh };
  const t = worldToLocal(target, toward);
  const d = { x: t.x - c.x, y: t.y - c.y };
  if (Math.abs(d.x) < 1e-9 && Math.abs(d.y) < 1e-9) return boxCenter(target);

  const poly = SHAPE_VERTICES[target.outline];
  let s: number;
  if (target.outline === 'ellipse' || target.outline === 'cloud') {
    s = 1 / Math.sqrt((d.x / hw) ** 2 + (d.y / hh) ** 2);
  } else if (poly) {
    s = Infinity;
    poly.forEach(([ax, ay], i) => {
      const [bx, by] = poly[(i + 1) % poly.length]!;
      const a = { x: ax * target.w, y: ay * target.h };
      const b = { x: bx * target.w, y: by * target.h };
      s = Math.min(s, raySegment(c, d, a, b));
    });
    if (s === Infinity) return boxCenter(target);
  } else {
    s = Math.min(d.x === 0 ? Infinity : hw / Math.abs(d.x), d.y === 0 ? Infinity : hh / Math.abs(d.y));
  }
  return localToWorld(target, { x: c.x + d.x * s, y: c.y + d.y * s });
}

/** Normalized local anchor for a world point on/near a box. */
export function anchorFromPoint(box: OrientedBox, p: Vec): [number, number] {
  const l = worldToLocal(box, p);
  return [l.x / box.w, l.y / box.h];
}

export function anchorToWorld(box: OrientedBox, anchor: readonly [number, number]): Vec {
  return localToWorld(box, { x: anchor[0] * box.w, y: anchor[1] * box.h });
}

/** Side-midpoint anchor within `threshold` world units of p, if any. */
export function nearestSideAnchor(box: OrientedBox, p: Vec, threshold: number): [number, number] | null {
  let best: [number, number] | null = null;
  let bestD = threshold;
  for (const a of SIDE_ANCHORS) {
    const d = dist(anchorToWorld(box, a), p);
    if (d <= bestD) {
      bestD = d;
      best = [a[0], a[1]];
    }
  }
  return best;
}

/** Where an end "points from" before outline clipping. */
function referencePoint(end: ConnectorEnd, get: GetAttachTarget): Vec | null {
  if (end.kind === 'point') return { x: end.x, y: end.y };
  const t = get(end.objectId);
  if (!t) return null;
  return end.anchor === 'auto' ? boxCenter(t) : anchorToWorld(t, end.anchor);
}

function resolveEnd(end: ConnectorEnd, other: Vec, get: GetAttachTarget): Vec | null {
  if (end.kind === 'point') return { x: end.x, y: end.y };
  const t = get(end.objectId);
  if (!t) return null;
  return end.anchor === 'auto' ? clipToOutline(t, other) : anchorToWorld(t, end.anchor);
}

export interface ResolvedConnector {
  start: Vec;
  end: Vec;
  /** Flat polyline points including start and end. */
  points: number[];
}

export function elbowPoints(a: Vec, b: Vec): number[] {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    const mx = a.x + dx / 2;
    return [a.x, a.y, mx, a.y, mx, b.y, b.x, b.y];
  }
  const my = a.y + dy / 2;
  return [a.x, a.y, a.x, my, b.x, my, b.x, b.y];
}

/** World-space geometry of a connector; null if an attached object is missing. */
export function resolveConnector(
  c: Pick<ConnectorObject, 'start' | 'end' | 'routing'>,
  get: GetAttachTarget,
): ResolvedConnector | null {
  const refStart = referencePoint(c.start, get);
  const refEnd = referencePoint(c.end, get);
  if (!refStart || !refEnd) return null;
  const start = resolveEnd(c.start, refEnd, get);
  const end = resolveEnd(c.end, refStart, get);
  if (!start || !end) return null;
  const points = c.routing === 'elbow' ? elbowPoints(start, end) : [start.x, start.y, end.x, end.y];
  return { start, end, points };
}

export function polylineBounds(points: readonly number[]): Rect {
  const vs: Vec[] = [];
  for (let i = 0; i + 1 < points.length; i += 2) vs.push({ x: points[i]!, y: points[i + 1]! });
  return boundsOfPoints(vs);
}
