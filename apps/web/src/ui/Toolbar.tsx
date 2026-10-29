import { STICKY_COLORS, STROKE_COLORS } from '@canvasly/shared';
import {
  Circle,
  Eraser,
  Frame,
  Hand,
  ImagePlus,
  MessageSquare,
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
import { useBoard } from '../doc/context';
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
  { tool: 'frame', label: 'Frame', key: 'F', icon: <Frame size={18} /> },
  { tool: 'comment', label: 'Comment', key: 'C', icon: <MessageSquare size={18} /> },
];

/** Tools a viewer can use: look around and comment (anonymous visitors can't comment). */
const VIEWER_TOOLS: Tool[] = ['select', 'hand', 'comment'];

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
              className={`flex h-7 w-7 items-center justify-center rounded-md ${s === penSize ? 'bg-indigo-100 dark:bg-indigo-500/20' : 'hover:bg-gray-100 dark:hover:bg-zinc-800'}`}
            >
              <span
                className="rounded-full bg-gray-800 dark:bg-zinc-200"
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
  const board = useBoard();
  const tool = useUI((s) => s.tool);
  const setTool = useUI((s) => s.setTool);
  const readOnly = useUI((s) => s.readOnly);
  const tools = TOOLS.filter(
    (t) => (!readOnly || VIEWER_TOOLS.includes(t.tool)) && !(board.anonymous && t.tool === 'comment'),
  );
  return (
    // Phones: a scrollable bar along the bottom. Larger screens: a vertical bar on the left.
    <div className="pointer-events-none absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 flex-col-reverse items-center gap-2 sm:top-1/2 sm:bottom-auto sm:left-3 sm:translate-x-0 sm:-translate-y-1/2 sm:flex-row sm:items-start">
      <div
        className={`${panel} pointer-events-auto flex max-w-[calc(100vw-1.5rem)] flex-row gap-0.5 overflow-x-auto p-1 sm:flex-col sm:overflow-visible`}
        role="toolbar"
        aria-label="Tools"
      >
        {tools.map((t) => (
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
        {!readOnly && (
          <IconButton label="Upload image (I)" onClick={onImage} data-testid="tool-image">
            <ImagePlus size={18} />
          </IconButton>
        )}
      </div>
      <div className="pointer-events-auto">
        <ToolOptions />
      </div>
    </div>
  );
}
