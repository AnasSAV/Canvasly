import {
  makeImage,
  makeShape,
  makeText,
  parseCanvaClipboard,
  rotateAround,
  wrapText,
  type BoardObject,
  type CanvaElement,
  type CanvaParagraph,
  type CanvaRect,
  type CanvaRun,
  type CanvaShape,
  type FontId,
} from '@canvasly/shared';
import { LINE_HEIGHT, MAX_FONT_SIZE, ensureFont, measureWith, textBox } from '../canvas/text';
import { uploadPicture } from './htmlImport';

/** Canva names fonts by opaque id, so only ones seen on a real clipboard can be matched; others use the default. */
const CANVA_FONTS: Record<string, FontId> = {
  YAFdJjbTu24: 'poppins',
};

const fontOf = (run: CanvaRun): FontId => CANVA_FONTS[run.fontId ?? ''] ?? 'sans';

/** The same data as the custom clipboard type, which the async clipboard API can't see, hides in the HTML. */
export function canvaDataFromHtml(html: string): string | null {
  const encoded = /data-canva-clipboard="([^"]*)"/.exec(html)?.[1];
  if (!encoded) return null;
  try {
    const bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
    return new TextDecoder('utf-16le').decode(bytes);
  } catch {
    return null;
  }
}

const sameLook = (a: CanvaRun, b: CanvaRun) =>
  fontOf(a) === fontOf(b) &&
  Math.round(a.size) === Math.round(b.size) &&
  a.bold === b.bold &&
  a.italic === b.italic &&
  a.underline === b.underline &&
  a.strike === b.strike &&
  a.color === b.color;

const faceOf = (run: CanvaRun) => ({ font: fontOf(run), bold: run.bold, italic: run.italic });

function textObject(run: CanvaRun, text: string, x: number, y: number, align: CanvaParagraph['align']) {
  const fontSize = Math.max(4, Math.min(MAX_FONT_SIZE, Math.round(run.size)));
  const base = {
    ...makeText({ x, y }, '', run.color ?? '#000000', fontSize),
    text,
    ...faceOf(run),
    underline: run.underline,
    strike: run.strike,
    align,
  };
  return { ...base, ...textBox(base) };
}

/** Whitespace-only runs still push what follows along, but don't need an object. */
function layoutParagraph(p: CanvaParagraph, left: number, width: number, top: number, out: BoardObject[]) {
  const runs = p.runs.reduce<CanvaRun[]>((merged, run) => {
    const last = merged[merged.length - 1];
    // A run of spaces takes the look of what's beside it, so that it doesn't split the line.
    if (last && (sameLook(last, run) || !run.text.trim())) last.text += run.text;
    else merged.push({ ...run });
    return merged;
  }, []);
  const first = runs[0];
  if (!first) return null;
  const size = Math.max(...runs.map((r) => r.size));
  const lineHeight = first.lineHeight * size;
  // Our lines are a fixed multiple of the size, so center them in the line height that was used.
  const y = (run: CanvaRun) => top + (lineHeight - run.size * LINE_HEIGHT) / 2;

  const widths = runs.map((r, i) =>
    measureWith(faceOf(r))(i === runs.length - 1 ? r.text.trimEnd() : r.text, r.size),
  );
  const total = widths.reduce((a, b) => a + b, 0);
  const whole = runs
    .map((r) => r.text)
    .join('')
    .trimEnd();

  // Doesn't fit on one line: formatting is per object, so the paragraph takes the look of most of its characters.
  // Its lines are kept as real breaks, because the canvas would otherwise also break at hyphens, unlike Canva.
  if (total > width + 1) {
    const main = [...runs].sort((a, b) => b.text.length - a.text.length)[0]!;
    const lines = wrapText(whole, width, main.size, measureWith(faceOf(main)));
    const object = textObject(main, lines.join('\n'), left, y(main), p.align);
    const shift = p.align === 'center' ? (width - object.w) / 2 : p.align === 'right' ? width - object.w : 0;
    out.push({ ...object, x: left + shift });
    return lines.length * main.lineHeight * main.size;
  }

  let x =
    p.align === 'center' ? left + (width - total) / 2 : p.align === 'right' ? left + width - total : left;
  runs.forEach((run, i) => {
    const text = run.text.trimEnd();
    if (text) out.push(textObject(run, text, x, y(run), 'left'));
    x += widths[i]!;
  });
  return lineHeight;
}

