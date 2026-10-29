import { fitFontSize, wrapText, type MeasureText } from '@canvasly/shared';

export const FONT_FAMILY =
  '"Segoe UI", system-ui, -apple-system, Roboto, "Helvetica Neue", Arial, sans-serif';
export const LINE_HEIGHT = 1.25;
export const STICKY_PADDING = 14;
export const SHAPE_PADDING = 10;

let ctx: CanvasRenderingContext2D | null = null;
const widthCache = new Map<string, number>();

/** Text width at `size`px. Width scales linearly with size, so we measure once at 100px and cache. */
export const measureText: MeasureText = (text, size) => {
  let w = widthCache.get(text);
  if (w === undefined) {
    ctx ??= document.createElement('canvas').getContext('2d')!;
    ctx.font = `100px ${FONT_FAMILY}`;
    w = ctx.measureText(text).width;
    if (widthCache.size > 20_000) widthCache.clear();
    widthCache.set(text, w);
  }
  return (w * size) / 100;
};

const fitCache = new Map<string, number>();

/** Auto-shrinking font size for text inside a box (stickies, shapes). */
export function autoFontSize(text: string, w: number, h: number, padding: number): number {
  const max = Math.max(8, Math.round(Math.min(w, h) * 0.18));
  const key = `${w}|${h}|${padding}|${text}`;
  let size = fitCache.get(key);
  if (size === undefined) {
    size = fitFontSize(text, Math.max(1, w - padding * 2), Math.max(1, h - padding * 2), measureText, {
      min: 4,
      max,
      lineHeight: LINE_HEIGHT,
    });
    if (fitCache.size > 5000) fitCache.clear();
    fitCache.set(key, size);
  }
  return size;
}

/** Height of `text` wrapped to `width` at `fontSize`, matching how text objects render. */
export function textHeight(text: string, width: number, fontSize: number): number {
  const lines = Math.max(1, wrapText(text, width, fontSize, measureText).length);
  return lines * fontSize * LINE_HEIGHT;
}
