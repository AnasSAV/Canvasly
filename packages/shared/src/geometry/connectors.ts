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

/** Whichever side's middle is closest to p, for lines that should meet a shape squarely. */
export function closestSideAnchor(box: OrientedBox, p: Vec): [number, number] {
  let best = SIDE_ANCHORS[0]!;
  let bestD = Infinity;
  for (const a of SIDE_ANCHORS) {
    const d = dist(anchorToWorld(box, a), p);
    if (d < bestD) {
      bestD = d;
      best = a;
    }
  }
  return [best[0], best[1]];
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
  /** Flat polyline points including start and end. Curves are sampled, so that everything can treat them alike. */
  points: number[];
  /** Where the middle handle and the label go: wherever the line has been pulled to. */
  mid: Vec;
}

const axisOf = (d: Vec): Vec =>
  Math.abs(d.x) >= Math.abs(d.y) ? { x: Math.sign(d.x) || 1, y: 0 } : { x: 0, y: Math.sign(d.y) || 1 };

/**
 * The direction a line leaves an end in: straight out of the side it's anchored to, or for a free end, along whichever
 * axis faces the other end most.
 */
function leaving(end: ConnectorEnd, at: Vec, other: Vec, get: GetAttachTarget): Vec {
  if (end.kind === 'attached' && end.anchor !== 'auto') {
    const t = get(end.objectId);
    if (t) {
      const out = axisOf({ x: end.anchor[0] - 0.5, y: end.anchor[1] - 0.5 });
      const rad = (t.rotation * Math.PI) / 180;
      return {
        x: out.x * Math.cos(rad) - out.y * Math.sin(rad),
        y: out.x * Math.sin(rad) + out.y * Math.cos(rad),
      };
    }
  }
  return axisOf({ x: other.x - at.x, y: other.y - at.y });
}

const ELBOW_CLEARANCE = 40;

const isHorizontal = (d: Vec) => Math.abs(d.x) >= Math.abs(d.y);

/** Right-angled route between two points, leaving and arriving along the given directions when they're known. */
export function elbowPoints(a: Vec, b: Vec, from?: Vec, to?: Vec, bend?: Vec | null): number[] {
  const startFlat = from ? isHorizontal(from) : Math.abs(b.x - a.x) >= Math.abs(b.y - a.y);
  const endFlat = to ? isHorizontal(to) : startFlat;
  // Ends facing the same way go around the outside; halfway between them would run back through a shape.
  const beyond = (p: number, q: number, dir: number) =>
    dir > 0 ? Math.max(p, q) + ELBOW_CLEARANCE : Math.min(p, q) - ELBOW_CLEARANCE;
  if (startFlat && endFlat) {
    const around = from && to && from.x * to.x > 0;
    const mx = bend ? (a.x + b.x) / 2 + bend.x : around ? beyond(a.x, b.x, from.x) : (a.x + b.x) / 2;
    return [a.x, a.y, mx, a.y, mx, b.y, b.x, b.y];
  }
  if (!startFlat && !endFlat) {
    const around = from && to && from.y * to.y > 0;
    const my = bend ? (a.y + b.y) / 2 + bend.y : around ? beyond(a.y, b.y, from.y) : (a.y + b.y) / 2;
    return [a.x, a.y, a.x, my, b.x, my, b.x, b.y];
  }
  // One bend is enough when the ends face across each other.
  return startFlat ? [a.x, a.y, b.x, a.y, b.x, b.y] : [a.x, a.y, a.x, b.y, b.x, b.y];
}

const CURVE_STEPS = 32;

function sampleCubic(out: number[], p0: Vec, p1: Vec, p2: Vec, p3: Vec) {
  for (let i = 1; i <= CURVE_STEPS; i++) {
    const t = i / CURVE_STEPS;
    const u = 1 - t;
    const w0 = u * u * u;
    const w1 = 3 * u * u * t;
    const w2 = 3 * u * t * t;
    const w3 = t * t * t;
    out.push(w0 * p0.x + w1 * p1.x + w2 * p2.x + w3 * p3.x, w0 * p0.y + w1 * p1.y + w2 * p2.y + w3 * p3.y);
  }
}

