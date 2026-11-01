import { SHAPE_VERTICES, type ShapeKind } from '@canvasly/shared';

/** Trace a shape's outline into a canvas path (works for both a 2D context and a Path2D). */
export function traceShape(p: CanvasPath, kind: ShapeKind, w: number, h: number) {
  const poly = SHAPE_VERTICES[kind];
  if (poly) {
    poly.forEach(([x, y], i) => (i === 0 ? p.moveTo(x * w, y * h) : p.lineTo(x * w, y * h)));
    p.closePath();
    return;
  }
  switch (kind) {
    case 'ellipse':
      p.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
      break;
    case 'roundrect':
      p.roundRect(0, 0, w, h, Math.min(w, h) * 0.18);
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
      p.roundRect(0, 0, w, h, 4);
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
