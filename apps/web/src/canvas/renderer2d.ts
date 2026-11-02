import {
  MAX_THUMBNAIL_BYTES,
  isShapeObject,
  shapeTextBox,
  toRad,
  wrapText,
  type BoardObject,
  type FontId,
  type Rect,
} from '@canvasly/shared';
import { assetUrl, getLoadedImage, loadImage } from '../doc/assets';
import type { DocStore } from '../doc/store';
import { freehandPath } from './freehand';
import { traceShape } from './shapePaths';
import { drawChart, drawTable } from './widgets';
import {
  FONTS,
  FONT_FAMILY,
  LINE_HEIGHT,
  SHAPE_PADDING,
  STICKY_PADDING,
  autoFontSize,
  ensureFonts,
  measureWith,
} from './text';

/**
 * Plain canvas-2D renderer for the whole board, used for dashboard thumbnails and PNG/PDF export.
 * It draws from the store rather than the Konva stage, which only has on-screen objects mounted.
 * Always renders in the light theme (exports shouldn't depend on the viewer's theme).
 */

const BACKGROUND = '#f7f7f8';

function drawText(
  ctx: CanvasRenderingContext2D,
  text: string,
  box: { x: number; y: number; w: number; h: number },
  size: number,
  align: 'left' | 'center' | 'right',
  vCenter: boolean,
  font: FontId,
  wrap = true,
) {
  if (!text) return;
  ctx.font = `${size}px ${FONTS[font].family}`;
  ctx.textBaseline = 'top';
  const lines = wrap ? wrapText(text, box.w, size, measureWith(font)) : text.split('\n');
  const lineH = size * LINE_HEIGHT;
  const top = vCenter ? box.y + (box.h - lines.length * lineH) / 2 : box.y;
  ctx.textAlign = align;
  const x = align === 'center' ? box.x + box.w / 2 : align === 'right' ? box.x + box.w : box.x;
  lines.forEach((line, i) => ctx.fillText(line, x, top + i * lineH + (lineH - size) / 2));
}

function arrowHead(
  ctx: CanvasRenderingContext2D,
  fromX: number,
  fromY: number,
  x: number,
  y: number,
  size: number,
) {
  const a = Math.atan2(y - fromY, x - fromX);
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x - size * Math.cos(a - Math.PI / 7), y - size * Math.sin(a - Math.PI / 7));
  ctx.lineTo(x - size * Math.cos(a + Math.PI / 7), y - size * Math.sin(a + Math.PI / 7));
  ctx.closePath();
  ctx.fill();
}

function drawObject(ctx: CanvasRenderingContext2D, o: BoardObject, store: DocStore, assetBase: string) {
  if (o.type === 'connector') {
    const r = store.resolve(o);
    if (!r) return;
    const pts = r.points;
    ctx.strokeStyle = ctx.fillStyle = o.stroke;
    ctx.lineWidth = o.strokeWidth;
    ctx.lineCap = ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let i = 0; i + 1 < pts.length; i += 2) ctx.lineTo(pts[i]!, pts[i + 1]!);
    ctx.stroke();
    const head = 6 + o.strokeWidth * 3;
    const n = pts.length;
    if (o.endCap === 'arrow') arrowHead(ctx, pts[n - 4]!, pts[n - 3]!, pts[n - 2]!, pts[n - 1]!, head);
    if (o.startCap === 'arrow') arrowHead(ctx, pts[2]!, pts[3]!, pts[0]!, pts[1]!, head);
    return;
  }
  ctx.save();
  ctx.translate(o.x, o.y);
  ctx.rotate(toRad(o.rotation));
  switch (o.type) {
    case 'frame': {
      if (o.fill !== 'transparent') {
        ctx.fillStyle = o.fill;
        ctx.fillRect(0, 0, o.w, o.h);
      }
      ctx.strokeStyle = '#d4d4d8';
      ctx.lineWidth = 1;
      ctx.strokeRect(0, 0, o.w, o.h);
      ctx.fillStyle = '#52525b';
      ctx.font = `500 ${Math.max(14, o.w / 40)}px ${FONT_FAMILY}`;
      ctx.textBaseline = 'bottom';
      ctx.textAlign = 'left';
      ctx.fillText(o.name, 0, -6);
      break;
    }
    case 'sticky': {
      ctx.fillStyle = 'rgba(0,0,0,0.08)';
      ctx.beginPath();
      ctx.roundRect(2, 4, o.w, o.h, 3);
      ctx.fill();
      ctx.fillStyle = o.color;
      ctx.beginPath();
      ctx.roundRect(0, 0, o.w, o.h, 3);
      ctx.fill();
      ctx.fillStyle = '#1a1a1a';
      const p = STICKY_PADDING;
      drawText(
        ctx,
        o.text,
        { x: p, y: p, w: o.w - p * 2, h: o.h - p * 2 },
        autoFontSize(o.text, o.w, o.h, p, o.font),
        'center',
        true,
        o.font,
      );
      break;
    }
    case 'text':
      ctx.fillStyle = o.color;
      drawText(ctx, o.text, { x: 0, y: 0, w: o.w, h: o.h }, o.fontSize, o.align, false, o.font, !o.autoWidth);
      break;
    case 'pen':
      ctx.fillStyle = o.stroke;
      ctx.globalAlpha = o.opacity;
      ctx.fill(new Path2D(freehandPath(o.points, o.size)));
      break;
    case 'table':
      drawTable(ctx, o, { dark: false });
      break;
    case 'chart':
      drawChart(ctx, o, { dark: false });
      break;
    case 'image': {
      const img = getLoadedImage(assetUrl(assetBase, o.assetId));
      if (img) ctx.drawImage(img, 0, 0, o.w, o.h);
      else {
        ctx.fillStyle = '#e5e7eb';
        ctx.fillRect(0, 0, o.w, o.h);
      }
      break;
    }
    default: {
      if (!isShapeObject(o)) break;
      ctx.beginPath();
      traceShape(ctx, o.type, o.w, o.h);
      if (o.fill !== 'transparent') {
        ctx.fillStyle = o.fill;
        ctx.fill();
      }
      if (o.stroke !== 'transparent') {
        ctx.strokeStyle = o.stroke;
        ctx.lineWidth = o.strokeWidth;
        ctx.lineJoin = 'round';
        ctx.stroke();
      }
      ctx.fillStyle = o.textColor;
      const box = shapeTextBox(o.type, o.w, o.h, SHAPE_PADDING);
      const size = Math.min(autoFontSize(o.text, box.w, box.h, 0, o.font), 28);
      drawText(ctx, o.text, box, size, 'center', true, o.font);
    }
  }
  ctx.restore();
}

