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

export const StickyObject = Box.extend({
  type: z.literal('sticky'),
  color: Color,
  text: z.string().default(''),
});

export const TextObject = Box.extend({
  type: z.literal('text'),
  text: z.string().default(''),
  fontSize: z.number().positive(),
  color: Color,
  align: z.enum(['left', 'center', 'right']).default('left'),
});

export const SHAPE_KINDS = ['rect', 'ellipse', 'triangle'] as const;
export type ShapeKind = (typeof SHAPE_KINDS)[number];

const ShapeFields = {
  fill: Color,
  stroke: Color,
  strokeWidth: z.number().min(0),
  text: z.string().default(''),
  textColor: Color,
};

export const RectObject = Box.extend({ type: z.literal('rect'), ...ShapeFields });
export const EllipseObject = Box.extend({ type: z.literal('ellipse'), ...ShapeFields });
export const TriangleObject = Box.extend({ type: z.literal('triangle'), ...ShapeFields });

export const PenObject = Box.extend({
  type: z.literal('pen'),
  /** Flat [x0, y0, x1, y1, ...] in local coordinates (relative to x, y, already scaled to w/h). */
  points: z.array(z.number()),
  stroke: Color,
  size: z.number().positive(),
});

export const ImageObject = Box.extend({
  type: z.literal('image'),
  assetId: z.string().min(1),
  naturalW: z.number().positive(),
  naturalH: z.number().positive(),
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
  RectObject,
  EllipseObject,
  TriangleObject,
  PenObject,
  ImageObject,
  ConnectorObject,
]);

export type StickyObject = z.infer<typeof StickyObject>;
export type TextObject = z.infer<typeof TextObject>;
export type RectObject = z.infer<typeof RectObject>;
export type EllipseObject = z.infer<typeof EllipseObject>;
export type TriangleObject = z.infer<typeof TriangleObject>;
export type PenObject = z.infer<typeof PenObject>;
export type ImageObject = z.infer<typeof ImageObject>;
export type ConnectorObject = z.infer<typeof ConnectorObject>;
export type ConnectorEnd = z.infer<typeof ConnectorEnd>;
export type Anchor = z.infer<typeof Anchor>;
export type BoardObject = z.infer<typeof BoardObject>;
export type ObjectType = BoardObject['type'];
export type BoxObject = Exclude<BoardObject, ConnectorObject>;
export type ShapeObject = RectObject | EllipseObject | TriangleObject;

/** Object types that carry collaboratively-edited text (stored as Y.Text). */
export const TEXT_TYPES = ['sticky', 'text', 'rect', 'ellipse', 'triangle'] as const satisfies ObjectType[];
export type TextBearingObject = Extract<BoardObject, { type: (typeof TEXT_TYPES)[number] }>;

export function isBoxObject(o: BoardObject): o is BoxObject {
  return o.type !== 'connector';
}

export function hasText(o: BoardObject): o is TextBearingObject {
  return (TEXT_TYPES as readonly string[]).includes(o.type);
}

export function isShapeObject(o: BoardObject): o is ShapeObject {
  return o.type === 'rect' || o.type === 'ellipse' || o.type === 'triangle';
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
