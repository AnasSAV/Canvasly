import { compareZ, distToSegment, worldToLocal, type BoardObject, type Vec } from '@canvasly/shared';
import type { DocStore } from '../doc/store';

function polylineDistance(points: readonly number[], p: Vec): number {
  let best = Infinity;
  if (points.length === 2) return Math.hypot(p.x - points[0]!, p.y - points[1]!);
  for (let i = 0; i + 3 < points.length; i += 2) {
    const d = distToSegment(
      p,
      { x: points[i]!, y: points[i + 1]! },
      { x: points[i + 2]!, y: points[i + 3]! },
    );
    if (d < best) best = d;
  }
  return best;
}

function hits(store: DocStore, o: BoardObject, p: Vec, r: number): boolean {
  if (o.type === 'connector') {
    const res = store.resolve(o);
    return !!res && polylineDistance(res.points, p) <= o.strokeWidth / 2 + r;
  }
  const l = worldToLocal(o, p);
  if (o.type === 'pen') return polylineDistance(o.points, l) <= o.size / 2 + r;
  if (o.type === 'ellipse') {
    const rx = o.w / 2 + r;
    const ry = o.h / 2 + r;
    return ((l.x - o.w / 2) / rx) ** 2 + ((l.y - o.h / 2) / ry) ** 2 <= 1;
  }
  return l.x >= -r && l.y >= -r && l.x <= o.w + r && l.y <= o.h + r;
}

/**
 * Topmost object under world point `p` within `radius` world units.
 * Hit-testing is geometric (via the R-tree) so the content layer can skip Konva's hit canvas entirely.
 */
export function hitTest(
  store: DocStore,
  p: Vec,
  radius: number,
  filter: (o: BoardObject) => boolean = () => true,
): BoardObject | null {
  const candidates = store
    .query({ x: p.x - radius, y: p.y - radius, w: radius * 2, h: radius * 2 })
    .map((id) => store.get(id))
    .filter((o): o is BoardObject => !!o && filter(o))
    .sort(compareZ);
  for (let i = candidates.length - 1; i >= 0; i--) {
    const o = candidates[i]!;
    // Connectors and strokes are thin; give them a slightly larger tolerance.
    const r = o.type === 'connector' || o.type === 'pen' ? radius + 4 : radius;
    if (hits(store, o, p, r)) return o;
  }
  return null;
}