/** Make sure every image in the list is decoded so it can be drawn synchronously. */
export async function preloadImages(objects: Iterable<BoardObject>, assetBase: string) {
  const urls = new Set<string>();
  for (const o of objects) if (o.type === 'image') urls.add(assetUrl(assetBase, o.assetId));
  await Promise.all([...urls].map((u) => loadImage(u)));
}

/** Objects whose bounds intersect `rect`, in paint order. */
function objectsIn(store: DocStore, rect: Rect, only?: ReadonlySet<string>): BoardObject[] {
  const ids = new Set(store.query(rect));
  return store.getSorted().filter((o) => ids.has(o.id) && (!only || only.has(o.id)));
}

/**
 * Render a world-space region to a canvas at `scale` device pixels per world unit, capped so the canvas
 * stays within browser limits. `only` restricts drawing to a set of ids (export selection).
 */
export async function renderRegion(
  store: DocStore,
  assetBase: string,
  rect: Rect,
  opts: { scale?: number; padding?: number; only?: ReadonlySet<string>; background?: string | null } = {},
): Promise<HTMLCanvasElement> {
  const pad = opts.padding ?? 40;
  const region = { x: rect.x - pad, y: rect.y - pad, w: rect.w + pad * 2, h: rect.h + pad * 2 };
  const MAX_SIDE = 8192;
  const MAX_PIXELS = 40_000_000;
  let scale = Math.min(opts.scale ?? 2, MAX_SIDE / region.w, MAX_SIDE / region.h);
  scale = Math.min(scale, Math.sqrt(MAX_PIXELS / (region.w * region.h)));
  const objects = objectsIn(store, region, opts.only);
  await Promise.all([preloadImages(objects, assetBase), ensureFonts(objects)]);

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(region.w * scale));
  canvas.height = Math.max(1, Math.round(region.h * scale));
  const ctx = canvas.getContext('2d')!;
  if (opts.background !== null) {
    ctx.fillStyle = opts.background ?? BACKGROUND;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.scale(scale, scale);
  ctx.translate(-region.x, -region.y);
  for (const o of objects) drawObject(ctx, o, store, assetBase);
  return canvas;
}

const W = 480;
const H = 300;

/** Small WebP preview of the whole board for the dashboard. */
export async function renderThumbnail(
  store: DocStore,
  assetBase: string,
  bounds: Rect | null,
): Promise<Blob | null> {
  await ensureFonts(store.all());
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = BACKGROUND;
  ctx.fillRect(0, 0, W, H);
  if (bounds) {
    const pad = 40;
    const scale = Math.min(1, (W - pad * 2) / Math.max(bounds.w, 1), (H - pad * 2) / Math.max(bounds.h, 1));
    ctx.translate(W / 2 - (bounds.x + bounds.w / 2) * scale, H / 2 - (bounds.y + bounds.h / 2) * scale);
    ctx.scale(scale, scale);
    for (const o of store.getSorted()) drawObject(ctx, o, store, assetBase);
  }
  for (const quality of [0.8, 0.6, 0.4]) {
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/webp', quality));
    if (blob && blob.size <= MAX_THUMBNAIL_BYTES) return blob;
  }
  return null;
}
