import { STICKY_COLORS, STROKE_COLORS } from '@canvasly/shared';
import {
  Circle,
  Eraser,
  Hand,
  ImagePlus,
  Minus,
  MousePointer2,
  MoveUpRight,
  Pencil,
  Square,
  StickyNote,
  Triangle,
  Type,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useUI, type Tool } from '../state/ui';
import { IconButton, Swatch, panel } from './IconButton';

const TOOLS: { tool: Tool; label: string; key?: string; icon: ReactNode }[] = [
  { tool: 'select', label: 'Select', key: 'V', icon: <MousePointer2 size={18} /> },
  { tool: 'hand', label: 'Hand', key: 'H', icon: <Hand size={18} /> },
  { tool: 'sticky', label: 'Sticky note', key: 'N', icon: <StickyNote size={18} /> },
  { tool: 'text', label: 'Text', key: 'T', icon: <Type size={18} /> },
  { tool: 'rect', label: 'Rectangle', key: 'R', icon: <Square size={18} /> },
  { tool: 'ellipse', label: 'Ellipse', key: 'O', icon: <Circle size={18} /> },
  { tool: 'triangle', label: 'Triangle', icon: <Triangle size={18} /> },
  { tool: 'line', label: 'Line', key: 'L', icon: <Minus size={18} className="-rotate-45" /> },
  { tool: 'arrow', label: 'Arrow / connector', key: 'A', icon: <MoveUpRight size={18} /> },
  { tool: 'pen', label: 'Pen', key: 'P', icon: <Pencil size={18} /> },
  { tool: 'eraser', label: 'Eraser (pen strokes)', key: 'E', icon: <Eraser size={18} /> },
];

const PEN_SIZES = [2, 4, 8, 16];

function ToolOptions() {
  const tool = useUI((s) => s.tool);
  const { stickyColor, setStickyColor, penColor, setPenColor, penSize, setPenSize } = useUI();
  if (tool === 'sticky') {
    return (
      <div className={`${panel} grid grid-cols-4 gap-1.5 p-2`}>
        {STICKY_COLORS.map((c) => (
          <Swatch key={c} color={c} active={c === stickyColor} onClick={() => setStickyColor(c)} />
        ))}
      </div>
    );
  }
  if (tool === 'pen') {
    return (
      <div className={`${panel} flex flex-col gap-2 p-2`}>
        <div className="grid grid-cols-4 gap-1.5">
          {STROKE_COLORS.map((c) => (
            <Swatch key={c} color={c} active={c === penColor} onClick={() => setPenColor(c)} />
          ))}
        </div>
        <div className="flex items-center justify-between">
          {PEN_SIZES.map((s) => (
            <button
              key={s}
              type="button"
              aria-label={`Pen size ${s}`}
              onClick={() => setPenSize(s)}
              className={`flex h-7 w-7 items-center justify-center rounded-md ${s === penSize ? 'bg-indigo-100' : 'hover:bg-gray-100'}`}
            >
              <span
                className="rounded-full bg-gray-800"
                style={{ width: Math.min(s, 14), height: Math.min(s, 14) }}
              />
            </button>
          ))}
        </div>
      </div>
    );
  }
  return null;
}

export function Toolbar({ onImage }: { onImage: () => void }) {
  const tool = useUI((s) => s.tool);
  const setTool = useUI((s) => s.setTool);
  return (
    <div className="pointer-events-none absolute top-1/2 left-3 z-10 flex -translate-y-1/2 items-start gap-2">
      <div
        className={`${panel} pointer-events-auto flex flex-col gap-0.5 p-1`}
        role="toolbar"
        aria-label="Tools"
      >
        {TOOLS.map((t) => (
          <IconButton
            key={t.tool}
            label={t.key ? `${t.label} (${t.key})` : t.label}
            active={tool === t.tool}
            onClick={() => setTool(t.tool)}
            data-testid={`tool-${t.tool}`}
          >
            {t.icon}
          </IconButton>
        ))}
        <IconButton label="Upload image (I)" onClick={onImage} data-testid="tool-image">
          <ImagePlus size={18} />
        </IconButton>
      </div>
      <div className="pointer-events-auto">
        <ToolOptions />
      </div>
    </div>
  );
}
