import {
  SIDE_ANCHORS,
  anchorToWorld,
  corners,
  isBoxObject,
  patchObject,
  type BoardObject,
  type ObjectPatch,
} from '@canvasly/shared';
import type Konva from 'konva';
import { useEffect, useMemo, useRef } from 'react';
import { Circle, Ellipse, Layer, Line, Path, Rect, Transformer } from 'react-konva';
import { useBoard, useDocVersion } from '../doc/context';
import { useUI } from '../state/ui';
import { useViewport } from '../state/viewport';
import { freehandPath } from './freehand';
import { textHeight } from './text';
import { ConnectorNode } from './shapes';

const ACCENT = '#4f46e5';
/** Strip float noise from transform results to keep documents small and diffs clean. */
const round = (v: number) => Math.round(v * 100) / 100;
/** Kept small so the floating selection toolbar can sit above the rotate handle. */
export const ROTATE_ANCHOR_OFFSET = 26;

function SelectionTransformer({ stage }: { stage: Konva.Stage | null }) {
  const board = useBoard();
  const version = useDocVersion(board);
  const selectedIds = useUI((s) => s.selectedIds);
  const editingId = useUI((s) => s.editingId);
  const trRef = useRef<Konva.Transformer>(null);

  const boxes = useMemo(
    () => selectedIds.map((id) => board.store.get(id)).filter((o) => o !== undefined && isBoxObject(o)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedIds, version, board],
  );
  const anyLocked = boxes.some((o) => o.locked);
  const single = boxes.length === 1 ? boxes[0]! : null;

  useEffect(() => {
    const tr = trRef.current;
    if (!tr || !stage) return;
    const ids = new Set(boxes.filter((o) => o.id !== editingId).map((o) => o.id));
    const nodes = stage.find((n: Konva.Node) => n.hasName('object') && ids.has(n.id()));
    tr.nodes(nodes);
    tr.getLayer()?.batchDraw();
  });

  /** Anchor being dragged; corner drags on text scale the font, side drags only rewrap. */
  const anchorRef = useRef<string | null>(null);

  const onTransformStart = () => {
    anchorRef.current = trRef.current?.getActiveAnchor() ?? null;
    board.beginGesture();
    useUI.getState().setInteracting(true);
  };

  const onTransformEnd = () => {
    const tr = trRef.current;
    if (!tr) return;
    board.transact(() => {
      for (const node of tr.nodes()) {
        const o = board.store.get(node.id());
        if (!o || !isBoxObject(o)) continue;
        const sx = node.scaleX();
        const sy = node.scaleY();
        node.scale({ x: 1, y: 1 });
        const p: ObjectPatch = {
          x: round(node.x()),
          y: round(node.y()),
          rotation: round(node.rotation()),
          w: round(Math.max(4, o.w * sx)),
          h: round(Math.max(4, o.h * sy)),
        };
        if (o.type === 'pen') p.points = o.points.map((v, i) => round(i % 2 === 0 ? v * sx : v * sy));
        if (o.type === 'text') {
          const sideDrag = anchorRef.current === 'middle-left' || anchorRef.current === 'middle-right';
          const fontSize = sideDrag ? o.fontSize : Math.min(400, Math.max(4, round(o.fontSize * sy)));
          p.fontSize = fontSize;
          p.h = round(textHeight(o.text, p.w!, fontSize));
        }
        patchObject(board.objects, o.id, p);
      }
    });
    board.endGesture();
    useUI.getState().setInteracting(false);
  };

  const textOnly = single?.type === 'text';
  return (
    <Transformer
      ref={trRef}
      visible={boxes.length > 0}
      rotateEnabled={!anyLocked}
      resizeEnabled={!anyLocked}
      keepRatio={single?.type === 'sticky' || single?.type === 'image' || textOnly}
      enabledAnchors={
        textOnly
          ? ['top-left', 'top-right', 'middle-left', 'middle-right', 'bottom-left', 'bottom-right']
          : [
              'top-left',
              'top-center',
              'top-right',
              'middle-right',
              'middle-left',
              'bottom-left',
              'bottom-center',
              'bottom-right',
            ]
      }
      rotationSnaps={[0, 45, 90, 135, 180, 225, 270, 315]}
      rotationSnapTolerance={4}
      ignoreStroke
      flipEnabled={false}
      borderStroke={anyLocked ? '#9ca3af' : ACCENT}
      borderDash={anyLocked ? [4, 4] : undefined}
      anchorStroke={ACCENT}
      anchorFill="#fff"
      anchorSize={9}
      anchorCornerRadius={2}
      rotateAnchorOffset={ROTATE_ANCHOR_OFFSET}
      padding={2}
      boundBoxFunc={(oldBox, newBox) =>
        Math.abs(newBox.width) < 8 || Math.abs(newBox.height) < 8 ? oldBox : newBox
      }
      onTransformStart={onTransformStart}
      onTransformEnd={onTransformEnd}
    />
  );
}