/** Smooth route that leaves and arrives along the given directions, through `through` if it's been bent. */
export function curvePoints(a: Vec, b: Vec, from: Vec, to: Vec, through?: Vec | null): number[] {
  const out = [a.x, a.y];
  const out1 = (p: Vec, d: Vec, k: number): Vec => ({ x: p.x + d.x * k, y: p.y + d.y * k });
  const span = dist(a, b);
  if (!through) {
    const k = Math.max(30, span * 0.45);
    sampleCubic(out, a, out1(a, from, k), out1(b, to, k), b);
    return out;
  }
  // Through the middle in the overall direction of travel, so that the two halves join smoothly.
  const tangent = span > 0 ? { x: (b.x - a.x) / span, y: (b.y - a.y) / span } : { x: 1, y: 0 };
  const k = Math.max(20, span * 0.25);
  sampleCubic(out, a, out1(a, from, k), out1(through, tangent, -k), through);
  sampleCubic(out, through, out1(through, tangent, k), out1(b, to, k), b);
  return out;
}

/** Where a line's middle handle and label go: halfway along its length. */
export function polylineMidpoint(points: readonly number[]): Vec {
  let total = 0;
  for (let i = 0; i + 3 < points.length; i += 2) {
    total += Math.hypot(points[i + 2]! - points[i]!, points[i + 3]! - points[i + 1]!);
  }
  let left = total / 2;
  for (let i = 0; i + 3 < points.length; i += 2) {
    const ax = points[i]!;
    const ay = points[i + 1]!;
    const bx = points[i + 2]!;
    const by = points[i + 3]!;
    const len = Math.hypot(bx - ax, by - ay);
    if (left <= len) {
      const t = len ? left / len : 0;
      return { x: ax + (bx - ax) * t, y: ay + (by - ay) * t };
    }
    left -= len;
  }
  return { x: points[0] ?? 0, y: points[1] ?? 0 };
}

/** World-space geometry of a connector; null if an attached object is missing. */
export function resolveConnector(
  c: Pick<ConnectorObject, 'start' | 'end' | 'routing'> & { bend?: Vec | null },
  get: GetAttachTarget,
): ResolvedConnector | null {
  const refStart = referencePoint(c.start, get);
  const refEnd = referencePoint(c.end, get);
  if (!refStart || !refEnd) return null;
  const start = resolveEnd(c.start, refEnd, get);
  const end = resolveEnd(c.end, refStart, get);
  if (!start || !end) return null;
  const bend = c.bend ?? null;
  const through = bend && {
    x: (start.x + end.x) / 2 + bend.x,
    y: (start.y + end.y) / 2 + bend.y,
  };
  if (c.routing === 'straight') {
    const points = through
      ? [start.x, start.y, through.x, through.y, end.x, end.y]
      : [start.x, start.y, end.x, end.y];
    return { start, end, points, mid: through ?? polylineMidpoint(points) };
  }
  const from = leaving(c.start, start, end, get);
  const to = leaving(c.end, end, start, get);
  if (c.routing === 'elbow') {
    const points = elbowPoints(start, end, from, to, bend);
    // Middle of the segment a bend moves, when there is one.
    const mid =
      points.length === 8
        ? { x: (points[2]! + points[4]!) / 2, y: (points[3]! + points[5]!) / 2 }
        : polylineMidpoint(points);
    return { start, end, points, mid };
  }
  const points = curvePoints(start, end, from, to, through);
  return { start, end, points, mid: through ?? polylineMidpoint(points) };
}

export function polylineBounds(points: readonly number[]): Rect {
  const vs: Vec[] = [];
  for (let i = 0; i + 1 < points.length; i += 2) vs.push({ x: points[i]!, y: points[i + 1]! });
  return boundsOfPoints(vs);
}
