import { z } from 'zod';

/** Hex color like #fff or #ffcc00, or 'transparent'. */
export const Color = z.union([z.string().regex(/^#(?:[0-9a-fA-F]{3}){1,2}$/), z.literal('transparent')]);

const Base = z.object({
  id: z.string().min(1).max(64),
  /** Fractional index; sort ascending (plain string comparison) to get paint order. */
  z: z.string().min(1),
  locked: z.boolean().default(false),
  groupId: z.string().nullable().default(null),
});

/**
 * Box objects follow Konva's transform model: (x, y) is the node origin (unrotated top-left corner),
 * and `rotation` (degrees) is applied around that origin.
 */
const Box = Base.extend({
  x: z.number(),
  y: z.number(),
  w: z.number().positive(),
  h: z.number().positive(),
  rotation: z.number().default(0),
});

export const FONT_IDS = [
  'sans',
  'abril',
  'arial',
  'bangers',
  'bebas',
  'caveat',
  'courier',
  'fredoka',
  'garamond',
  'georgia',
  'graduate',
  'gravitas',
  'inter',
  'lato',
  'merriweather',
  'mono',
  'montserrat',
  'noto',
  'opensans',
  'oswald',
  'marker',
  'playfair',
  'plexmono',
  'plexsans',
  'plexserif',
  'poppins',
  'roboto',
  'times',
] as const;
export type FontId = (typeof FONT_IDS)[number];

/** Objects from before fonts existed, or using a font this client doesn't know, fall back to the default. */
const Font = z.enum(FONT_IDS).default('sans').catch('sans');

/** Links come from other people's edits and get opened, so anything that could run script is dropped. */
export function isSafeLink(url: string): boolean {
  return /^(https?:\/\/|mailto:)\S+$/i.test(url);
}

const Align = z.enum(['left', 'center', 'right']);

/** Formatting applies to an object's whole text. */
const TextStyle = {
  font: Font,
  bold: z.boolean().default(false),
  italic: z.boolean().default(false),
  underline: z.boolean().default(false),
  strike: z.boolean().default(false),
  link: z.string().max(2000).refine(isSafeLink).nullable().default(null).catch(null),
};

export const StickyObject = Box.extend({
  type: z.literal('sticky'),
  color: Color,
  text: z.string().default(''),
  align: Align.default('center'),
  ...TextStyle,
});

export const TextObject = Box.extend({
  type: z.literal('text'),
  text: z.string().default(''),
  fontSize: z.number().positive(),
  color: Color,
  align: Align.default('left'),
  /** Marker color behind the lines of text. */
  highlight: Color.default('transparent'),
  /** Fill behind the whole text box. */
  background: Color.default('transparent'),
  ...TextStyle,
  /** The box hugs the text and never wraps; dragging a side handle fixes the width. Older text is fixed. */
  autoWidth: z.boolean().default(false),
});

export const SHAPE_KINDS = [
  'rect',
  'roundrect',
  'ellipse',
  'triangle',
  'diamond',
  'pentagon',
  'hexagon',
  'octagon',
  'star',
  'parallelogram',
  'trapezoid',
  'arrowblock',
  'chevron',
  'cross',
  'cylinder',
  'cloud',
  'bubble',
  'document',
] as const;
export type ShapeKind = (typeof SHAPE_KINDS)[number];

const ShapeFields = {
  fill: Color,
  stroke: Color,
  strokeWidth: z.number().min(0),
  text: z.string().default(''),
  textColor: Color,
  align: Align.default('center'),
  ...TextStyle,
};

export const ShapeObject = Box.extend({ type: z.enum(SHAPE_KINDS), ...ShapeFields });

export const PenObject = Box.extend({
  type: z.literal('pen'),
  /** Flat [x0, y0, x1, y1, ...] in local coordinates (relative to x, y, already scaled to w/h). */
  points: z.array(z.number()),
  stroke: Color,
  size: z.number().positive(),
  /** Below 1 for highlighter strokes. */
  opacity: z.number().min(0).max(1).default(1),
});

export const ImageObject = Box.extend({
  type: z.literal('image'),
  assetId: z.string().min(1),
  naturalW: z.number().positive(),
  naturalH: z.number().positive(),
});

/** Named area; objects inside move with it and it's a page in presentation mode / PDF export. */
export const FrameObject = Box.extend({
  type: z.literal('frame'),
  name: z.string().max(80),
  fill: Color,
});

/**
 * Rows and columns have stable ids so inserting or deleting one doesn't renumber the cells. Cell text is keyed
 * `rowId:colId` and stored as a nested Y.Map, so two people editing different cells never conflict.
 */
export const TableObject = Box.extend({
  type: z.literal('table'),
  columns: z.array(z.object({ id: z.string(), w: z.number().positive() })).min(1),
  rows: z.array(z.object({ id: z.string(), h: z.number().positive() })).min(1),
  cells: z.record(z.string(), z.string()),
  headerRow: z.boolean().default(true),
  headerFill: Color,
  fontSize: z.number().positive().default(14),
});

export const CHART_KINDS = ['bar', 'line', 'area', 'pie', 'donut'] as const;
export type ChartKind = (typeof CHART_KINDS)[number];

export const ChartObject = Box.extend({
  type: z.literal('chart'),
  chartKind: z.enum(CHART_KINDS),
  title: z.string().max(120).default(''),
  labels: z.array(z.string().max(60)).max(60),
  /** Each series has one value per label. Pie and donut charts use only the first series. */
  series: z
    .array(z.object({ name: z.string().max(60), color: Color, values: z.array(z.number().finite()) }))
    .min(1)
    .max(8),
});

/** Anchor in the attached object's local box, normalized 0..1. 'auto' clips toward the other end. */
export const Anchor = z.union([z.literal('auto'), z.tuple([z.number(), z.number()])]);

export const ConnectorEnd = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('point'), x: z.number(), y: z.number() }),
  z.object({ kind: z.literal('attached'), objectId: z.string(), anchor: Anchor }),
]);