/** Highlight + draggable end handles for selected connectors; outlines for multi-selected non-box items. */
function ConnectorSelection({ zoom }: { zoom: number }) {
  const board = useBoard();
  useDocVersion(board);
  const selectedIds = useUI((s) => s.selectedIds);
  const conns = selectedIds
    .map((id) => board.store.get(id))
    .filter((o): o is Extract<BoardObject, { type: 'connector' }> => o?.type === 'connector');
  return (
    <>
      {conns.map((c) => {
        const r = board.store.resolve(c);
        if (!r) return null;
        return (
          <Line
            key={`hl-${c.id}`}
            points={r.points}
            stroke={ACCENT}
            strokeWidth={c.strokeWidth + 4 / zoom}
            opacity={0.35}
            lineCap="round"
            lineJoin="round"
            listening={false}
          />
        );
      })}
      {conns.length === 1 &&
        !conns[0]!.locked &&
        (['start', 'end'] as const).map((which) => {
          const c = conns[0]!;
          const r = board.store.resolve(c);
          if (!r) return null;
          const p = r[which];
          return (
            <Circle
              key={which}
              x={p.x}
              y={p.y}
              radius={6 / zoom}
              fill="#fff"
              stroke={ACCENT}
              strokeWidth={2 / zoom}
              hitStrokeWidth={12 / zoom}
              connectorHandle={{ id: c.id, which }}
            />
          );
        })}
    </>
  );
}

/** Outline + side anchors of the shape a connector would attach to. */
function AttachHighlight({ zoom }: { zoom: number }) {
  const board = useBoard();
  const id = useUI((s) => s.attachHoverId);
  const o = id ? board.store.get(id) : undefined;
  if (!o || !isBoxObject(o)) return null;
  return (
    <>
      <Line
        points={corners(o).flatMap((c) => [c.x, c.y])}
        closed
        stroke={ACCENT}
        strokeWidth={1.5 / zoom}
        listening={false}
      />
      {SIDE_ANCHORS.map((a) => {
        const p = anchorToWorld(o, a);
        return (
          <Circle
            key={a.join()}
            x={p.x}
            y={p.y}
            radius={4 / zoom}
            fill="#fff"
            stroke={ACCENT}
            strokeWidth={1.5 / zoom}
            listening={false}
          />
        );
      })}
    </>
  );
}

function Draft({ zoom }: { zoom: number }) {
  const board = useBoard();
  const draft = useUI((s) => s.draft);
  const penColor = useUI((s) => s.penColor);
  const penSize = useUI((s) => s.penSize);
  if (!draft) return null;
  switch (draft.kind) {
    case 'shape': {
      const { x, y, w, h } = draft.rect;
      const common = {
        stroke: ACCENT,
        strokeWidth: 1.5 / zoom,
        dash: [6 / zoom, 4 / zoom],
        listening: false,
      };
      if (draft.shape === 'ellipse')
        return <Ellipse x={x + w / 2} y={y + h / 2} radiusX={w / 2} radiusY={h / 2} {...common} />;
      if (draft.shape === 'triangle')
        return <Line points={[x + w / 2, y, x + w, y + h, x, y + h]} closed {...common} />;
      return <Rect x={x} y={y} width={w} height={h} {...common} />;
    }
    case 'pen':
      return <Path data={freehandPath(draft.points, penSize)} fill={penColor} listening={false} />;
    case 'connector': {
      const r = board.store.resolve({ start: draft.start, end: draft.end, routing: 'straight' });
      if (!r) return null;
      return (
        <ConnectorNode
          o={{
            id: 'draft',
            stroke: ACCENT,
            strokeWidth: 2,
            startCap: 'none',
            endCap: draft.arrow ? 'arrow' : 'none',
          }}
          points={r.points}
        />
      );
    }
    case 'eraser':
      return (
        <Circle
          x={draft.x}
          y={draft.y}
          radius={draft.r}
          stroke="#6b7280"
          strokeWidth={1 / zoom}
          fill="rgba(255,255,255,0.4)"
          listening={false}
        />
      );
  }
}

export function OverlayLayer({ stage }: { stage: Konva.Stage | null }) {
  const zoom = useViewport((s) => s.camera.zoom);
  const marquee = useUI((s) => s.marquee);
  const guides = useUI((s) => s.guides);
  return (
    <Layer>
      <ConnectorSelection zoom={zoom} />
      <SelectionTransformer stage={stage} />
      <AttachHighlight zoom={zoom} />
      <Draft zoom={zoom} />
      {guides.map((g, i) => (
        <Line
          key={i}
          points={g.orientation === 'v' ? [g.pos, g.from, g.pos, g.to] : [g.from, g.pos, g.to, g.pos]}
          stroke="#e8318a"
          strokeWidth={1 / zoom}
          listening={false}
        />
      ))}
      {marquee && (
        <Rect
          x={marquee.x}
          y={marquee.y}
          width={marquee.w}
          height={marquee.h}
          fill="rgba(79,70,229,0.08)"
          stroke={ACCENT}
          strokeWidth={1 / zoom}
          listening={false}
        />
      )}
    </Layer>
  );
}
