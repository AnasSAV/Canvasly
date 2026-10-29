import { nanoid } from 'nanoid';
import type { Vec } from '../geometry/vec';
import {
  STICKY_COLORS,
  type ConnectorEnd,
  type ConnectorObject,
  type ImageObject,
  type PenObject,
  type ShapeKind,
  type ShapeObject,
  type StickyObject,
  type TextObject,
} from '../schemas/objects';

export const newId = (): string => nanoid(12);

export const STICKY_SIZE = 200;
export const DEFAULT_SHAPE_SIZE = { w: 160, h: 100 };

export function makeSticky(at: Vec, z: string, color: string = STICKY_COLORS[0]): StickyObject {
  return {
    id: newId(),
    type: 'sticky',
    z,
    locked: false,
    groupId: null,
    x: at.x,
    y: at.y,
    w: STICKY_SIZE,
    h: STICKY_SIZE,
    rotation: 0,
    color,
    text: '',
  };
}

export function makeText(at: Vec, z: string, color = '#1a1a1a', fontSize = 24): TextObject {
  return {
    id: newId(),
    type: 'text',
    z,
    locked: false,
    groupId: null,
    x: at.x,
    y: at.y,
    w: 240,
    h: Math.round(fontSize * 1.25),
    rotation: 0,
    text: '',
    fontSize,
    color,
    align: 'left',
  };
}

export function makeShape(
  kind: ShapeKind,
  box: { x: number; y: number; w: number; h: number },
  z: string,
  style: { fill: string; stroke: string } = { fill: '#ffffff', stroke: '#1a1a1a' },
): ShapeObject {
  return {
    id: newId(),
    type: kind,
    z,
    locked: false,
    groupId: null,
    ...box,
    rotation: 0,
    fill: style.fill,
    stroke: style.stroke,
    strokeWidth: 2,
    text: '',
    textColor: '#1a1a1a',
  };
}

export function makeConnector(
  start: ConnectorEnd,
  end: ConnectorEnd,
  z: string,
  opts: { arrow: boolean; stroke?: string },
): ConnectorObject {
  return {
    id: newId(),
    type: 'connector',
    z,
    locked: false,
    groupId: null,
    start,
    end,
    routing: 'straight',
    stroke: opts.stroke ?? '#1a1a1a',
    strokeWidth: 2,
    startCap: 'none',
    endCap: opts.arrow ? 'arrow' : 'none',
  };
}

/** Build a pen object from absolute world points; stores them relative to their bounding box. */
export function makePen(worldPoints: readonly number[], z: string, stroke: string, size: number): PenObject {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i + 1 < worldPoints.length; i += 2) {
    minX = Math.min(minX, worldPoints[i]!);
    maxX = Math.max(maxX, worldPoints[i]!);
    minY = Math.min(minY, worldPoints[i + 1]!);
    maxY = Math.max(maxY, worldPoints[i + 1]!);
  }
  const points = worldPoints.map((v, i) => Math.round((v - (i % 2 === 0 ? minX : minY)) * 10) / 10);
  return {
    id: newId(),
    type: 'pen',
    z,
    locked: false,
    groupId: null,
    x: minX,
    y: minY,
    w: Math.max(1, maxX - minX),
    h: Math.max(1, maxY - minY),
    rotation: 0,
    points,
    stroke,
    size,
  };
}

export function makeImage(
  at: Vec,
  z: string,
  assetId: string,
  naturalW: number,
  naturalH: number,
  maxSide = 480,
): ImageObject {
  const s = Math.min(1, maxSide / Math.max(naturalW, naturalH));
  const w = naturalW * s;
  const h = naturalH * s;
  return {
    id: newId(),
    type: 'image',
    z,
    locked: false,
    groupId: null,
    x: at.x - w / 2,
    y: at.y - h / 2,
    w,
    h,
    rotation: 0,
    assetId,
    naturalW,
    naturalH,
  };
}
