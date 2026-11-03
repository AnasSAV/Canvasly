import { cellKey, wrapText, type ChartObject, type Rect, type TableObject, type Vec } from '@canvasly/shared';
import { canvasColors, ink, paper } from './colors';
import { FONT_FAMILY, LINE_HEIGHT, measureText } from './text';

/**
 * Tables and charts are drawn with the plain canvas 2D API, so the board, thumbnails and PNG/PDF exports
 * all share one implementation.
 */

const CELL_PADDING = 8;

export function cellRect(t: TableObject, rowId: string, colId: string): Rect | null {
  let x = 0;
  let y = 0;
  let w = 0;
  let h = 0;
  for (const c of t.columns) {
    if (c.id === colId) {
      w = c.w;
      break;
    }
    x += c.w;
  }
  for (const r of t.rows) {
    if (r.id === rowId) {
      h = r.h;
      break;
    }
    y += r.h;
  }
  return w && h ? { x, y, w, h } : null;
}

/** The cell at a point in the table's local coordinates. */
export function cellAt(t: TableObject, p: Vec): { rowId: string; colId: string } | null {
  let x = 0;
  const col = t.columns.find((c) => p.x >= x && p.x < (x += c.w));
  let y = 0;
  const row = t.rows.find((r) => p.y >= y && p.y < (y += r.h));
  return row && col ? { rowId: row.id, colId: col.id } : null;
}

export const cellPadding = CELL_PADDING;

const headerFill = (fill: string, dark: boolean) => (dark ? '#123f3e' : fill);

export function drawTable(
  ctx: CanvasRenderingContext2D,
  t: TableObject,
  opts: { dark: boolean; lowDetail?: boolean; hideCell?: string | null },
) {
  const { dark } = opts;
  const colors = canvasColors(dark);
  ctx.fillStyle = paper('#ffffff', dark);
  ctx.fillRect(0, 0, t.w, t.h);
  if (t.headerRow && t.rows[0]) {
    ctx.fillStyle = headerFill(t.headerFill, dark);
    ctx.fillRect(0, 0, t.w, t.rows[0].h);
  }

  ctx.strokeStyle = colors.frameBorder;
  ctx.lineWidth = 1;
  ctx.beginPath();
  let x = 0;
  for (const c of t.columns.slice(0, -1)) {
    x += c.w;
    ctx.moveTo(x, 0);
    ctx.lineTo(x, t.h);
  }
  let y = 0;
  for (const r of t.rows.slice(0, -1)) {
    y += r.h;
    ctx.moveTo(0, y);
    ctx.lineTo(t.w, y);
  }
  ctx.rect(0, 0, t.w, t.h);
  ctx.stroke();
  if (opts.lowDetail) return;

  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  const size = t.fontSize;
  const lineH = size * LINE_HEIGHT;
  y = 0;
  t.rows.forEach((row, ri) => {
    x = 0;
    const bold = t.headerRow && ri === 0;
    ctx.font = `${bold ? '600 ' : ''}${size}px ${FONT_FAMILY}`;
    ctx.fillStyle = ink('#1a1a1a', dark);
    for (const col of t.columns) {
      const key = cellKey(row.id, col.id);
      const text = t.cells[key];
      if (text && key !== opts.hideCell) {
        const lines = wrapText(text, Math.max(1, col.w - CELL_PADDING * 2), size, measureText);
        const top = y + Math.max(CELL_PADDING / 2, (row.h - lines.length * lineH) / 2);
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, col.w, row.h);
        ctx.clip();
        lines.forEach((l, i) => ctx.fillText(l, x + CELL_PADDING, top + i * lineH + (lineH - size) / 2));
        ctx.restore();
      }
      x += col.w;
    }
    y += row.h;
  });
}

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const mag = 10 ** Math.floor(Math.log10(v));
  const n = v / mag;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * mag;
}

const formatValue = (v: number) =>
  Math.abs(v) >= 1000 ? `${Math.round(v / 100) / 10}k` : String(Math.round(v * 100) / 100);

