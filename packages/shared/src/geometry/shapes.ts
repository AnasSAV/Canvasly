/**
 * Outline vertices of polygon shapes, normalized to the object's box (0..1). Connectors clip against these
 * and the renderers trace them. Rect, rounded rect, ellipse and the curved shapes aren't listed: connectors
 * treat those as their bounding box or ellipse.
 */
const ngon = (n: number, startDeg = -90): [number, number][] =>
  Array.from({ length: n }, (_, i) => {
    const a = ((startDeg + (i * 360) / n) * Math.PI) / 180;
    return [0.5 + Math.cos(a) / 2, 0.5 + Math.sin(a) / 2] as [number, number];
  });

const star = (points: number, inner: number): [number, number][] =>
  Array.from({ length: points * 2 }, (_, i) => {
    const r = i % 2 === 0 ? 0.5 : 0.5 * inner;
    const a = ((-90 + (i * 180) / points) * Math.PI) / 180;
    return [0.5 + Math.cos(a) * r, 0.5 + Math.sin(a) * r] as [number, number];
  });

export const SHAPE_VERTICES: Readonly<Record<string, readonly (readonly [number, number])[]>> = {
  triangle: [
    [0.5, 0],
    [1, 1],
    [0, 1],
  ],
  diamond: [
    [0.5, 0],
    [1, 0.5],
    [0.5, 1],
    [0, 0.5],
  ],
  pentagon: ngon(5),
  hexagon: [
    [0.25, 0],
    [0.75, 0],
    [1, 0.5],
    [0.75, 1],
    [0.25, 1],
    [0, 0.5],
  ],
  octagon: [
    [0.3, 0],
    [0.7, 0],
    [1, 0.3],
    [1, 0.7],
    [0.7, 1],
    [0.3, 1],
    [0, 0.7],
    [0, 0.3],
  ],
  star: star(5, 0.45),
  parallelogram: [
    [0.2, 0],
    [1, 0],
    [0.8, 1],
    [0, 1],
  ],
  trapezoid: [
    [0.2, 0],
    [0.8, 0],
    [1, 1],
    [0, 1],
  ],
  arrowblock: [
    [0, 0.25],
    [0.6, 0.25],
    [0.6, 0],
    [1, 0.5],
    [0.6, 1],
    [0.6, 0.75],
    [0, 0.75],
  ],
  chevron: [
    [0, 0],
    [0.7, 0],
    [1, 0.5],
    [0.7, 1],
    [0, 1],
    [0.3, 0.5],
  ],
  cross: [
    [0.33, 0],
    [0.67, 0],
    [0.67, 0.33],
    [1, 0.33],
    [1, 0.67],
    [0.67, 0.67],
    [0.67, 1],
    [0.33, 1],
    [0.33, 0.67],
    [0, 0.67],
    [0, 0.33],
    [0.33, 0.33],
  ],
};

/** Part of each shape's box (normalized x, y, w, h) that text should stay inside. */
const TEXT_AREAS: Readonly<Record<string, readonly [number, number, number, number]>> = {
  triangle: [0.2, 0.42, 0.6, 0.55],
  diamond: [0.22, 0.22, 0.56, 0.56],
  pentagon: [0.18, 0.25, 0.64, 0.6],
  hexagon: [0.14, 0.1, 0.72, 0.8],
  octagon: [0.08, 0.08, 0.84, 0.84],
  star: [0.3, 0.32, 0.4, 0.42],
  parallelogram: [0.2, 0.05, 0.6, 0.9],
  trapezoid: [0.15, 0.05, 0.7, 0.9],
  arrowblock: [0.03, 0.27, 0.72, 0.46],
  chevron: [0.32, 0.1, 0.42, 0.8],
  cross: [0.34, 0.34, 0.32, 0.32],
  ellipse: [0.12, 0.12, 0.76, 0.76],
  cylinder: [0.03, 0.25, 0.94, 0.7],
  cloud: [0.18, 0.25, 0.64, 0.55],
  bubble: [0.03, 0.03, 0.94, 0.68],
};

/** The box (in the object's local coordinates) that a shape's text is laid out in. */
export function shapeTextBox(kind: string, w: number, h: number, padding: number) {
  const [nx, ny, nw, nh] = TEXT_AREAS[kind] ?? [0, 0, 1, 1];
  return {
    x: nx * w + padding,
    y: ny * h + padding,
    w: Math.max(1, nw * w - padding * 2),
    h: Math.max(1, nh * h - padding * 2),
  };
}
