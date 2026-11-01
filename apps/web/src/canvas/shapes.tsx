import { cellKey, shapeTextBox } from '@canvasly/shared';
import type {
  BoardObject,
  ChartObject,
  ConnectorObject,
  FrameObject,
  ImageObject,
  PenObject,
  ShapeObject,
  StickyObject,
  TableObject,
  TextObject,
} from '@canvasly/shared';
import type { Context } from 'konva/lib/Context';
import type { Shape as KonvaShape } from 'konva/lib/Shape';
import { memo, useMemo } from 'react';
import { Arrow, Group, Image as KImage, Line, Path, Rect, Shape as KShape, Text } from 'react-konva';
import { useAssetImage } from '../doc/assets';
import { useBoard } from '../doc/context';
import { useUI } from '../state/ui';
import { useViewport } from '../state/viewport';
import { canvasColors, ink, paper } from './colors';
import { freehandPath } from './freehand';
import { traceShape } from './shapePaths';
import { FONT_FAMILY, LINE_HEIGHT, SHAPE_PADDING, STICKY_PADDING, autoFontSize } from './text';
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
  const fontSize = showText ? autoFontSize(o.text, o.w, o.h, STICKY_PADDING) : 0;
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
          fontFamily={FONT_FAMILY}
          lineHeight={LINE_HEIGHT}
          fill="#1a1a1a"
          align="center"
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
    {!editing && (
      <Text
        width={o.w}
        text={o.text}
        fontSize={o.fontSize}
        fontFamily={FONT_FAMILY}
        lineHeight={LINE_HEIGHT}
        fill={ink(o.color, dark)}
        align={o.align}
        wrap="word"
        perfectDrawEnabled={false}
      />
    )}
  </Group>
);

const Shape = ({ o, editing, lowDetail, dark }: { o: ShapeObject } & DetailProps) => {
  const showText = !editing && !lowDetail && o.text;
  const box = shapeTextBox(o.type, o.w, o.h, SHAPE_PADDING);
  const fontSize = showText ? Math.min(autoFontSize(o.text, box.w, box.h, 0), 28) : 0;
  // Text on a light custom fill stays dark; on the default (or transparent) fill it follows the theme.
  const textColor =
    o.fill === 'transparent' || o.fill.toLowerCase() === '#ffffff' ? ink(o.textColor, dark) : o.textColor;
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
          traceShape(native(c), o.type, o.w, o.h);
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
          fontFamily={FONT_FAMILY}
          lineHeight={LINE_HEIGHT}
          fill={textColor}
          align="center"
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

export const ConnectorNode = memo(
  function ConnectorNode({
    o,
    points,
    dark = false,
  }: {
    o: Pick<ConnectorObject, 'id' | 'stroke' | 'strokeWidth' | 'startCap' | 'endCap'>;
    points: number[];
    dark?: boolean;
  }) {
    const color = ink(o.stroke, dark);
    const props = {
      id: o.id,
      name: 'object',
      points,
      stroke: color,
      fill: color,
      strokeWidth: o.strokeWidth,
      lineCap: 'round' as const,
      lineJoin: 'round' as const,
      listening: false,
      perfectDrawEnabled: false,
    };
    if (o.startCap === 'none' && o.endCap === 'none') return <Line {...props} />;
    return (
      <Arrow
        {...props}
        pointerAtBeginning={o.startCap === 'arrow'}
        pointerAtEnding={o.endCap === 'arrow'}
        pointerLength={6 + o.strokeWidth * 3}
        pointerWidth={6 + o.strokeWidth * 3}
      />
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
