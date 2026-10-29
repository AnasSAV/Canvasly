import type {
  BoardObject,
  ConnectorObject,
  ImageObject,
  PenObject,
  ShapeObject,
  StickyObject,
  TextObject,
} from '@canvasly/shared';
import { memo, useMemo } from 'react';
import { Arrow, Ellipse, Group, Image as KImage, Line, Path, Rect, Text } from 'react-konva';
import { useAssetImage } from '../doc/assets';
import { useBoard } from '../doc/context';
import { freehandPath } from './freehand';
import { FONT_FAMILY, LINE_HEIGHT, SHAPE_PADDING, STICKY_PADDING, autoFontSize } from './text';

/** Common props for the root group of every box object; the id lets the Transformer find the node. */
function boxGroupProps(o: Exclude<BoardObject, ConnectorObject>) {
  return { id: o.id, name: 'object', x: o.x, y: o.y, rotation: o.rotation, listening: false };
}

interface DetailProps {
  editing: boolean;
  /** Zoomed far out: skip text and shadows, which are unreadable and the most expensive to draw. */
  lowDetail: boolean;
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

const TextNode = ({ o, editing }: { o: TextObject; editing: boolean }) => (
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
        fill={o.color}
        align={o.align}
        wrap="word"
        perfectDrawEnabled={false}
      />
    )}
  </Group>
);

const Shape = ({ o, editing, lowDetail }: { o: ShapeObject } & DetailProps) => {
  const fill = o.fill === 'transparent' ? undefined : o.fill;
  const stroke = o.stroke === 'transparent' ? undefined : o.stroke;
  const common = {
    fill,
    stroke,
    strokeWidth: o.strokeWidth,
    perfectDrawEnabled: false,
    strokeScaleEnabled: false,
  };
  const showText = !editing && !lowDetail && o.text;
  const fontSize = showText ? autoFontSize(o.text, o.w, o.h, SHAPE_PADDING) : 0;
  return (
    <Group {...boxGroupProps(o)}>
      {o.type === 'rect' && <Rect width={o.w} height={o.h} cornerRadius={4} {...common} />}
      {o.type === 'ellipse' && (
        <Ellipse x={o.w / 2} y={o.h / 2} radiusX={o.w / 2} radiusY={o.h / 2} {...common} />
      )}
      {o.type === 'triangle' && (
        <Line points={[o.w / 2, 0, o.w, o.h, 0, o.h]} closed lineJoin="round" {...common} />
      )}
      {showText && (
        <Text
          x={SHAPE_PADDING}
          y={o.type === 'triangle' ? o.h * 0.35 : SHAPE_PADDING}
          width={o.w - SHAPE_PADDING * 2}
          height={o.type === 'triangle' ? o.h * 0.65 - SHAPE_PADDING : o.h - SHAPE_PADDING * 2}
          text={o.text}
          fontSize={Math.min(fontSize, 28)}
          fontFamily={FONT_FAMILY}
          lineHeight={LINE_HEIGHT}
          fill={o.textColor}
          align="center"
          verticalAlign="middle"
          wrap="word"
          perfectDrawEnabled={false}
        />
      )}
    </Group>
  );
};

const Pen = ({ o }: { o: PenObject }) => {
  const data = useMemo(() => freehandPath(o.points, o.size), [o.points, o.size]);
  return (
    <Group {...boxGroupProps(o)}>
      <Rect width={o.w} height={o.h} fill="transparent" />
      <Path data={data} fill={o.stroke} perfectDrawEnabled={false} />
    </Group>
  );
};

const ImageNode = ({ o }: { o: ImageObject }) => {
  const img = useAssetImage(useBoard().id, o.assetId);
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

const samePoints = (a: number[], b: number[]) => a.length === b.length && a.every((v, i) => v === b[i]);

export const ConnectorNode = memo(
  function ConnectorNode({
    o,
    points,
  }: {
    o: Pick<ConnectorObject, 'id' | 'stroke' | 'strokeWidth' | 'startCap' | 'endCap'>;
    points: number[];
  }) {
    const props = {
      id: o.id,
      name: 'object',
      points,
      stroke: o.stroke,
      fill: o.stroke,
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
  (a, b) => a.o === b.o && samePoints(a.points, b.points),
);

/** Renders any non-connector object. Memoized on object identity, which DocStore preserves when unchanged. */
export const ObjectNode = memo(function ObjectNode({
  o,
  editing,
  lowDetail,
}: { o: Exclude<BoardObject, ConnectorObject> } & DetailProps) {
  switch (o.type) {
    case 'sticky':
      return <Sticky o={o} editing={editing} lowDetail={lowDetail} />;
    case 'text':
      return <TextNode o={o} editing={editing} />;
    case 'rect':
    case 'ellipse':
    case 'triangle':
      return <Shape o={o} editing={editing} lowDetail={lowDetail} />;
    case 'pen':
      return <Pen o={o} />;
    case 'image':
      return <ImageNode o={o} />;
  }
});
