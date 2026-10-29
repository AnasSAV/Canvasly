import { getStroke } from 'perfect-freehand';

/** SVG path for a perfect-freehand outline of flat [x0, y0, x1, y1, ...] points. */
export function freehandPath(points: readonly number[], size: number): string {
  const input: [number, number][] = [];
  for (let i = 0; i + 1 < points.length; i += 2) input.push([points[i]!, points[i + 1]!]);
  const outline = getStroke(input, {
    size,
    thinning: 0.5,
    smoothing: 0.5,
    streamline: 0.4,
    simulatePressure: true,
  });
  if (outline.length < 2) return '';
  const [first] = outline;
  let d = `M${first![0].toFixed(2)},${first![1].toFixed(2)}Q`;
  for (let i = 0; i < outline.length; i++) {
    const [x0, y0] = outline[i]!;
    const [x1, y1] = outline[(i + 1) % outline.length]!;
    d += `${x0.toFixed(2)},${y0.toFixed(2)} ${((x0 + x1) / 2).toFixed(2)},${((y0 + y1) / 2).toFixed(2)} `;
  }
  return `${d}Z`;
}