export function drawChart(ctx: CanvasRenderingContext2D, c: ChartObject, opts: { dark: boolean }) {
  const { dark } = opts;
  const text = ink('#1a1a1a', dark);
  const muted = dark ? '#9db3b2' : '#5c7877';
  const line = dark ? '#3c5557' : '#d8e1df';
  ctx.fillStyle = paper('#ffffff', dark);
  ctx.strokeStyle = canvasColors(dark).frameBorder;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(0, 0, c.w, c.h, 8);
  ctx.fill();
  ctx.stroke();

  const unit = Math.min(c.w, c.h) / 320;
  const pad = 18 * unit;
  let top = pad;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  if (c.title) {
    ctx.fillStyle = text;
    ctx.font = `600 ${16 * unit}px ${FONT_FAMILY}`;
    ctx.fillText(c.title, pad, top, c.w - pad * 2);
    top += 28 * unit;
  }
  const small = 11 * unit;
  const round = c.chartKind === 'pie' || c.chartKind === 'donut';

  if (round) {
    const s = c.series[0]!;
    const values = c.labels.map((_, i) => Math.max(0, s.values[i] ?? 0));
    const total = values.reduce((a, b) => a + b, 0) || 1;
    const legendW = Math.min(c.w * 0.36, 160 * unit);
    const areaW = c.w - pad * 2 - legendW;
    const areaH = c.h - top - pad;
    const r = Math.max(4, Math.min(areaW, areaH) / 2);
    const cx = pad + areaW / 2;
    const cy = top + areaH / 2;
    let a = -Math.PI / 2;
    values.forEach((v, i) => {
      const end = a + (v / total) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, a, end);
      ctx.closePath();
      ctx.fillStyle = sliceColor(c, i);
      ctx.fill();
      ctx.strokeStyle = paper('#ffffff', dark);
      ctx.lineWidth = 2 * unit;
      ctx.stroke();
      a = end;
    });
    if (c.chartKind === 'donut') {
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.58, 0, Math.PI * 2);
      ctx.fillStyle = paper('#ffffff', dark);
      ctx.fill();
    }
    ctx.font = `${small}px ${FONT_FAMILY}`;
    ctx.textBaseline = 'middle';
    const rowH = 20 * unit;
    let ly = cy - (c.labels.length * rowH) / 2 + rowH / 2;
    c.labels.forEach((label, i) => {
      const lx = c.w - pad - legendW + 8 * unit;
      ctx.fillStyle = sliceColor(c, i);
      ctx.fillRect(lx, ly - 5 * unit, 10 * unit, 10 * unit);
      ctx.fillStyle = text;
      const pct = Math.round(((values[i] ?? 0) / total) * 100);
      ctx.fillText(`${label} · ${pct}%`, lx + 15 * unit, ly, legendW - 24 * unit);
      ly += rowH;
    });
    return;
  }

  // Legend for multi-series charts.
  let bottom = c.h - pad;
  if (c.series.length > 1) {
    ctx.font = `${small}px ${FONT_FAMILY}`;
    ctx.textBaseline = 'middle';
    let lx = pad;
    const ly = c.h - pad - small / 2;
    for (const s of c.series) {
      ctx.fillStyle = s.color;
      ctx.fillRect(lx, ly - 5 * unit, 10 * unit, 10 * unit);
      ctx.fillStyle = text;
      ctx.fillText(s.name, lx + 14 * unit, ly);
      lx += 14 * unit + ctx.measureText(s.name).width + 16 * unit;
    }
    bottom -= 22 * unit;
  }

  const all = c.series.flatMap((s) => s.values);
  const max = niceMax(Math.max(0, ...all));
  const min = Math.min(0, ...all) < 0 ? -niceMax(-Math.min(...all)) : 0;
  const plot = { x: pad + 30 * unit, y: top + 4 * unit, w: 0, h: 0 };
  plot.w = c.w - pad - plot.x;
  plot.h = bottom - small - 8 * unit - plot.y;
  if (plot.w <= 0 || plot.h <= 0) return;
  const yOf = (v: number) => plot.y + plot.h - ((v - min) / (max - min || 1)) * plot.h;

  // Grid lines and value labels.
  ctx.font = `${small}px ${FONT_FAMILY}`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const v = min + ((max - min) * i) / 4;
    const y = yOf(v);
    ctx.strokeStyle = line;
    ctx.beginPath();
    ctx.moveTo(plot.x, y);
    ctx.lineTo(plot.x + plot.w, y);
    ctx.stroke();
    ctx.fillStyle = muted;
    ctx.fillText(formatValue(v), plot.x - 6 * unit, y);
  }

  const n = Math.max(1, c.labels.length);
  const band = plot.w / n;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle = muted;
  c.labels.forEach((label, i) => {
    ctx.fillText(label, plot.x + band * (i + 0.5), plot.y + plot.h + 6 * unit, band - 2);
  });

  if (c.chartKind === 'bar') {
    const groupW = band * 0.7;
    const barW = groupW / c.series.length;
    c.series.forEach((s, si) => {
      ctx.fillStyle = s.color;
      c.labels.forEach((_, i) => {
        const v = s.values[i] ?? 0;
        const x = plot.x + band * i + (band - groupW) / 2 + si * barW;
        const y0 = yOf(0);
        const y = yOf(v);
        ctx.beginPath();
        ctx.roundRect(x + 1, Math.min(y, y0), Math.max(1, barW - 2), Math.max(1, Math.abs(y0 - y)), 2 * unit);
        ctx.fill();
      });
    });
    return;
  }

  for (const s of c.series) {
    const pts = c.labels.map((_, i) => ({ x: plot.x + band * (i + 0.5), y: yOf(s.values[i] ?? 0) }));
    if (!pts.length) continue;
    if (c.chartKind === 'area') {
      ctx.beginPath();
      ctx.moveTo(pts[0]!.x, yOf(0));
      pts.forEach((p) => ctx.lineTo(p.x, p.y));
      ctx.lineTo(pts.at(-1)!.x, yOf(0));
      ctx.closePath();
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = s.color;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.strokeStyle = s.color;
    ctx.lineWidth = 2.5 * unit;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.stroke();
    ctx.fillStyle = s.color;
    for (const p of pts) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3 * unit, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

const SLICE_COLORS = ['#0e7c7b', '#f38020', '#2fbf71', '#e8318a', '#7048e8', '#4b9fea', '#f5d128', '#e03131'];

function sliceColor(c: ChartObject, i: number): string {
  // The series color leads, then the palette, so slices stay distinct.
  if (i === 0) return c.series[0]!.color;
  return SLICE_COLORS[i % SLICE_COLORS.length]!;
}