export const ConnectorObject = Base.extend({
  type: z.literal('connector'),
  start: ConnectorEnd,
  end: ConnectorEnd,
  routing: z.enum(['straight', 'elbow']).default('straight'),
  stroke: Color,
  strokeWidth: z.number().positive(),
  startCap: z.enum(['none', 'arrow']).default('none'),
  endCap: z.enum(['none', 'arrow']).default('none'),
});

export const BoardObject = z.discriminatedUnion('type', [
  StickyObject,
  TextObject,
  ShapeObject,
  PenObject,
  ImageObject,
  ConnectorObject,
  FrameObject,
  TableObject,
  ChartObject,
]);

export type StickyObject = z.infer<typeof StickyObject>;
export type TextObject = z.infer<typeof TextObject>;
export type ShapeObject = z.infer<typeof ShapeObject>;
export type PenObject = z.infer<typeof PenObject>;
export type ImageObject = z.infer<typeof ImageObject>;
export type ConnectorObject = z.infer<typeof ConnectorObject>;
export type FrameObject = z.infer<typeof FrameObject>;
export type TableObject = z.infer<typeof TableObject>;
export type ChartObject = z.infer<typeof ChartObject>;
export type ConnectorEnd = z.infer<typeof ConnectorEnd>;
export type Anchor = z.infer<typeof Anchor>;
export type BoardObject = z.infer<typeof BoardObject>;
export type ObjectType = BoardObject['type'];
export type BoxObject = Exclude<BoardObject, ConnectorObject>;

/** Object types that carry collaboratively-edited text (stored as Y.Text). */
export const TEXT_TYPES = ['sticky', 'text', ...SHAPE_KINDS] as const satisfies ObjectType[];
export type TextBearingObject = Extract<BoardObject, { type: (typeof TEXT_TYPES)[number] }>;

export function isBoxObject(o: BoardObject): o is BoxObject {
  return o.type !== 'connector';
}

export function hasText(o: BoardObject): o is TextBearingObject {
  return (TEXT_TYPES as readonly string[]).includes(o.type);
}

export function isShapeObject(o: BoardObject): o is ShapeObject {
  return (SHAPE_KINDS as readonly string[]).includes(o.type);
}

export const STICKY_COLORS = [
  '#fff9b1',
  '#f5d128',
  '#d5f692',
  '#c9df56',
  '#a6ccf5',
  '#6cd8fa',
  '#ffcee0',
  '#ff9d48',
  '#ea94bb',
  '#be88c7',
  '#f0f0f0',
  '#b384bb',
] as const;

export const STROKE_COLORS = [
  '#1a1a1a',
  '#e6e6e6',
  '#e03131',
  '#f08c00',
  '#2f9e44',
  '#1971c2',
  '#7048e8',
  '#c2255c',
] as const;
