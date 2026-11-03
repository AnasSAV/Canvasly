import { CircleQuestionMark, Map as MapIcon, Maximize, Minus, Plus } from 'lucide-react';
import { usePrefs } from '../state/prefs';
import { useUI } from '../state/ui';
import { useViewport } from '../state/viewport';
import { IconButton } from './IconButton';

/** Bottom-right controls: minimap, fit, zoom level and help. */
export function ZoomControls({ onFit }: { onFit: () => void }) {
  const zoom = useViewport((s) => s.camera.zoom);
  const { zoomStep, zoomTo } = useViewport.getState();
  const minimap = usePrefs((s) => s.showMinimap);
  return (
    <div
      className="panel absolute right-3 bottom-3 z-10 hidden h-11 items-center gap-px px-1 sm:flex"
      data-tip-side="top"
    >
      <IconButton label="Minimap" active={minimap} onClick={() => usePrefs.getState().toggle('showMinimap')}>
        <MapIcon size={17} />
      </IconButton>
      <IconButton label="Zoom to fit (Shift 1)" onClick={onFit}>
        <Maximize size={17} />
      </IconButton>
      <span className="mx-0.5 h-5 w-px bg-line" />
      <IconButton label="Zoom out (Ctrl -)" onClick={() => zoomStep(-1)}>
        <Minus size={17} />
      </IconButton>
      <button
        type="button"
        data-tip="Reset to 100% (Shift 0)"
        onClick={() => zoomTo(1)}
        className="num h-9 w-13 rounded-[7px] text-xs hover:bg-hover"
        data-testid="zoom-level"
      >
        {Math.round(zoom * 100)}%
      </button>
      <IconButton label="Zoom in (Ctrl +)" onClick={() => zoomStep(1)}>
        <Plus size={17} />
      </IconButton>
      <span className="mx-0.5 h-5 w-px bg-line" />
      <IconButton
        label="Keyboard shortcuts (?)"
        onClick={() => useUI.getState().setShortcutsOpen(true)}
        data-testid="help"
      >
        <CircleQuestionMark size={17} />
      </IconButton>
    </div>
  );
}
