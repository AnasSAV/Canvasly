import { expandRect, unionRects, type BoardObject, type Rect } from '@canvasly/shared';
import { useEffect, useRef } from 'react';
import { useBoard, useDocVersion } from '../doc/context';
import { usePrefs } from '../state/prefs';
import { useViewport } from '../state/viewport';
import { panel } from '../ui/IconButton';

const W = 200;
const H = 130;

function colorOf(o: BoardObject): string | null {
  switch (o.type) {
    case 'sticky':
      return o.color;
    case 'table':
    case 'chart':
      return '#c5d0ff';
    case 'pen':
      return o.stroke;
    case 'image':
    case 'pdf':
      return '#94a3b8';
    case 'text':
      return '#9ca3af';
    case 'frame':
      return '#e4e4e7';
    case 'connector':
      return null;
    default:
      return o.fill === 'transparent' || o.fill === '#ffffff' ? '#cbd5e1' : o.fill;
  }
}

/** Overview of the whole board; click or drag to move the viewport. Redrawn at most once per frame. */
export function Minimap() {
  const board = useBoard();
  const version = useDocVersion(board);
  const camera = useViewport((s) => s.camera);
  const width = useViewport((s) => s.width);
  const height = useViewport((s) => s.height);
  const show = usePrefs((s) => s.showMinimap);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mapping = useRef<{ world: Rect; scale: number; ox: number; oy: number } | null>(null);

  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);

      const view = useViewport.getState().visibleRect();
      const all = [...board.store.allBounds()].map(([, r]) => r);
      const world = expandRect(unionRects([...all, view])!, 100);
      const scale = Math.min(W / world.w, H / world.h);
      const ox = (W - world.w * scale) / 2 - world.x * scale;
      const oy = (H - world.h * scale) / 2 - world.y * scale;
      mapping.current = { world, scale, ox, oy };

      for (const o of board.store.getSorted()) {
        const color = colorOf(o);
        const r = board.store.getBounds(o.id);
        if (!color || !r) continue;
        ctx.fillStyle = color;
        ctx.fillRect(r.x * scale + ox, r.y * scale + oy, Math.max(1, r.w * scale), Math.max(1, r.h * scale));
      }
      ctx.strokeStyle = '#4f46e5';
      ctx.lineWidth = 1.5;
      ctx.fillStyle = 'rgba(79,70,229,0.08)';
      const vx = view.x * scale + ox;
      const vy = view.y * scale + oy;
      ctx.fillRect(vx, vy, view.w * scale, view.h * scale);
      ctx.strokeRect(vx, vy, view.w * scale, view.h * scale);
    });
    return () => cancelAnimationFrame(raf);
  }, [board, version, camera, width, height, show]);

  if (!show) return null;

  const moveTo = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const m = mapping.current;
    if (!m) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - r.left - m.ox) / m.scale;
    const y = (e.clientY - r.top - m.oy) / m.scale;
    useViewport.getState().centerOn({ x, y });
  };

  return (
    <div className={`${panel} absolute right-3 bottom-[72px] z-10 hidden overflow-hidden sm:block`}>
      <canvas
        ref={canvasRef}
        style={{ width: W, height: H }}
        className="block cursor-pointer"
        aria-label="Minimap"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          moveTo(e);
        }}
        onPointerMove={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) moveTo(e);
        }}
      />
    </div>
  );
}
