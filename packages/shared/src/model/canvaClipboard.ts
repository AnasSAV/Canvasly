import { z } from 'zod';

/**
 * Canva's clipboard format, as observed: it isn't documented, so everything here is read defensively, and anything
 * that doesn't match falls back to the other forms on the clipboard.
 *
 * Elements carry short keys: A top, B left, D width, C height, E rotation in degrees around the center, and `A?` the
 * kind: K text, I picture, J shape. Pictures only hold a private media id, never the image itself.
 *
 * Text (`a.C` on text, `f[0].A.C` on shapes) has A, the paragraphs, and C and D, the style changes. Change i lands
 * D[0] + ... + D[i] characters in, setting each key it has, or clearing one: `true` under the key one character code
 * above (J clears I, BD clears BC). Shapes hold SVG paths in `b` (A the path, B.C the fill), in a space of size `a`.
 */

const Element = z.looseObject({
  A: z.number(),
  B: z.number(),
  C: z.number(),
  D: z.number(),
  E: z.number().optional(),
  'A?': z.string(),
  a: z.unknown().optional(),
  b: z.unknown().optional(),
  f: z.unknown().optional(),
});

const Clipboard = z.looseObject({ A: z.array(Element) });

const RichText = z.object({
  C: z.object({
    A: z.array(z.string()),
    C: z.array(z.record(z.string(), z.unknown())),
    D: z.array(z.number()),
  }),
});

const ViewBox = z.object({ C: z.number().positive(), D: z.number().positive() });
const Paths = z.array(
  z.looseObject({ A: z.string(), B: z.looseObject({ C: z.string().optional() }).optional() }),
);
const ShapeText = z.array(z.looseObject({ A: z.unknown() }));

export interface CanvaRun {
  text: string;
  /** Canva's own font id, which doesn't name the font. */
  fontId: string | null;
  size: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  color: string | null;
  /** Multiple of the font size. */
  lineHeight: number;
}

export interface CanvaParagraph {
  runs: CanvaRun[];
  align: 'left' | 'center' | 'right';
}

export interface CanvaRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Placed {
  rect: CanvaRect;
  rotation: number;
}

export interface CanvaText extends Placed {
  kind: 'text';
  paragraphs: CanvaParagraph[];
}

export interface CanvaPicture extends Placed {
  kind: 'picture';
}

export interface CanvaShape extends Placed {
  kind: 'shape';
  viewBox: { w: number; h: number };
  paths: { d: string; fill: string | null }[];
  paragraphs: CanvaParagraph[];
}

export interface CanvaOther extends Placed {
  kind: 'other';
  /** Canva's element kind, for those there's no reader for. */
  canvaKind: string;
}

export type CanvaElement = CanvaText | CanvaPicture | CanvaShape | CanvaOther;

const HEX = /^#[0-9a-f]{3,8}$/i;

const clearedKey = (key: string) =>
  key.slice(0, -1) + String.fromCharCode(key.charCodeAt(key.length - 1) - 1);

function toRun(text: string, style: Record<string, unknown>): CanvaRun {
  const weight = style.I;
  const color = style.M;
  const decoration = typeof style.O === 'string' ? style.O : '';
  return {
    text,
    fontId: typeof style.C === 'string' ? style.C.split(',')[0]! : null,
    size: parseFloat(String(style.G)) || 16,
    bold: weight === 'bold' || Number(weight) >= 600,
    italic: style.K === 'italic',
    underline: decoration.includes('underline'),
    strike: decoration.includes('line-through'),
    color: typeof color === 'string' && HEX.test(color) ? color : null,
    lineHeight: parseFloat(String(style.Y)) || 1.2,
  };
}

function toParagraphs(content: unknown): CanvaParagraph[] | null {
  const parsed = RichText.safeParse(content);
  if (!parsed.success) return null;
  const { A: lines, C: changes, D: lengths } = parsed.data.C;
  const full = lines.join('');

  // Replay the changes to find the style in force from each offset on.
  const spans: { start: number; style: Record<string, unknown> }[] = [];
  let style: Record<string, unknown> = {};
  let offset = 0;
  changes.forEach((change, i) => {
    offset += lengths[i] ?? 0;
    style = { ...style };
    for (const [key, value] of Object.entries(change)) {
      if (value === true) Reflect.deleteProperty(style, clearedKey(key));
      else style[key] = value;
    }
    spans.push({ start: offset, style });
  });

  const paragraphs: CanvaParagraph[] = [];
  let start = 0;
  for (const raw of full.split('\n')) {
    const end = start + raw.length;
    if (end < full.length || raw) {
      const runs: CanvaRun[] = [];
      let align: CanvaParagraph['align'] = 'left';
      spans.forEach((span, i) => {
        const from = Math.max(span.start, start);
        const to = Math.min(spans[i + 1]?.start ?? full.length, end);
        if (span.start <= start && (spans[i + 1]?.start ?? full.length) > start) {
          const c = span.style.c;
          align = c === 'center' ? 'center' : c === 'end' || c === 'right' ? 'right' : 'left';
        }
        if (to > from) runs.push(toRun(full.slice(from, to), span.style));
      });
      paragraphs.push({ runs, align });
    }
    start = end + 1;
  }
  return paragraphs;
}

function toShape(e: z.infer<typeof Element>, placed: Placed): CanvaShape | null {
  const box = ViewBox.safeParse(e.a);
  const paths = Paths.safeParse(e.b);
  if (!box.success || !paths.success || !paths.data.length) return null;
  const text = ShapeText.safeParse(e.f);
  return {
    kind: 'shape',
    ...placed,
    viewBox: { w: box.data.D, h: box.data.C },
    paths: paths.data.map((p) => {
      const fill = p.B?.C;
      return { d: p.A, fill: fill && HEX.test(fill) ? fill : null };
    }),
    paragraphs: (text.success && toParagraphs(text.data[0]?.A)) || [],
  };
}

/** What was copied, in paint order, or null if this isn't a clipboard we understand. */
export function parseCanvaClipboard(json: string): CanvaElement[] | null {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return null;
  }
  const parsed = Clipboard.safeParse(data);
  if (!parsed.success) return null;
  return parsed.data.A.map((e): CanvaElement => {
    const kind = e['A?'];
    const placed = { rect: { x: e.B, y: e.A, w: e.D, h: e.C }, rotation: e.E ?? 0 };
    if (kind === 'I') return { kind: 'picture', ...placed };
    const paragraphs = kind === 'K' ? toParagraphs(e.a) : null;
    if (paragraphs) return { kind: 'text', ...placed, paragraphs };
    const shape = kind === 'J' ? toShape(e, placed) : null;
    return shape ?? { kind: 'other', canvaKind: kind, ...placed };
  });
}
