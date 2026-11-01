import { CircleQuestionMark, Map as MapIcon, Maximize, Minus, Plus } from 'lucide-react';
import { usePrefs } from '../state/prefs';
import { useUI } from '../state/ui';
import { useViewport } from '../state/viewport';
import { IconButton, panel } from './IconButton';

/** Bottom-right controls: minimap, fit, zoom level and help. */
export function ZoomControls({ onFit }: { onFit: () => void }) {
  const zoom = useViewport((s) => s.camera.zoom);
  const { zoomStep, zoomTo } = useViewport.getState();
  const minimap = usePrefs((s) => s.showMinimap);
  return (
    <div className={`${panel} absolute right-3 bottom-3 z-10 hidden h-12 items-center gap-0.5 px-1 sm:flex`}>
      <IconButton label="Minimap" active={minimap} onClick={() => usePrefs.getState().toggle('showMinimap')}>
        <MapIcon size={18} />
      </IconButton>
      <IconButton label="Zoom to fit (Shift 1)" onClick={onFit}>
        <Maximize size={18} />
      </IconButton>
      <IconButton label="Zoom out (Ctrl -)" onClick={() => zoomStep(-1)}>
        <Minus size={18} />
      </IconButton>
      <button
        type="button"
        title="Reset to 100% (Shift 0)"
        onClick={() => zoomTo(1)}
        className="h-10 w-14 rounded-lg text-sm tabular-nums hover:bg-gray-100 dark:hover:bg-zinc-800"
        data-testid="zoom-level"
      >
        {Math.round(zoom * 100)}%
      </button>
      <IconButton label="Zoom in (Ctrl +)" onClick={() => zoomStep(1)}>
        <Plus size={18} />
      </IconButton>
      <IconButton
        label="Keyboard shortcuts (?)"
        onClick={() => useUI.getState().setShortcutsOpen(true)}
        data-testid="help"
      >
        <CircleQuestionMark size={18} />
      </IconButton>
    </div>
  );
}
