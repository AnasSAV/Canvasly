import '@fontsource/bebas-neue/latin-400.css';
import '@fontsource/caveat/latin-400.css';
import '@fontsource/inter/latin-400.css';
import '@fontsource/jetbrains-mono/latin-400.css';
import '@fontsource/merriweather/latin-400.css';
import '@fontsource/permanent-marker/latin-400.css';
import '@fontsource/playfair-display/latin-400.css';
import '@fontsource/poppins/latin-400.css';
import {
  fitFontSize,
  wrapText,
  type BoardObject,
  type FontId,
  type MeasureText,
  type TextObject,
} from '@canvasly/shared';
import { create } from 'zustand';

export const FONT_FAMILY =
  '"Segoe UI", system-ui, -apple-system, Roboto, "Helvetica Neue", Arial, sans-serif';
export const LINE_HEIGHT = 1.25;
export const STICKY_PADDING = 14;
export const SHAPE_PADDING = 10;

/** Fonts are self-hosted, so they cost no third-party requests. Latin only; other scripts fall back. */
export const FONTS: Record<FontId, { label: string; family: string }> = {
  sans: { label: 'Default', family: FONT_FAMILY },
  inter: { label: 'Inter', family: `"Inter", ${FONT_FAMILY}` },
  poppins: { label: 'Poppins', family: `"Poppins", ${FONT_FAMILY}` },
  merriweather: { label: 'Merriweather', family: '"Merriweather", Georgia, serif' },
  playfair: { label: 'Playfair Display', family: '"Playfair Display", Georgia, serif' },
  mono: { label: 'JetBrains Mono', family: '"JetBrains Mono", ui-monospace, Consolas, monospace' },
  caveat: { label: 'Caveat', family: '"Caveat", cursive' },
  marker: { label: 'Permanent Marker', family: '"Permanent Marker", cursive' },
  bebas: { label: 'Bebas Neue', family: '"Bebas Neue", Impact, sans-serif' },
};

/** Bumped whenever a font finishes loading, so canvas text drawn with its fallback can be redrawn. */
export const useFontEpoch = create<{ epoch: number }>()(() => ({ epoch: 0 }));

const widthCache = new Map<string, number>();
const fitCache = new Map<string, number>();
const loading = new Map<FontId, Promise<void>>();

/** Canvas text doesn't load web fonts by itself: wait for this before measuring or drawing with `font`. */
export function ensureFont(font: FontId): Promise<void> {
  if (font === 'sans') return Promise.resolve();
  let p = loading.get(font);
  if (!p) {
    p = document.fonts
      .load(`16px ${FONTS[font].family}`)
      .then(() => {
        widthCache.clear();
        fitCache.clear();
        useFontEpoch.setState((s) => ({ epoch: s.epoch + 1 }));
      })
      .catch(() => {
        loading.delete(font); // offline: keep the fallback, and try again next time
      });
    loading.set(font, p);
  }
  return p;
}

export function ensureFonts(objects: Iterable<BoardObject>): Promise<unknown> {
  const fonts = new Set<FontId>();
  for (const o of objects) if ('font' in o) fonts.add(o.font);
  return Promise.all([...fonts].map(ensureFont));
}

let ctx: CanvasRenderingContext2D | null = null;
const measurers = new Map<FontId, MeasureText>();

/** Text width at `size`px. Width scales linearly with size, so we measure once at 100px and cache. */
export function measureWith(font: FontId): MeasureText {
  let measure = measurers.get(font);
  if (!measure) {
    measure = (text, size) => {
      const key = `${font}|${text}`;
      let w = widthCache.get(key);
      if (w === undefined) {
        ctx ??= document.createElement('canvas').getContext('2d')!;
        ctx.font = `100px ${FONTS[font].family}`;
        w = ctx.measureText(text).width;
        if (widthCache.size > 20_000) widthCache.clear();
        widthCache.set(key, w);
      }
      return (w * size) / 100;
    };
    measurers.set(font, measure);
  }
  return measure;
}

export const measureText = measureWith('sans');

/** Auto-shrinking font size for text inside a box (stickies, shapes). */
export function autoFontSize(
  text: string,
  w: number,
  h: number,
  padding: number,
  font: FontId = 'sans',
): number {
  const max = Math.max(8, Math.round(Math.min(w, h) * 0.18));
  const key = `${font}|${w}|${h}|${padding}|${text}`;
  let size = fitCache.get(key);
  if (size === undefined) {
    size = fitFontSize(text, Math.max(1, w - padding * 2), Math.max(1, h - padding * 2), measureWith(font), {
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
export function textHeight(text: string, width: number, fontSize: number, font: FontId = 'sans'): number {
  const lines = Math.max(1, wrapText(text, width, fontSize, measureWith(font)).length);
  return lines * fontSize * LINE_HEIGHT;
}

/** The box a text object should have: hugging its content, or keeping a fixed width and wrapping. */
export function textBox(o: Pick<TextObject, 'text' | 'w' | 'fontSize' | 'font' | 'autoWidth'>) {
  if (!o.autoWidth) return { w: o.w, h: textHeight(o.text, o.w, o.fontSize, o.font) };
  const measure = measureWith(o.font);
  const lines = o.text.split('\n');
  const widest = Math.max(...lines.map((line) => measure(line, o.fontSize)));
  return {
    w: Math.max(Math.ceil(widest) + 2, Math.ceil(o.fontSize / 2)),
    h: lines.length * o.fontSize * LINE_HEIGHT,
  };
}