/** Lay paragraphs out from the top of a box, and return how tall they came out. */
function layoutParagraphs(paragraphs: CanvaParagraph[], rect: CanvaRect, out: BoardObject[]): number {
  let top = rect.y;
  for (const p of paragraphs) {
    const height = layoutParagraph(p, rect.x, rect.w, top, out);
    top += height ?? (p.runs[0]?.size ?? 16) * 1.2;
  }
  return top - rect.y;
}

/** Marks where something that can't come across was, so that the layout around it survives. */
function placeholder(rect: CanvaRect, label: string): BoardObject {
  return {
    ...makeShape('rect', rect, '', { fill: '#e9ecef', stroke: '#adb5bd' }),
    strokeWidth: 1,
    text: label,
    textColor: '#868e96',
  };
}

const escapeAttribute = (v: string) =>
  v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Inline SVG of a shape's paths, at double size so that it stays sharp when rasterized. */
function shapeSvg({ viewBox, paths, rect }: CanvaShape): string {
  const body = paths.map((p) => `<path d="${escapeAttribute(p.d)}" fill="${p.fill ?? 'none'}"/>`).join('');
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewBox.w} ${viewBox.h}" ` +
    `width="${rect.w * 2}" height="${rect.h * 2}" preserveAspectRatio="none">${body}</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** The fill of a shape that's just a filled rectangle, which can stay a real, editable shape. */
function plainRectFill({ paths, viewBox }: CanvaShape): string | null {
  const [only] = paths;
  if (paths.length !== 1 || !only?.fill) return null;
  const m = /^M0 0H([\d.]+)V([\d.]+)H0z$/i.exec(only.d.trim());
  return m && Number(m[1]) === viewBox.w && Number(m[2]) === viewBox.h ? only.fill : null;
}

/** Canva rotates around the center of the element, and we rotate around the corner of each object. */
function rotated(objects: BoardObject[], e: CanvaElement): BoardObject[] {
  if (!e.rotation) return objects;
  const center = { x: e.rect.x + e.rect.w / 2, y: e.rect.y + e.rect.h / 2 };
  return objects.map((o) =>
    o.type === 'connector'
      ? o
      : { ...o, ...rotateAround({ x: o.x, y: o.y }, center, e.rotation), rotation: e.rotation },
  );
}

/**
 * Board objects for what's on a Canva clipboard, or null if the data can't be read. Pictures, and any element
 * there's no reader for, become labeled boxes of the same size in the same place.
 */
export async function canvaToObjects(boardId: string, json: string) {
  const elements = parseCanvaClipboard(json);
  if (!elements) return null;
  const fonts = new Set<FontId>();
  for (const e of elements) {
    if (e.kind === 'text' || e.kind === 'shape') {
      for (const p of e.paragraphs) for (const r of p.runs) fonts.add(fontOf(r));
    }
  }
  await Promise.all([...fonts].map(ensureFont));

  let pictures = 0;
  let unreadable = 0;
  const pieces = await Promise.all(
    elements.map(async (e): Promise<BoardObject[]> => {
      const out: BoardObject[] = [];
      if (e.kind === 'text') {
        layoutParagraphs(e.paragraphs, e.rect, out);
      } else if (e.kind === 'picture') {
        pictures += 1;
        out.push(placeholder(e.rect, 'Picture from Canva'));
      } else if (e.kind === 'other') {
        unreadable += 1;
        out.push(placeholder(e.rect, 'Element from Canva'));
      } else {
        const fill = plainRectFill(e);
        const anyFill = e.paths.some((p) => p.fill);
        const uploaded = fill || !anyFill ? null : await uploadPicture(boardId, shapeSvg(e));
        if (fill) {
          out.push({ ...makeShape('rect', e.rect, '', { fill, stroke: 'transparent' }), strokeWidth: 0 });
        } else if (uploaded) {
          const { x, y, w, h } = e.rect;
          out.push({
            ...makeImage({ x, y }, '', uploaded.assetId, uploaded.width, uploaded.height),
            x,
            y,
            w,
            h,
          });
        } else {
          unreadable += 1;
          out.push(placeholder(e.rect, 'Element from Canva'));
        }
        // Text inside a shape is centered in it, and stays a separate object above it.
        const text: BoardObject[] = [];
        const height = layoutParagraphs(e.paragraphs, e.rect, text);
        const shift = (e.rect.h - height) / 2;
        for (const o of text) if (o.type !== 'connector') out.push({ ...o, y: o.y + shift } as BoardObject);
      }
      return rotated(out, e);
    }),
  );
  return { objects: pieces.flat(), pictures, unreadable };
}
