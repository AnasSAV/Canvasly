import { cellKey, documentPageRect, shapeTextBox } from '@canvasly/shared';
import type {
  BoardObject,
  ChartObject,
  ConnectorObject,
  DocumentObject,
  FrameObject,
  ImageObject,
  PenObject,
  ShapeObject,
  StickyObject,
  TableObject,
  TextObject,
  Vec,
} from '@canvasly/shared';
import type { Context } from 'konva/lib/Context';
import type { Shape as KonvaShape } from 'konva/lib/Shape';
import { memo, useEffect, useMemo } from 'react';
import { Group, Image as KImage, Path, Rect, Shape as KShape, Text } from 'react-konva';
import { assetUrl, loadImage, useAssetImage, useDocumentPage } from '../doc/assets';
import { useBoard } from '../doc/context';
import { useUI } from '../state/ui';
import { useViewport } from '../state/viewport';
import { canvasColors, ink, isPaper, paper } from './colors';
import { freehandPath } from './freehand';
import { drawLine } from './lineDraw';
import { traceShape } from './shapePaths';
import {
  FONTS,
  FONT_FAMILY,
  LINE_HEIGHT,
  SHAPE_PADDING,
  STICKY_PADDING,
  TEXT_BACKGROUND_PADDING,
  autoFontSize,
  fontStyle,
  measureText,
  shapeFontSize,
  textDecoration,
  textLineRects,
} from './text';
import { drawChart, drawTable } from './widgets';

/** Konva's context wrapper around the native 2D context, for drawing code shared with exports. */
const native = (c: Context) => (c as unknown as { _context: CanvasRenderingContext2D })._context;

/** Common props for the root group of every box object; the id lets the Transformer find the node. */
function boxGroupProps(o: Exclude<BoardObject, ConnectorObject>) {
  return { id: o.id, name: 'object', x: o.x, y: o.y, rotation: o.rotation, listening: false };
}

interface DetailProps {
  editing: boolean;
  /** Zoomed far out: skip text and shadows, which are unreadable and the most expensive to draw. */
  lowDetail: boolean;
  dark: boolean;
}

const Sticky = ({ o, editing, lowDetail }: { o: StickyObject } & DetailProps) => {
  const showText = !editing && !lowDetail && o.text;
  const fontSize = showText ? autoFontSize(o.text, o.w, o.h, STICKY_PADDING, o) : 0;
  return (
    <Group {...boxGroupProps(o)}>
      {!lowDetail && (
        <Rect
          x={2}
          y={4}
          width={o.w}
          height={o.h}
          fill="rgba(0,0,0,0.08)"
          cornerRadius={3}
          perfectDrawEnabled={false}
        />
      )}
      <Rect width={o.w} height={o.h} fill={o.color} cornerRadius={3} perfectDrawEnabled={false} />
      {showText && (
        <Text
          x={STICKY_PADDING}
          y={STICKY_PADDING}
          width={o.w - STICKY_PADDING * 2}
          height={o.h - STICKY_PADDING * 2}
          text={o.text}
          fontSize={fontSize}
          fontFamily={FONTS[o.font].family}
          fontStyle={fontStyle(o)}
          textDecoration={textDecoration(o)}
          lineHeight={LINE_HEIGHT}
          fill="#1a1a1a"
          align={o.align}
          verticalAlign="middle"
          wrap="word"
          perfectDrawEnabled={false}
        />
      )}
    </Group>
  );
};

const TextNode = ({ o, editing, dark }: { o: TextObject } & DetailProps) => (
  <Group {...boxGroupProps(o)}>
    {/* Invisible box keeps the group's client rect stable for the Transformer. */}
    <Rect width={o.w} height={o.h} fill="transparent" />
    {o.background !== 'transparent' && (
      <Rect
        x={-TEXT_BACKGROUND_PADDING}
        y={-TEXT_BACKGROUND_PADDING}
        width={o.w + TEXT_BACKGROUND_PADDING * 2}
        height={o.h + TEXT_BACKGROUND_PADDING * 2}
        cornerRadius={3}
        fill={paper(o.background, dark)}
        perfectDrawEnabled={false}
      />
    )}
    {!editing &&
      o.highlight !== 'transparent' &&
      textLineRects(o).map(
        (r, i) =>
          !r.empty && (
            <Rect
              key={i}
              x={r.x}
              y={r.y}
              width={r.w}
              height={r.h}
              fill={o.highlight}
              perfectDrawEnabled={false}
            />
          ),
      )}
    {!editing && (
      <Text
        {...(o.autoWidth ? { wrap: 'none' } : { width: o.w, wrap: 'word' })}
        text={o.text}
        fontSize={o.fontSize}
        fontFamily={FONTS[o.font].family}
        fontStyle={fontStyle(o)}
        textDecoration={textDecoration(o)}
        lineHeight={LINE_HEIGHT}
        fill={ink(o.color, dark)}
        align={o.align}
        perfectDrawEnabled={false}
      />
    )}
  </Group>
);

