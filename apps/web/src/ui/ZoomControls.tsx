import { Maximize, Minus, Plus } from 'lucide-react';
import { useViewport } from '../state/viewport';
import { IconButton, panel } from './IconButton';

export function ZoomControls({ onFit }: { onFit: () => void }) {
  const zoom = useViewport((s) => s.camera.zoom);
  const { zoomStep, zoomTo } = useViewport.getState();
  return (
    <div className={`${panel} absolute bottom-3 left-3 z-10 hidden sm:flex items-center gap-0.5 p-1`}>
      <IconButton label="Zoom out (Ctrl -)" onClick={() => zoomStep(-1)}>
        <Minus size={16} />
      </IconButton>
      <button
        type="button"
        title="Reset to 100% (Shift 0)"
        onClick={() => zoomTo(1)}
        className="h-9 w-14 rounded-lg text-sm tabular-nums text-gray-700 hover:bg-gray-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
        data-testid="zoom-level"
      >
        {Math.round(zoom * 100)}%
      </button>
      <IconButton label="Zoom in (Ctrl +)" onClick={() => zoomStep(1)}>
        <Plus size={16} />
      </IconButton>
      <IconButton label="Zoom to fit (Shift 1)" onClick={onFit}>
        <Maximize size={16} />
      </IconButton>
    </div>
  );
}
