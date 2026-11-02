import type { LineCap, LineDash } from '@canvasly/shared';

/** Line drawing on a plain canvas context, shared by the live canvas and exports. */

export interface LineStyle {
  color: string;
  width: number;
  dash: LineDash;
  startCap: LineCap;
  endCap: LineCap;
}

function drawCap(
  ctx: CanvasRenderingContext2D,
  cap: LineCap,
  tipX: number,
  tipY: number,
  fromX: number,
  fromY: number,
  width: number,
) {
  if (cap === 'none') return;
  const size = 6 + width * 3;
  ctx.save();
  ctx.translate(tipX, tipY);
  ctx.rotate(Math.atan2(tipY - fromY, tipX - fromX));
  ctx.setLineDash([]);
  ctx.beginPath();
  switch (cap) {
    case 'arrow':
      ctx.moveTo(0, 0);
      ctx.lineTo(-size, size / 2);
      ctx.lineTo(-size, -size / 2);
      ctx.closePath();
      ctx.fill();
      break;
    case 'open':
      ctx.moveTo(-size, size / 2);
      ctx.lineTo(0, 0);
      ctx.lineTo(-size, -size / 2);
      ctx.stroke();
      break;
    case 'circle':
      ctx.arc(-size / 3, 0, size / 3, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'diamond':
      ctx.moveTo(0, 0);
      ctx.lineTo(-size / 2, size / 2.5);
      ctx.lineTo(-size, 0);
      ctx.lineTo(-size / 2, -size / 2.5);
      ctx.closePath();
      ctx.fill();
      break;
    case 'bar':
      ctx.moveTo(0, size / 2);
      ctx.lineTo(0, -size / 2);
      ctx.stroke();
      break;
  }
  ctx.restore();
}

/** Caps point along the line's direction a little way in, since a curve's last tiny segment can be any angle. */
function pointBack(points: readonly number[], fromEnd: boolean, distance: number): [number, number] {
  const n = points.length;
  const tipX = fromEnd ? points[n - 2]! : points[0]!;
  const tipY = fromEnd ? points[n - 1]! : points[1]!;
  let last: [number, number] = [tipX, tipY];
  for (let i = 1; i < n / 2; i++) {
    const at = fromEnd ? n - 2 - i * 2 : i * 2;
    last = [points[at]!, points[at + 1]!];
    if (Math.hypot(last[0] - tipX, last[1] - tipY) >= distance) break;
  }
  return last;
}

export function drawLine(ctx: CanvasRenderingContext2D, points: readonly number[], style: LineStyle) {
  if (points.length < 4) return;
  const { color, width, dash, startCap, endCap } = style;
  ctx.strokeStyle = ctx.fillStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = ctx.lineJoin = 'round';
  ctx.setLineDash(dash === 'dashed' ? [width * 4, width * 3] : dash === 'dotted' ? [0.01, width * 2.5] : []);
  ctx.beginPath();
  ctx.moveTo(points[0]!, points[1]!);
  for (let i = 2; i + 1 < points.length; i += 2) ctx.lineTo(points[i]!, points[i + 1]!);
  ctx.stroke();
  ctx.setLineDash([]);
  const reach = 6 + width * 3;
  const n = points.length;
  const [endX, endY] = pointBack(points, true, reach);
  drawCap(ctx, endCap, points[n - 2]!, points[n - 1]!, endX, endY, width);
  const [startX, startY] = pointBack(points, false, reach);
  drawCap(ctx, startCap, points[0]!, points[1]!, startX, startY, width);
}