const Shape = ({ o, editing, lowDetail, dark }: { o: ShapeObject } & DetailProps) => {
  const showText = !editing && !lowDetail && o.text;
  const box = shapeTextBox(o.type, o.w, o.h, SHAPE_PADDING);
  const fontSize = showText ? shapeFontSize(o.text, box, o, o) : 0;
  // Text on a light custom fill stays dark; on a plain (or transparent) fill it follows the theme.
  const textColor = o.fill === 'transparent' || isPaper(o.fill) ? ink(o.textColor, dark) : o.textColor;
  return (
    <Group {...boxGroupProps(o)}>
      <KShape
        width={o.w}
        height={o.h}
        fill={o.fill === 'transparent' ? undefined : paper(o.fill, dark)}
        stroke={o.stroke === 'transparent' ? undefined : ink(o.stroke, dark)}
        strokeWidth={o.strokeWidth}
        strokeScaleEnabled={false}
        perfectDrawEnabled={false}
        sceneFunc={(c: Context, shape: KonvaShape) => {
          c.beginPath();
          traceShape(native(c), o.type, o.w, o.h, o.cornerRadius);
          c.fillStrokeShape(shape);
        }}
      />
      {showText && (
        <Text
          x={box.x}
          y={box.y}
          width={box.w}
          height={box.h}
          text={o.text}
          fontSize={fontSize}
          fontFamily={FONTS[o.font].family}
          fontStyle={fontStyle(o)}
          textDecoration={textDecoration(o)}
          lineHeight={LINE_HEIGHT}
          fill={textColor}
          align={o.align}
          verticalAlign="middle"
          wrap="word"
          perfectDrawEnabled={false}
        />
      )}
    </Group>
  );
};

const Pen = ({ o, dark }: { o: PenObject } & DetailProps) => {
  const data = useMemo(() => freehandPath(o.points, o.size), [o.points, o.size]);
  return (
    <Group {...boxGroupProps(o)}>
      <Rect width={o.w} height={o.h} fill="transparent" />
      <Path data={data} fill={ink(o.stroke, dark)} opacity={o.opacity} perfectDrawEnabled={false} />
    </Group>
  );
};

const DocumentNode = ({ o }: { o: DocumentObject }) => {
  const board = useBoard();
  const shown = useDocumentPage(o);
  const page = o.pages[shown]!;
  const img = useAssetImage(board.assetBase, page.assetId);
  // Turning pages is instant if the next one is already here.
  const next = o.pages[shown + 1]?.assetId;
  useEffect(() => {
    if (next) void loadImage(assetUrl(board.assetBase, next));
  }, [board.assetBase, next]);
  const r = documentPageRect(o, page);
  return (
    <Group {...boxGroupProps(o)}>
      <Rect
        x={2}
        y={4}
        width={o.w}
        height={o.h}
        fill="rgba(0,0,0,0.1)"
        cornerRadius={2}
        perfectDrawEnabled={false}
      />
      <Rect width={o.w} height={o.h} fill="#ffffff" perfectDrawEnabled={false} />
      {img && <KImage image={img} x={r.x} y={r.y} width={r.w} height={r.h} perfectDrawEnabled={false} />}
    </Group>
  );
};

const ImageNode = ({ o }: { o: ImageObject }) => {
  const img = useAssetImage(useBoard().assetBase, o.assetId);
  return (
    <Group {...boxGroupProps(o)}>
      {img ? (
        <KImage image={img} width={o.w} height={o.h} perfectDrawEnabled={false} />
      ) : (
        <Rect
          width={o.w}
          height={o.h}
          fill="#e5e7eb"
          stroke="#d1d5db"
          strokeWidth={1}
          strokeScaleEnabled={false}
        />
      )}
    </Group>
  );
};

const TableNode = ({ o, lowDetail, dark }: { o: TableObject } & DetailProps) => {
  const editing = useUI((s) => (s.editingCell?.id === o.id ? s.editingCell : null));
  const hideCell = editing ? cellKey(editing.rowId, editing.colId) : null;
  return (
    <Group {...boxGroupProps(o)}>
      <KShape
        width={o.w}
        height={o.h}
        perfectDrawEnabled={false}
        sceneFunc={(c: Context) => drawTable(native(c), o, { dark, lowDetail, hideCell })}
      />
    </Group>
  );
};

