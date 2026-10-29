import { MAX_THUMBNAIL_BYTES, isShapeObject, toRad, wrapText, type BoardObject } from '@canvasly/shared';
import { assetUrl, getLoadedImage } from '../doc/assets';
import { contentBounds } from '../doc/ops';
import type { DocStore } from '../doc/store';
import { FONT_FAMILY, LINE_HEIGHT, SHAPE_PADDING, STICKY_PADDING, autoFontSize, measureText } from './text';

const W = 480;
const H = 300;
const BACKGROUND = '#f7f7f8';

/** Wrapped text inside a box; `centered` matches how stickies and shapes render on the canvas. */
function drawText(
  ctx: CanvasRenderingContext2D,
  text: string,
  box: { x: number; y: number; w: number; h: number },
  size: number,
  centered: boolean,
) {
  if (!text) return;
  ctx.font = `${size}px ${FONT_FAMILY}`;
  const lines = wrapText(text, box.w, size, measureText);
  const lineH = size * LINE_HEIGHT;
  const top = centered ? box.y + (box.h - lines.length * lineH) / 2 : box.y;
  ctx.textAlign = centered ? 'center' : 'left';
  const x = centered ? box.x + box.w / 2 : box.x;
  lines.forEach((line, i) => ctx.fillText(line, x, top + i * lineH + (lineH - size) / 2));
}

function drawObject(ctx: CanvasRenderingContext2D, o: BoardObject, store: DocStore, boardId: string) {
  if (o.type === 'connector') {
    const r = store.resolve(o);
    if (!r) return;
    ctx.strokeStyle = o.stroke;
    ctx.lineWidth = o.strokeWidth;
    ctx.beginPath();
    for (let i = 0; i + 1 < r.points.length; i += 2) ctx.lineTo(r.points[i]!, r.points[i + 1]!);
    ctx.stroke();
    return;
  }
  ctx.save();
  ctx.translate(o.x, o.y);
  ctx.rotate(toRad(o.rotation));
  ctx.textBaseline = 'top';
  if (o.type === 'sticky') {
    ctx.fillStyle = o.color;
    ctx.fillRect(0, 0, o.w, o.h);
    ctx.fillStyle = '#1a1a1a';
    const p = STICKY_PADDING;
    const box = { x: p, y: p, w: o.w - p * 2, h: o.h - p * 2 };
    drawText(ctx, o.text, box, autoFontSize(o.text, o.w, o.h, p), true);
  } else if (o.type === 'text') {
    ctx.fillStyle = o.color;
    drawText(ctx, o.text, { x: 0, y: 0, w: o.w, h: o.h }, o.fontSize, false);
  } else if (isShapeObject(o)) {
    ctx.beginPath();
    if (o.type === 'rect') ctx.rect(0, 0, o.w, o.h);
    else if (o.type === 'ellipse') ctx.ellipse(o.w / 2, o.h / 2, o.w / 2, o.h / 2, 0, 0, Math.PI * 2);
    else {
      ctx.moveTo(o.w / 2, 0);
      ctx.lineTo(o.w, o.h);
      ctx.lineTo(0, o.h);
      ctx.closePath();
    }
    if (o.fill !== 'transparent') {
      ctx.fillStyle = o.fill;
      ctx.fill();
    }
    if (o.stroke !== 'transparent') {
      ctx.strokeStyle = o.stroke;
      ctx.lineWidth = o.strokeWidth;
      ctx.stroke();
    }
    ctx.fillStyle = o.textColor;
    const p = SHAPE_PADDING;
    const box =
      o.type === 'triangle'
        ? { x: p, y: o.h * 0.35, w: o.w - p * 2, h: o.h * 0.65 - p }
        : { x: p, y: p, w: o.w - p * 2, h: o.h - p * 2 };
    drawText(ctx, o.text, box, Math.min(autoFontSize(o.text, o.w, o.h, p), 28), true);
  } else if (o.type === 'pen') {
    ctx.strokeStyle = o.stroke;
    ctx.lineWidth = o.size;
    ctx.lineCap = ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let i = 0; i + 1 < o.points.length; i += 2) ctx.lineTo(o.points[i]!, o.points[i + 1]!);
    ctx.stroke();
  } else if (o.type === 'image') {
    const img = getLoadedImage(assetUrl(boardId, o.assetId));
    if (img) ctx.drawImage(img, 0, 0, o.w, o.h);
    else {
      ctx.fillStyle = '#e5e7eb';
      ctx.fillRect(0, 0, o.w, o.h);
    }
  }
  ctx.restore();
}

/**
 * Small WebP preview of the whole board for the dashboard. Drawn with plain canvas 2D from the store
 * (not the Konva stage, which only has on-screen objects mounted), so it's cheap and independent of
 * the current viewport.
 */
export async function renderThumbnail(store: DocStore, boardId: string): Promise<Blob | null> {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = BACKGROUND;
  ctx.fillRect(0, 0, W, H);

  const bounds = contentBounds(store);
  if (bounds) {
    const pad = 40;
    const scale = Math.min(1, (W - pad * 2) / Math.max(bounds.w, 1), (H - pad * 2) / Math.max(bounds.h, 1));
    ctx.translate(W / 2 - (bounds.x + bounds.w / 2) * scale, H / 2 - (bounds.y + bounds.h / 2) * scale);
    ctx.scale(scale, scale);
    for (const o of store.getSorted()) drawObject(ctx, o, store, boardId);
  }

  for (const quality of [0.8, 0.6, 0.4]) {
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/webp', quality));
    if (blob && blob.size <= MAX_THUMBNAIL_BYTES) return blob;
  }
  return null;
}
