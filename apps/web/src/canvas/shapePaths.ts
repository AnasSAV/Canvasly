import { SHAPE_VERTICES, type ShapeKind } from '@canvasly/shared';

/** Shapes made of straight sides, whose corners can be rounded. */
export const hasCorners = (kind: ShapeKind): boolean =>
  kind === 'rect' || kind === 'roundrect' || !!SHAPE_VERTICES[kind];

/** The radius a shape draws with: its own, or the look of its kind if it was never changed. */
export function cornerRadiusOf(
  kind: ShapeKind,
  w: number,
  h: number,
  radius: number | null | undefined,
): number {
  if (radius != null) return radius;
  if (kind === 'roundrect') return Math.min(w, h) * 0.18;
  return kind === 'rect' ? 4 : 0;
}

/** A closed polygon with its corners rounded, each only as far as its two sides leave room for. */
function traceRoundedPolygon(p: CanvasPath, points: readonly [number, number][], radius: number) {
  const n = points.length;
  const rounded = points.map(([x, y], i) => {
    const [px, py] = points[(i + n - 1) % n]!;
    const [nx, ny] = points[(i + 1) % n]!;
    const toPrev = Math.hypot(px - x, py - y);
    const toNext = Math.hypot(nx - x, ny - y);
    const cos = ((px - x) * (nx - x) + (py - y) * (ny - y)) / (toPrev * toNext || 1);
    const half = Math.acos(Math.max(-1, Math.min(1, cos))) / 2;
    return Math.min(radius, (Math.min(toPrev, toNext) / 2) * Math.tan(half));
  });
  const [lx, ly] = points[n - 1]!;
  const [fx, fy] = points[0]!;
  p.moveTo((lx + fx) / 2, (ly + fy) / 2);
  for (let i = 0; i < n; i++) {
    const [x, y] = points[i]!;
    const [nx, ny] = points[(i + 1) % n]!;
    p.arcTo(x, y, nx, ny, rounded[i]!);
  }
  p.closePath();
}

/** Trace a shape's outline into a canvas path (works for both a 2D context and a Path2D). */
export function traceShape(
  p: CanvasPath,
  kind: ShapeKind,
  w: number,
  h: number,
  cornerRadius?: number | null,
) {
  const poly = SHAPE_VERTICES[kind];
  if (poly) {
    const points = poly.map(([x, y]) => [x * w, y * h] as [number, number]);
    const radius = cornerRadiusOf(kind, w, h, cornerRadius);
    if (radius > 0) {
      traceRoundedPolygon(p, points, radius);
      return;
    }
    points.forEach(([x, y], i) => (i === 0 ? p.moveTo(x, y) : p.lineTo(x, y)));
    p.closePath();
    return;
  }
  switch (kind) {
    case 'ellipse':
      p.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
      break;
    case 'roundrect':
      p.roundRect(0, 0, w, h, Math.min(cornerRadiusOf(kind, w, h, cornerRadius), w / 2, h / 2));
      break;
    case 'cylinder': {
      const ry = Math.min(h * 0.14, w * 0.2);
      p.moveTo(0, ry);
      p.ellipse(w / 2, ry, w / 2, ry, 0, Math.PI, 0);
      p.lineTo(w, h - ry);
      p.ellipse(w / 2, h - ry, w / 2, ry, 0, 0, Math.PI);
      p.closePath();
      p.moveTo(0, ry);
      p.ellipse(w / 2, ry, w / 2, ry, 0, Math.PI, 0, true);
      break;
    }
    case 'cloud':
      p.moveTo(0.25 * w, 0.88 * h);
      p.bezierCurveTo(0.04 * w, 0.88 * h, -0.02 * w, 0.58 * h, 0.16 * w, 0.52 * h);
      p.bezierCurveTo(0.08 * w, 0.26 * h, 0.32 * w, 0.14 * h, 0.42 * w, 0.26 * h);
      p.bezierCurveTo(0.5 * w, 0.02 * h, 0.82 * w, 0.06 * h, 0.8 * w, 0.34 * h);
      p.bezierCurveTo(1.02 * w, 0.32 * h, 1.04 * w, 0.84 * h, 0.82 * w, 0.88 * h);
      p.closePath();
      break;
    case 'bubble': {
      const r = Math.min(w, h) * 0.1;
      const b = h * 0.76;
      p.moveTo(r, 0);
      p.lineTo(w - r, 0);
      p.quadraticCurveTo(w, 0, w, r);
      p.lineTo(w, b - r);
      p.quadraticCurveTo(w, b, w - r, b);
      p.lineTo(0.42 * w, b);
      p.lineTo(0.2 * w, h);
      p.lineTo(0.22 * w, b);
      p.lineTo(r, b);
      p.quadraticCurveTo(0, b, 0, b - r);
      p.lineTo(0, r);
      p.quadraticCurveTo(0, 0, r, 0);
      p.closePath();
      break;
    }
    case 'document':
      p.moveTo(0, 0);
      p.lineTo(w, 0);
      p.lineTo(w, 0.86 * h);
      p.bezierCurveTo(0.75 * w, 0.7 * h, 0.5 * w, 1.05 * h, 0, 0.88 * h);
      p.closePath();
      break;
    default:
      p.roundRect(0, 0, w, h, Math.min(cornerRadiusOf(kind, w, h, cornerRadius), w / 2, h / 2));
  }
}

/** Shapes offered in the toolbar, with the label shown for each. */
export const SHAPE_LABELS: Record<ShapeKind, string> = {
  rect: 'Rectangle',
  roundrect: 'Rounded rectangle',
  ellipse: 'Ellipse',
  triangle: 'Triangle',
  diamond: 'Diamond',
  pentagon: 'Pentagon',
  hexagon: 'Hexagon',
  octagon: 'Octagon',
  star: 'Star',
  parallelogram: 'Parallelogram',
  trapezoid: 'Trapezoid',
  arrowblock: 'Block arrow',
  chevron: 'Chevron',
  cross: 'Cross',
  cylinder: 'Cylinder',
  cloud: 'Cloud',
  bubble: 'Speech bubble',
  document: 'Document',
};

/** Default size when a shape is placed with a single click. */
export function defaultShapeSize(kind: ShapeKind): { w: number; h: number } {
  switch (kind) {
    case 'rect':
    case 'roundrect':
    case 'document':
    case 'parallelogram':
    case 'trapezoid':
    case 'chevron':
    case 'arrowblock':
    case 'bubble':
      return { w: 160, h: 100 };
    case 'cloud':
      return { w: 200, h: 130 };
    case 'cylinder':
      return { w: 110, h: 140 };
    default:
      return { w: 120, h: 120 };
  }
}
