import { nanoid } from 'nanoid';
import type { Vec } from '../geometry/vec';
import {
  STICKY_COLORS,
  type ChartKind,
  type ChartObject,
  type ConnectorEnd,
  type ConnectorObject,
  type DocumentObject,
  type DocumentPage,
  type FrameObject,
  type ImageObject,
  type PenObject,
  type ShapeKind,
  type ShapeObject,
  type StickyObject,
  type TableObject,
  type TextObject,
} from '../schemas/objects';

export const newId = (): string => nanoid(12);

export const STICKY_SIZE = 200;
export const DEFAULT_SHAPE_SIZE = { w: 160, h: 100 };

const PLAIN_TEXT = {
  font: 'sans',
  bold: false,
  italic: false,
  underline: false,
  strike: false,
  link: null,
} as const;

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
    align: 'center',
    ...PLAIN_TEXT,
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
    w: Math.ceil(fontSize / 2),
    h: Math.round(fontSize * 1.25),
    rotation: 0,
    text: '',
    fontSize,
    color,
    align: 'left',
    highlight: 'transparent',
    background: 'transparent',
    ...PLAIN_TEXT,
    autoWidth: true,
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
    align: 'center',
    cornerRadius: null,
    ...PLAIN_TEXT,
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
    dash: 'solid',
    bend: null,
    label: '',
  };
}

export const DEFAULT_FRAME_SIZE = { w: 800, h: 450 };

export function makeFrame(
  box: { x: number; y: number; w: number; h: number },
  z: string,
  name: string,
): FrameObject {
  return {
    id: newId(),
    type: 'frame',
    z,
    locked: false,
    groupId: null,
    ...box,
    rotation: 0,
    name,
    fill: '#ffffff',
  };
}

/** Build a pen object from absolute world points; stores them relative to their bounding box. */
export function makePen(
  worldPoints: readonly number[],
  z: string,
  stroke: string,
  size: number,
  opacity = 1,
): PenObject {
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
    opacity,
  };
}

export const cellKey = (rowId: string, colId: string): string => `${rowId}:${colId}`;

export const DEFAULT_COLUMN_WIDTH = 160;
export const DEFAULT_ROW_HEIGHT = 44;

export function makeTable(at: Vec, z: string, rows = 4, cols = 4): TableObject {
  const columns = Array.from({ length: cols }, () => ({ id: newId(), w: DEFAULT_COLUMN_WIDTH }));
  const rowList = Array.from({ length: rows }, () => ({ id: newId(), h: DEFAULT_ROW_HEIGHT }));
  const w = cols * DEFAULT_COLUMN_WIDTH;
  const h = rows * DEFAULT_ROW_HEIGHT;
  return {
    id: newId(),
    type: 'table',
    z,
    locked: false,
    groupId: null,
    x: at.x - w / 2,
    y: at.y - h / 2,
    w,
    h,
    rotation: 0,
    columns,
    rows: rowList,
    cells: {},
    headerRow: true,
    headerFill: '#e8ecff',
    fontSize: 14,
  };
}

export const CHART_PALETTE = [
  '#4262ff',
  '#2fbf71',
  '#ff9d48',
  '#e8318a',
  '#7048e8',
  '#0c8599',
  '#f5d128',
  '#e03131',
];

/** Sample data, so a new chart shows something meaningful until it's edited. */
export function makeChart(at: Vec, z: string, chartKind: ChartKind = 'bar'): ChartObject {
  const w = 480;
  const h = 320;
  const round = chartKind === 'pie' || chartKind === 'donut';
  return {
    id: newId(),
    type: 'chart',
    z,
    locked: false,
    groupId: null,
    x: at.x - w / 2,
    y: at.y - h / 2,
    w,
    h,
    rotation: 0,
    chartKind,
    title: 'Chart title',
    labels: round ? ['North', 'South', 'East', 'West'] : ['Q1', 'Q2', 'Q3', 'Q4'],
    series: round
      ? [{ name: 'Share', color: CHART_PALETTE[0]!, values: [40, 25, 20, 15] }]
      : [
          { name: 'This year', color: CHART_PALETTE[0]!, values: [30, 45, 38, 60] },
          { name: 'Last year', color: CHART_PALETTE[1]!, values: [22, 30, 35, 41] },
        ],
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

export const DOCUMENT_WIDTH = 480;

/** A document centered on `at`, shaped like its first page. */
export function makeDocument(at: Vec, z: string, title: string, pages: DocumentPage[]): DocumentObject {
  const first = pages[0]!;
  const w = DOCUMENT_WIDTH;
  const h = (first.h / first.w) * w;
  return {
    id: newId(),
    type: 'pdf',
    z,
    locked: false,
    groupId: null,
    x: at.x - w / 2,
    y: at.y - h / 2,
    w,
    h,
    rotation: 0,
    title: title.slice(0, 200),
    pages,
    page: 0,
  };
}

/** Where a page goes inside its document's box: as large as fits, and centered. Pages can differ in size. */
export function documentPageRect(o: Pick<DocumentObject, 'w' | 'h'>, page: DocumentPage) {
  const scale = Math.min(o.w / page.w, o.h / page.h);
  const w = page.w * scale;
  const h = page.h * scale;
  return { x: (o.w - w) / 2, y: (o.h - h) / 2, w, h };
}
