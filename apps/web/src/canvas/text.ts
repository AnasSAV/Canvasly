import '../fonts.css';
import {
  FONT_IDS,
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
/** How far a text object's background extends past its box. */
export const TEXT_BACKGROUND_PADDING = 4;

/** Web fonts are Latin only, and other scripts fall back. `system` fonts are never downloaded. */
export const FONTS: Record<FontId, { label: string; family: string; system?: boolean }> = {
  sans: { label: 'Default', family: FONT_FAMILY, system: true },
  abril: { label: 'Abril Fatface', family: '"Abril Fatface", Georgia, serif' },
  arial: { label: 'Arial', family: 'Arial, Helvetica, sans-serif', system: true },
  bangers: { label: 'Bangers', family: '"Bangers", Impact, sans-serif' },
  bebas: { label: 'Bebas Neue', family: '"Bebas Neue", Impact, sans-serif' },
  caveat: { label: 'Caveat', family: '"Caveat", cursive' },
  courier: { label: 'Courier New', family: '"Courier New", Courier, monospace', system: true },
  fredoka: { label: 'Fredoka One', family: `"Fredoka One", ${FONT_FAMILY}` },
  garamond: { label: 'EB Garamond', family: '"EB Garamond", Georgia, serif' },
  georgia: { label: 'Georgia', family: 'Georgia, "Times New Roman", serif', system: true },
  graduate: { label: 'Graduate', family: '"Graduate", Georgia, serif' },
  gravitas: { label: 'Gravitas One', family: '"Gravitas One", Georgia, serif' },
  inter: { label: 'Inter', family: `"Inter", ${FONT_FAMILY}` },
  lato: { label: 'Lato', family: `"Lato", ${FONT_FAMILY}` },
  merriweather: { label: 'Merriweather', family: '"Merriweather", Georgia, serif' },
  mono: { label: 'JetBrains Mono', family: '"JetBrains Mono", ui-monospace, Consolas, monospace' },
  montserrat: { label: 'Montserrat', family: `"Montserrat", ${FONT_FAMILY}` },
  noto: { label: 'Noto Sans', family: `"Noto Sans", ${FONT_FAMILY}` },
  opensans: { label: 'Open Sans', family: `"Open Sans", ${FONT_FAMILY}` },
  oswald: { label: 'Oswald', family: `"Oswald", ${FONT_FAMILY}` },
  marker: { label: 'Permanent Marker', family: '"Permanent Marker", cursive' },
  playfair: { label: 'Playfair Display', family: '"Playfair Display", Georgia, serif' },
  plexmono: { label: 'IBM Plex Mono', family: '"IBM Plex Mono", ui-monospace, Consolas, monospace' },
  plexsans: { label: 'IBM Plex Sans', family: `"IBM Plex Sans", ${FONT_FAMILY}` },
  plexserif: { label: 'IBM Plex Serif', family: '"IBM Plex Serif", Georgia, serif' },
  poppins: { label: 'Poppins', family: `"Poppins", ${FONT_FAMILY}` },
  roboto: { label: 'Roboto', family: `"Roboto", ${FONT_FAMILY}` },
  times: { label: 'Times New Roman', family: '"Times New Roman", Times, serif', system: true },
};

/** Default first, then alphabetical. */
export const FONT_MENU: FontId[] = [
  'sans',
  ...FONT_IDS.filter((id) => id !== 'sans').sort((a, b) => FONTS[a].label.localeCompare(FONTS[b].label)),
];

export const MAX_FONT_SIZE = 1000;
const FONT_SIZES = [
  8,
  10,
  12,
  14,
  18,
  24,
  30,
  36,
  48,
  64,
  80,
  96,
  144,
  200,
  288,
  400,
  600,
  800,
  MAX_FONT_SIZE,
];

/** The next common size up or down from `size`. */
export function stepFontSize(size: number, dir: 1 | -1): number {
  const rounded = Math.round(size);
  if (dir > 0) return FONT_SIZES.find((s) => s > rounded) ?? MAX_FONT_SIZE;
  return [...FONT_SIZES].reverse().find((s) => s < rounded) ?? 4;
}

/**
 * The font we have that's closest to a CSS font-family list from elsewhere: the same font if we have it,
 * otherwise one of the same kind.
 */
export function matchFont(cssFamily: string): FontId {
  const names = cssFamily
    .split(',')
    .map((n) =>
      n
        .trim()
        .replace(/^["']|["']$/g, '')
        .toLowerCase(),
    )
    .filter(Boolean);
  for (const name of names) {
    const same = FONT_IDS.find((id) => id !== 'sans' && FONTS[id].label.toLowerCase() === name);
    if (same) return same;
  }
  const all = names.join(' ');
  if (/mono|courier|consol|\bcode\b/.test(all)) return 'mono';
  if (/script|hand|brush|cursive|marker|signature/.test(all)) return 'caveat';
  if (/impact|anton|league gothic|condensed/.test(all)) return 'bebas';
  if (/(?<!sans[- ])serif|garamond|times|baskerville|didot|bodoni|lora|cambria/.test(all)) return 'georgia';
  return 'sans';
}

/** What decides how wide text is. Objects carry these fields, so any of them can be passed as is. */
export type TextFace = Pick<TextObject, 'font' | 'bold' | 'italic'>;
const PLAIN: TextFace = { font: 'sans', bold: false, italic: false };

/** Konva's fontStyle, and the prefix of a canvas font string. */
export const fontStyle = (f: Pick<TextFace, 'bold' | 'italic'>): string =>
  [f.italic && 'italic', f.bold && 'bold'].filter(Boolean).join(' ') || 'normal';

/** Konva's textDecoration. A linked object is underlined so that it reads as a link. */
export const textDecoration = (o: Pick<TextObject, 'underline' | 'strike' | 'link'>): string =>
  [(o.underline || o.link) && 'underline', o.strike && 'line-through'].filter(Boolean).join(' ');

/** Bumped whenever a font finishes loading, so canvas text drawn with its fallback can be redrawn. */
export const useFontEpoch = create<{ epoch: number }>()(() => ({ epoch: 0 }));

const widthCache = new Map<string, number>();
const fitCache = new Map<string, number>();
const loading = new Map<FontId, Promise<void>>();

/** Canvas text doesn't load web fonts by itself: wait for this before measuring or drawing with `font`. */
export function ensureFont(font: FontId): Promise<void> {
  if (FONTS[font].system) return Promise.resolve();
  let p = loading.get(font);
  if (!p) {
    const { family } = FONTS[font];
    p = Promise.all(['', 'bold ', 'italic '].map((style) => document.fonts.load(`${style}16px ${family}`)))
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
const measurers = new Map<string, MeasureText>();

/** Text width at `size`px. Width scales linearly with size, so we measure once at 100px and cache. */
export function measureWith(face: TextFace = PLAIN): MeasureText {
  const style = fontStyle(face);
  const id = `${face.font}|${style}`;
  let measure = measurers.get(id);
  if (!measure) {
    const { family } = FONTS[face.font];
    measure = (text, size) => {
      const key = `${id}|${text}`;
      let w = widthCache.get(key);
      if (w === undefined) {
        ctx ??= document.createElement('canvas').getContext('2d')!;
        ctx.font = `${style} 100px ${family}`;
        w = ctx.measureText(text).width;
        if (widthCache.size > 20_000) widthCache.clear();
        widthCache.set(key, w);
      }
      return (w * size) / 100;
    };
    measurers.set(id, measure);
  }
  return measure;
}

export const measureText = measureWith();

/** Auto-shrinking font size for text inside a box (stickies, shapes). */
export function autoFontSize(
  text: string,
  w: number,
  h: number,
  padding: number,
  face: TextFace = PLAIN,
  largest: number = Math.max(8, Math.round(Math.min(w, h) * 0.18)),
): number {
  const max = largest;
  const key = `${face.font}|${fontStyle(face)}|${w}|${h}|${padding}|${max}|${text}`;
  let size = fitCache.get(key);
  if (size === undefined) {
    size = fitFontSize(text, Math.max(1, w - padding * 2), Math.max(1, h - padding * 2), measureWith(face), {
      min: 4,
      max,
      lineHeight: LINE_HEIGHT,
    });
    if (fitCache.size > 5000) fitCache.clear();
    fitCache.set(key, size);
  }
  return size;
}

const MAX_SHAPE_TEXT = 28;

/**
 * Size for text in a shape. Its upper limit comes from the whole shape, not the area text is allowed in, which is small
 * in a diamond or a star and would otherwise make its text tiny however short it is.
 */
export function shapeFontSize(
  text: string,
  box: { w: number; h: number },
  shape: { w: number; h: number },
  face: TextFace,
): number {
  const largest = Math.max(8, Math.min(MAX_SHAPE_TEXT, Math.round(Math.min(shape.w, shape.h) * 0.2)));
  return autoFontSize(text, box.w, box.h, 0, face, largest);
}

type TextShape = Pick<TextObject, 'text' | 'w' | 'fontSize' | 'autoWidth'> & TextFace;

const linesOf = (o: TextShape) =>
  o.autoWidth ? o.text.split('\n') : wrapText(o.text, o.w, o.fontSize, measureWith(o));

/** The box a text object should have: hugging its content, or keeping a fixed width and wrapping. */
export function textBox(o: TextShape) {
  const lines = linesOf(o);
  const h = Math.max(1, lines.length) * o.fontSize * LINE_HEIGHT;
  if (!o.autoWidth) return { w: o.w, h };
  const measure = measureWith(o);
  const widest = Math.max(...lines.map((line) => measure(line, o.fontSize)));
  return { w: Math.max(Math.ceil(widest) + 2, Math.ceil(o.fontSize / 2)), h };
}

/** Where each line of a text object sits inside its box, for painting a highlight behind it. */
export function textLineRects(o: TextShape & Pick<TextObject, 'align'>) {
  const measure = measureWith(o);
  const lineH = o.fontSize * LINE_HEIGHT;
  return linesOf(o).map((line, i) => {
    const w = measure(line, o.fontSize);
    const x = o.align === 'center' ? (o.w - w) / 2 : o.align === 'right' ? o.w - w : 0;
    return { x, y: i * lineH, w, h: lineH, empty: !line };
  });
}