const ChartNode = ({ o, dark }: { o: ChartObject } & DetailProps) => (
  <Group {...boxGroupProps(o)}>
    <KShape
      width={o.w}
      height={o.h}
      perfectDrawEnabled={false}
      sceneFunc={(c: Context) => drawChart(native(c), o, { dark })}
    />
  </Group>
);

/**
 * Frame background + border. The title is a sibling (not inside the group) so it doesn't count toward
 * the Transformer's box, and it keeps a constant on-screen size whatever the zoom.
 */
const Frame = ({ o, dark }: { o: FrameObject } & DetailProps) => {
  const zoom = useViewport((s) => s.camera.zoom);
  const colors = canvasColors(dark);
  const fs = 13 / zoom;
  return (
    <>
      <Text
        x={o.x}
        y={o.y - fs * 1.6}
        rotation={o.rotation}
        width={Math.max(o.w, 1)}
        text={o.name || 'Frame'}
        fontSize={fs}
        fontFamily={FONT_FAMILY}
        fontStyle="500"
        fill={colors.frameTitle}
        wrap="none"
        ellipsis
        listening={false}
        perfectDrawEnabled={false}
      />
      <Group {...boxGroupProps(o)}>
        <Rect
          width={o.w}
          height={o.h}
          fill={o.fill === 'transparent' ? undefined : paper(o.fill, dark)}
          stroke={colors.frameBorder}
          strokeWidth={1}
          strokeScaleEnabled={false}
          perfectDrawEnabled={false}
        />
      </Group>
    </>
  );
};

const samePoints = (a: number[], b: number[]) => a.length === b.length && a.every((v, i) => v === b[i]);

/** A line's label, on a patch of the background so that the line doesn't run through the words. */
export const LINE_LABEL_SIZE = 16;

export const ConnectorNode = memo(
  function ConnectorNode({
    o,
    points,
    mid,
    dark = false,
  }: {
    o: Pick<ConnectorObject, 'id' | 'stroke' | 'strokeWidth' | 'startCap' | 'endCap' | 'dash' | 'label'>;
    points: number[];
    mid: Vec;
    dark?: boolean;
  }) {
    const color = ink(o.stroke, dark);
    const label = o.label.trim();
    const labelW = label ? measureText(label, LINE_LABEL_SIZE) + 12 : 0;
    const labelH = LINE_LABEL_SIZE * LINE_HEIGHT + 4;
    return (
      <>
        <KShape
          id={o.id}
          name="object"
          listening={false}
          perfectDrawEnabled={false}
          sceneFunc={(c: Context) => {
            drawLine(native(c), points, {
              color,
              width: o.strokeWidth,
              dash: o.dash,
              startCap: o.startCap,
              endCap: o.endCap,
            });
          }}
        />
        {label && (
          <>
            <Rect
              x={mid.x - labelW / 2}
              y={mid.y - labelH / 2}
              width={labelW}
              height={labelH}
              cornerRadius={3}
              fill={canvasColors(dark).background}
              listening={false}
              perfectDrawEnabled={false}
            />
            <Text
              x={mid.x - labelW / 2}
              y={mid.y - labelH / 2 + 2}
              width={labelW}
              text={label}
              fontSize={LINE_LABEL_SIZE}
              fontFamily={FONT_FAMILY}
              lineHeight={LINE_HEIGHT}
              fill={color}
              align="center"
              wrap="none"
              listening={false}
              perfectDrawEnabled={false}
            />
          </>
        )}
      </>
    );
  },
  (a, b) => a.o === b.o && a.dark === b.dark && samePoints(a.points, b.points),
);

/** Renders any non-connector object. Memoized on object identity, which DocStore preserves when unchanged. */
export const ObjectNode = memo(function ObjectNode(
  props: { o: Exclude<BoardObject, ConnectorObject> } & DetailProps,
) {
  const { o } = props;
  switch (o.type) {
    case 'sticky':
      return <Sticky {...props} o={o} />;
    case 'text':
      return <TextNode {...props} o={o} />;
    case 'pen':
      return <Pen {...props} o={o} />;
    case 'image':
      return <ImageNode o={o} />;
    case 'pdf':
      return <DocumentNode o={o} />;
    case 'frame':
      return <Frame {...props} o={o} />;
    case 'table':
      return <TableNode {...props} o={o} />;
    case 'chart':
      return <ChartNode {...props} o={o} />;
    default:
      return <Shape {...props} o={o} />;
  }
});
