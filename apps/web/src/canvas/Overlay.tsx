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
import { Circle, Layer, Line, Path, Rect, Shape, Transformer } from 'react-konva';
import { useBoard, useDocVersion } from '../doc/context';
import { usePeers } from '../hooks/usePresence';
import { usePrefs } from '../state/prefs';
import { useUI } from '../state/ui';
import { useViewport } from '../state/viewport';
import { freehandPath } from './freehand';
import { traceShape } from './shapePaths';
import { MAX_FONT_SIZE, textBox } from './text';
import { ConnectorNode } from './shapes';

const ACCENT = '#4262ff';
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
  const readOnly = useUI((s) => s.readOnly);
  const anyLocked = boxes.some((o) => o.locked) || readOnly;
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

  /** Publish the live size while dragging handles, for "Show object size". */
  const onTransform = () => {
    const tr = trRef.current;
    const node = tr?.nodes()[0];
    const o = node && board.store.get(node.id());
    if (!tr || !node || !o || !isBoxObject(o) || tr.nodes().length !== 1) return;
    const r = tr.getClientRect();
    useUI.getState().setLiveSize({
      w: o.w * node.scaleX(),
      h: o.h * node.scaleY(),
      x: r.x + r.width / 2,
      y: r.y + r.height,
    });
  };

  /** "Suggest object size": while resizing, lock onto the size of another object of the same kind. */
  const suggestSize = (box: { x: number; y: number; width: number; height: number; rotation: number }) => {
    if (!single || !usePrefs.getState().suggestObjectSize || single.rotation !== 0 || keepRatio) return box;
    const zoom = useViewport.getState().camera.zoom;
    const anchor = trRef.current?.getActiveAnchor() ?? '';
    const next = { ...box };
    for (const o of board.store.all()) {
      if (o.id === single.id || o.type !== single.type || !isBoxObject(o)) continue;
      const w = o.w * zoom;
      const h = o.h * zoom;
      if (Math.abs(next.width - w) < 5 && next.width !== w) {
        if (anchor.includes('left')) next.x -= w - next.width;
        next.width = w;
      }
      if (Math.abs(next.height - h) < 5 && next.height !== h) {
        if (anchor.includes('top')) next.y -= h - next.height;
        next.height = h;
      }
    }
    return next;
  };

  const onTransformEnd = () => {
    const tr = trRef.current;
    useUI.getState().setLiveSize(null);
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
        if (o.type === 'table') {
          p.columns = o.columns.map((c) => ({ ...c, w: round(c.w * sx) }));
          p.rows = o.rows.map((r) => ({ ...r, h: round(r.h * sy) }));
        }
        if (o.type === 'text') {
          const sideDrag = anchorRef.current === 'middle-left' || anchorRef.current === 'middle-right';
          const fontSize = sideDrag
            ? o.fontSize
            : Math.min(MAX_FONT_SIZE, Math.max(4, Math.round(o.fontSize * sy)));
          const autoWidth = o.autoWidth && !sideDrag;
          const box = textBox({ ...o, w: p.w!, fontSize, autoWidth });
          p.fontSize = fontSize;
          p.autoWidth = autoWidth;
          p.w = round(box.w);
          p.h = round(box.h);
        }
        patchObject(board.objects, o.id, p);
      }
    });
    board.endGesture();
    useUI.getState().setInteracting(false);
  };

  const textOnly = single?.type === 'text';
  const keepRatio = single?.type === 'sticky' || single?.type === 'image' || textOnly;
  return (
    <Transformer
      ref={trRef}
      visible={boxes.length > 0}
      rotateEnabled={!anyLocked}
      resizeEnabled={!anyLocked}
      keepRatio={keepRatio}
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
        Math.abs(newBox.width) < 8 || Math.abs(newBox.height) < 8 ? oldBox : suggestSize(newBox)
      }
      onTransform={onTransform}
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
        !useUI.getState().readOnly &&
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
      const { shape } = draft;
      if (shape === 'frame' || shape === 'startview')
        return <Rect x={x} y={y} width={w} height={h} {...common} />;
      return (
        <Shape
          x={x}
          y={y}
          width={w}
          height={h}
          {...common}
          sceneFunc={(c, s) => {
            c.beginPath();
            traceShape((c as unknown as { _context: CanvasRenderingContext2D })._context, shape, w, h);
            c.fillStrokeShape(s);
          }}
        />
      );
    }
    case 'pen':
      return (
        <Path
          data={freehandPath(draft.points, draft.size)}
          fill={draft.color}
          opacity={draft.opacity}
          listening={false}
        />
      );
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
    case 'lasso':
      return (
        <Line
          points={draft.points}
          closed
          stroke={ACCENT}
          strokeWidth={1.5 / zoom}
          dash={[6 / zoom, 4 / zoom]}
          fill="rgba(66,98,255,0.08)"
          listening={false}
        />
      );
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

/** Outline what's under the pointer in the layers panel, so that a row can be matched to its object. */
function LayerHover({ zoom }: { zoom: number }) {
  const board = useBoard();
  const ids = useUI((s) => s.layerHover);
  return (
    <>
      {ids.map((id) => {
        const o = board.store.get(id);
        if (!o) return null;
        const points =
          o.type === 'connector' ? board.store.resolve(o)?.points : corners(o).flatMap((c) => [c.x, c.y]);
        if (!points) return null;
        return (
          <Line
            key={id}
            points={points}
            closed={o.type !== 'connector'}
            stroke={ACCENT}
            strokeWidth={1.5 / zoom}
            listening={false}
          />
        );
      })}
    </>
  );
}

/** Outline what other people have selected, in their color. */
function RemoteSelections({ zoom }: { zoom: number }) {
  const board = useBoard();
  useDocVersion(board);
  const peers = usePeers(board);
  return (
    <>
      {peers.flatMap((p) =>
        p.selection.map((id) => {
          const o = board.store.get(id);
          if (!o) return null;
          const key = `${p.clientId}-${id}`;
          if (o.type === 'connector') {
            const r = board.store.resolve(o);
            if (!r) return null;
            const width = o.strokeWidth + 4 / zoom;
            return (
              <Line
                key={key}
                points={r.points}
                stroke={p.user.color}
                strokeWidth={width}
                opacity={0.5}
                listening={false}
              />
            );
          }
          return (
            <Line
              key={key}
              points={corners(o).flatMap((c) => [c.x, c.y])}
              closed
              stroke={p.user.color}
              strokeWidth={2 / zoom}
              dash={[6 / zoom, 3 / zoom]}
              listening={false}
            />
          );
        }),
      )}
    </>
  );
}

export function OverlayLayer({ stage }: { stage: Konva.Stage | null }) {
  const zoom = useViewport((s) => s.camera.zoom);
  const marquee = useUI((s) => s.marquee);
  const guides = useUI((s) => s.guides);
  return (
    <Layer>
      <RemoteSelections zoom={zoom} />
      <ConnectorSelection zoom={zoom} />
      <SelectionTransformer stage={stage} />
      <AttachHighlight zoom={zoom} />
      <LayerHover zoom={zoom} />
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
