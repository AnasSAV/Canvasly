import { expandRect } from '@canvasly/shared';
import type Konva from 'konva';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Layer, Stage } from 'react-konva';
import { useBoard, useDocVersion } from '../doc/context';
import { useTheme } from '../state/theme';
import { useUI } from '../state/ui';
import { canvasColors } from './colors';
import { useViewport } from '../state/viewport';
import { GRID_SIZE, Interactions } from './interactions';
import { OverlayLayer } from './Overlay';
import { ConnectorNode, ObjectNode } from './shapes';
import { TextEditor } from './TextEditor';

const LOW_DETAIL_ZOOM = 0.25;

/** Dotted grid as a CSS background: costs nothing per frame. Spacing coarsens when zoomed out. */
function gridStyle(x: number, y: number, zoom: number, dark: boolean): React.CSSProperties {
  let size = GRID_SIZE * zoom;
  while (size < 12) size *= 5;
  const colors = canvasColors(dark);
  return {
    backgroundColor: colors.background,
    backgroundImage: `radial-gradient(circle, ${colors.grid} 1px, transparent 1.2px)`,
    backgroundSize: `${size}px ${size}px`,
    backgroundPosition: `${x - size / 2}px ${y - size / 2}px`,
  };
}

function useCursor(): string {
  const tool = useUI((s) => s.tool);
  const spacePan = useUI((s) => s.spacePan);
  const panning = useUI((s) => s.panning);
  if (panning) return 'grabbing';
  if (spacePan || tool === 'hand') return 'grab';
  if (tool === 'select') return 'default';
  if (tool === 'eraser') return 'none';
  return 'crosshair';
}

export function BoardCanvas({ onInteractions }: { onInteractions: (i: Interactions | null) => void }) {
  const board = useBoard();
  const version = useDocVersion(board);
  const containerRef = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState<Konva.Stage | null>(null);
  const { camera, width, height, setSize } = useViewport();
  const selectedIds = useUI((s) => s.selectedIds);
  const editingId = useUI((s) => s.editingId);
  const cursor = useCursor();
  const dark = useTheme((s) => s.dark);
  const lowDetail = camera.zoom < LOW_DETAIL_ZOOM;

  useEffect(() => {
    const el = containerRef.current!;
    const ro = new ResizeObserver(([entry]) => {
      const r = entry!.contentRect;
      setSize(Math.round(r.width), Math.round(r.height));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [setSize]);

  useEffect(() => {
    const interactions = new Interactions(board, containerRef.current!, () => stage);
    const detach = interactions.attach();
    onInteractions(interactions);
    return () => {
      detach();
      onInteractions(null);
    };
  }, [board, stage, onInteractions]);

  // Viewport culling: only objects whose bounds touch the (padded) visible rect are mounted.
  const visible = useMemo(() => {
    if (!width || !height) return [];
    const view = expandRect(
      {
        x: -camera.x / camera.zoom,
        y: -camera.y / camera.zoom,
        w: width / camera.zoom,
        h: height / camera.zoom,
      },
      200 / camera.zoom,
    );
    const ids = new Set(board.store.query(view));
    for (const id of selectedIds) ids.add(id);
    return board.store.getSorted().filter((o) => ids.has(o.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board, version, camera, width, height, selectedIds]);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 touch-none select-none overflow-hidden"
      style={{ ...gridStyle(camera.x, camera.y, camera.zoom, dark), cursor }}
      data-testid="board-canvas"
    >
      {width > 0 && (
        <Stage
          ref={setStage}
          width={width}
          height={height}
          x={camera.x}
          y={camera.y}
          scaleX={camera.zoom}
          scaleY={camera.zoom}
        >
          <Layer listening={false}>
            {visible.map((o) => {
              if (o.type !== 'connector')
                return (
                  <ObjectNode
                    key={o.id}
                    o={o}
                    editing={o.id === editingId}
                    lowDetail={lowDetail}
                    dark={dark}
                  />
                );
              const r = board.store.resolve(o);
              return r ? <ConnectorNode key={o.id} o={o} points={r.points} dark={dark} /> : null;
            })}
          </Layer>
          <OverlayLayer stage={stage} />
        </Stage>
      )}
      <TextEditor />
    </div>
  );
}
