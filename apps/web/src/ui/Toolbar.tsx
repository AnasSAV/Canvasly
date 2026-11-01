import {
  SHAPE_KINDS,
  STICKY_COLORS,
  STROKE_COLORS,
  TEMPLATES,
  type ChartKind,
  type ShapeKind,
  type TemplateId,
} from '@canvasly/shared';
import {
  ChartArea,
  ChartColumn,
  ChartGantt,
  ChartLine,
  ChartPie,
  Columns3,
  Donut,
  Eraser,
  Frame,
  Hand,
  Highlighter,
  ImagePlus,
  LayoutTemplate,
  MessageSquare,
  Minus,
  MousePointer2,
  MoveUpRight,
  Network,
  Pencil,
  Plus,
  Redo2,
  Shapes,
  Sparkles,
  SquarePlus,
  StickyNote,
  Table,
  Type,
  Undo2,
  Workflow,
} from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { SHAPE_LABELS, traceShape } from '../canvas/shapePaths';
import type { Actions } from '../doc/actions';
import type { Board } from '../doc/board';
import { useBoard } from '../doc/context';
import { useUI, type Tool } from '../state/ui';
import { IconButton, Swatch, panel } from './IconButton';
import { addStressObjects } from './stress';
import { TemplatePreview } from './TemplatePreview';

type Flyout = 'create' | 'templates' | 'shapes' | 'pen' | 'more';

const HIGHLIGHT_COLORS = ['#f5d128', '#c9df56', '#6cd8fa', '#ff9d48', '#ea94bb', '#be88c7'];
const PEN_SIZES = [2, 4, 8, 16];
const STICKERS = [
  '👍',
  '❤️',
  '⭐',
  '✅',
  '❌',
  '❓',
  '🔥',
  '🎉',
  '💡',
  '⚠️',
  '📌',
  '🚀',
  '😀',
  '🤔',
  '👏',
  '💯',
];

const isShape = (t: Tool): t is ShapeKind => (SHAPE_KINDS as readonly string[]).includes(t);

/** A shape's actual outline, drawn into a small canvas for the shape picker. */
function ShapeIcon({ kind }: { kind: ShapeKind }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.canvas.width = 22 * dpr;
    ctx.canvas.height = 22 * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 1.5 * dpr, 1.5 * dpr);
    ctx.beginPath();
    traceShape(ctx, kind, 19, 19);
    ctx.strokeStyle = getComputedStyle(ctx.canvas).color;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }, [kind]);
  return <canvas ref={ref} style={{ width: 22, height: 22 }} aria-hidden />;
}

function PanelItem({
  label,
  icon,
  onClick,
  testId,
  color,
}: {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  testId?: string;
  color?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-zinc-800"
    >
      <span className={color ?? 'text-gray-700 dark:text-zinc-300'}>{icon}</span>
      {label}
    </button>
  );
}

function CreatePanel({
  actions,
  close,
  onImage,
}: {
  actions: Actions;
  close: () => void;
  onImage: () => void;
}) {
  const chart = (kind: ChartKind) => () => {
    actions.insertChart(kind);
    close();
  };
  const template = (id: TemplateId) => () => {
    actions.insertTemplate(id);
    close();
  };
  return (
    <div className="w-60 p-2" data-testid="create-panel">
      <PanelItem
        label="Table"
        icon={<Table size={18} />}
        color="text-emerald-600"
        testId="create-table"
        onClick={() => {
          actions.insertTable();
          close();
        }}
      />
      <div className="my-1 h-px bg-gray-200 dark:bg-zinc-700" />
      <PanelItem
        label="Bar chart"
        icon={<ChartColumn size={18} />}
        color="text-indigo-600"
        testId="create-chart-bar"
        onClick={chart('bar')}
      />
      <PanelItem
        label="Line chart"
        icon={<ChartLine size={18} />}
        color="text-indigo-600"
        testId="create-chart-line"
        onClick={chart('line')}
      />
      <PanelItem
        label="Area chart"
        icon={<ChartArea size={18} />}
        color="text-indigo-600"
        testId="create-chart-area"
        onClick={chart('area')}
      />
      <PanelItem
        label="Pie chart"
        icon={<ChartPie size={18} />}
        color="text-indigo-600"
        testId="create-chart-pie"
        onClick={chart('pie')}
      />
      <PanelItem
        label="Donut chart"
        icon={<Donut size={18} />}
        color="text-indigo-600"
        testId="create-chart-donut"
        onClick={chart('donut')}
      />
      <div className="my-1 h-px bg-gray-200 dark:bg-zinc-700" />
      <PanelItem
        label="Kanban"
        icon={<Columns3 size={18} />}
        color="text-amber-600"
        onClick={template('kanban')}
      />
      <PanelItem
        label="Timeline"
        icon={<ChartGantt size={18} />}
        color="text-amber-600"
        onClick={template('roadmap')}
      />
      <PanelItem
        label="Flowchart"
        icon={<Workflow size={18} />}
        color="text-rose-600"
        onClick={template('flowchart')}
      />
      <PanelItem
        label="Mind map"
        icon={<Network size={18} />}
        color="text-rose-600"
        onClick={template('mindmap')}
      />
      <div className="my-1 h-px bg-gray-200 dark:bg-zinc-700" />
      <PanelItem
        label="Upload image"
        icon={<ImagePlus size={18} />}
        testId="tool-image"
        onClick={() => {
          onImage();
          close();
        }}
      />
    </div>
  );
}

function TemplatesPanel({ actions, close }: { actions: Actions; close: () => void }) {
  return (
    <div className="max-h-[70vh] w-[22rem] overflow-y-auto p-3" data-testid="templates-panel">
      <h3 className="mb-2 text-sm font-semibold">Templates</h3>
      <div className="grid grid-cols-2 gap-3">
        {TEMPLATES.filter((t) => t.id !== 'blank').map((t) => (
          <button
            key={t.id}
            type="button"
            title={t.description}
            onClick={() => {
              actions.insertTemplate(t.id);
              close();
            }}
            className="group text-left"
            data-testid={`insert-template-${t.id}`}
          >
            <span className="block aspect-[4/3] overflow-hidden rounded-lg border border-gray-200 group-hover:border-indigo-400 dark:border-zinc-700">
              <TemplatePreview id={t.id} />
            </span>
            <span className="mt-1 block truncate text-xs font-medium">{t.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function ShapesPanel({ close }: { close: () => void }) {
  const tool = useUI((s) => s.tool);
  const setTool = useUI((s) => s.setTool);
  const pick = (t: Tool) => () => {
    setTool(t);
    close();
  };
  const cell = (active: boolean) =>
    `flex h-10 w-10 items-center justify-center rounded-lg ${
      active
        ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300'
        : 'hover:bg-gray-100 dark:hover:bg-zinc-800'
    }`;
  return (
    <div className="w-56 p-2" data-testid="shapes-panel">
      <p className="px-1 pb-1 text-xs font-semibold text-gray-500 dark:text-zinc-400">Lines</p>
      <div className="mb-2 flex gap-0.5">
        <button
          type="button"
          title="Line (L)"
          aria-label="Line"
          className={cell(tool === 'line')}
          onClick={pick('line')}
          data-testid="tool-line"
        >
          <Minus size={20} className="-rotate-45" />
        </button>
        <button
          type="button"
          title="Arrow / connector (A)"
          aria-label="Arrow"
          className={cell(tool === 'arrow')}
          onClick={pick('arrow')}
          data-testid="tool-arrow"
        >
          <MoveUpRight size={20} />
        </button>
      </div>
      <p className="px-1 pb-1 text-xs font-semibold text-gray-500 dark:text-zinc-400">Shapes</p>
      <div className="grid grid-cols-5 gap-0.5">
        {SHAPE_KINDS.map((k) => (
          <button
            key={k}
            type="button"
            title={SHAPE_LABELS[k]}
            aria-label={SHAPE_LABELS[k]}
            className={cell(tool === k)}
            onClick={pick(k)}
            data-testid={`tool-${k}`}
          >
            <ShapeIcon kind={k} />
          </button>
        ))}
      </div>
    </div>
  );
}

function PenPanel() {
  const { tool, setTool, penColor, setPenColor, penSize, setPenSize, highlightColor, setHighlightColor } =
    useUI();
  return (
    <div className="flex w-52 flex-col gap-2 p-2" data-testid="pen-panel">
      <div className="flex gap-0.5">
        <IconButton label="Pen (P)" active={tool === 'pen'} onClick={() => setTool('pen')}>
          <Pencil size={18} />
        </IconButton>
        <IconButton
          label="Highlighter"
          active={tool === 'highlighter'}
          onClick={() => setTool('highlighter')}
          data-testid="tool-highlighter"
        >
          <Highlighter size={18} />
        </IconButton>
        <IconButton
          label="Eraser, pen strokes only (E)"
          active={tool === 'eraser'}
          onClick={() => setTool('eraser')}
          data-testid="tool-eraser"
        >
          <Eraser size={18} />
        </IconButton>
      </div>
      {tool === 'highlighter' ? (
        <div className="grid grid-cols-6 gap-1.5">
          {HIGHLIGHT_COLORS.map((c) => (
            <Swatch key={c} color={c} active={c === highlightColor} onClick={() => setHighlightColor(c)} />
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-6 gap-1.5">
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
                className={`flex h-8 w-8 items-center justify-center rounded-md ${s === penSize ? 'bg-indigo-100 dark:bg-indigo-500/20' : 'hover:bg-gray-100 dark:hover:bg-zinc-800'}`}
              >
                <span
                  className="rounded-full bg-gray-800 dark:bg-zinc-200"
                  style={{ width: Math.min(s, 14), height: Math.min(s, 14) }}
                />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function MorePanel({
  actions,
  board,
  close,
  onImage,
}: {
  actions: Actions;
  board: Board;
  close: () => void;
  onImage: () => void;
}) {
  return (
    <div className="w-60 p-2" data-testid="more-panel">
      <p className="px-1 pb-1 text-xs font-semibold text-gray-500 dark:text-zinc-400">Stickers</p>
      <div className="mb-2 grid grid-cols-8 gap-0.5">
        {STICKERS.map((s) => (
          <button
            key={s}
            type="button"
            aria-label={`Sticker ${s}`}
            className="flex h-7 w-7 items-center justify-center rounded-md text-base hover:bg-gray-100 dark:hover:bg-zinc-800"
            onClick={() => {
              actions.insertSticker(s);
              close();
            }}
          >
            {s}
          </button>
        ))}
      </div>
      <div className="my-1 h-px bg-gray-200 dark:bg-zinc-700" />
      <PanelItem
        label="Upload image"
        icon={<ImagePlus size={18} />}
        onClick={() => {
          onImage();
          close();
        }}
      />
      <PanelItem
        label="Highlighter"
        icon={<Highlighter size={18} />}
        onClick={() => {
          useUI.getState().setTool('highlighter');
          close();
        }}
      />
      <PanelItem
        label="Eraser"
        icon={<Eraser size={18} />}
        onClick={() => {
          useUI.getState().setTool('eraser');
          close();
        }}
      />
      {import.meta.env.DEV && (
        <PanelItem
          label="Dev: add 1,000 objects"
          icon={<Sparkles size={18} />}
          onClick={() => {
            addStressObjects(board, 1000);
            close();
          }}
        />
      )}
    </div>
  );
}

function StickyColors() {
  const { stickyColor, setStickyColor } = useUI();
  return (
    <div className="grid w-40 grid-cols-4 gap-2 p-2.5" data-testid="sticky-panel">
      {STICKY_COLORS.map((c) => (
        <Swatch key={c} color={c} active={c === stickyColor} onClick={() => setStickyColor(c)} />
      ))}
    </div>
  );
}

function useUndoState(board: Board) {
  const [state, setState] = useState({ canUndo: false, canRedo: false });
  useEffect(() => {
    const update = () => setState({ canUndo: board.undo.canUndo(), canRedo: board.undo.canRedo() });
    board.undo.on('stack-item-added', update);
    board.undo.on('stack-item-popped', update);
    board.undo.on('stack-cleared', update);
    update();
    return () => {
      board.undo.off('stack-item-added', update);
      board.undo.off('stack-item-popped', update);
      board.undo.off('stack-cleared', update);
    };
  }, [board]);
  return state;
}

/** Floating tool rail: vertical on the left, a scrollable bar along the bottom on phones. */
export function Toolbar({ onImage, actions }: { onImage: () => void; actions: Actions }) {
  const board = useBoard();
  const tool = useUI((s) => s.tool);
  const setTool = useUI((s) => s.setTool);
  const readOnly = useUI((s) => s.readOnly);
  const [flyout, setFlyout] = useState<Flyout | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const { canUndo, canRedo } = useUndoState(board);

  useEffect(() => {
    if (!flyout) return;
    const close = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setFlyout(null);
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [flyout]);

  const toggle = (f: Flyout) => () => setFlyout((cur) => (cur === f ? null : f));
  const choose = (t: Tool) => () => {
    setTool(t);
    setFlyout(null);
  };
  const close = () => setFlyout(null);
  const penActive = tool === 'pen' || tool === 'highlighter' || tool === 'eraser';
  const shapeActive = isShape(tool) || tool === 'line' || tool === 'arrow';

  return (
    <div
      ref={root}
      className="pointer-events-none absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 flex-col-reverse items-center gap-2 sm:top-[72px] sm:bottom-auto sm:left-3 sm:translate-x-0 sm:flex-row sm:items-start"
    >
      <div className="flex flex-col gap-2">
        <div
          className={`${panel} pointer-events-auto flex max-w-[calc(100vw-1.5rem)] flex-row gap-0.5 overflow-x-auto p-1 sm:max-h-[calc(100vh-9rem)] sm:flex-col sm:overflow-x-visible sm:overflow-y-auto`}
          role="toolbar"
          aria-label="Tools"
        >
          <IconButton
            label="Select (V)"
            active={tool === 'select'}
            onClick={choose('select')}
            data-testid="tool-select"
          >
            <MousePointer2 size={20} />
          </IconButton>
          <IconButton
            label="Hand (H)"
            active={tool === 'hand'}
            onClick={choose('hand')}
            data-testid="tool-hand"
          >
            <Hand size={20} />
          </IconButton>
          {!readOnly && (
            <>
              <IconButton
                label="Create: tables, charts, diagrams"
                active={flyout === 'create'}
                onClick={toggle('create')}
                data-testid="tool-create"
              >
                <SquarePlus size={20} />
              </IconButton>
              <IconButton
                label="Templates"
                active={flyout === 'templates'}
                onClick={toggle('templates')}
                data-testid="tool-templates"
              >
                <LayoutTemplate size={20} />
              </IconButton>
              <IconButton
                label="Text (T)"
                active={tool === 'text'}
                onClick={choose('text')}
                data-testid="tool-text"
              >
                <Type size={20} />
              </IconButton>
              <IconButton
                label="Sticky note (N)"
                active={tool === 'sticky'}
                onClick={choose('sticky')}
                data-testid="tool-sticky"
              >
                <StickyNote size={20} />
              </IconButton>
              <IconButton
                label="Shapes and lines"
                active={shapeActive || flyout === 'shapes'}
                onClick={toggle('shapes')}
                data-testid="tool-shapes"
              >
                <Shapes size={20} />
              </IconButton>
              <IconButton
                label="Pen (P)"
                active={penActive}
                onClick={() => {
                  if (!penActive) setTool('pen');
                  setFlyout((cur) => (cur === 'pen' ? null : 'pen'));
                }}
                data-testid="tool-pen"
              >
                <Pencil size={20} />
              </IconButton>
              <IconButton
                label="Frame (F)"
                active={tool === 'frame'}
                onClick={choose('frame')}
                data-testid="tool-frame"
              >
                <Frame size={20} />
              </IconButton>
            </>
          )}
          {!board.anonymous && (
            <IconButton
              label="Comment (C)"
              active={tool === 'comment'}
              onClick={choose('comment')}
              data-testid="tool-comment"
            >
              <MessageSquare size={20} />
            </IconButton>
          )}
          {!readOnly && (
            <IconButton
              label="More tools"
              active={flyout === 'more'}
              onClick={toggle('more')}
              data-testid="tool-more"
            >
              <Plus size={20} />
            </IconButton>
          )}
        </div>
        {!readOnly && (
          <div className={`${panel} pointer-events-auto hidden flex-col gap-0.5 p-1 sm:flex`}>
            <IconButton label="Undo (Ctrl Z)" disabled={!canUndo} onClick={actions.undo} data-testid="undo">
              <Undo2 size={20} />
            </IconButton>
            <IconButton
              label="Redo (Ctrl Shift Z)"
              disabled={!canRedo}
              onClick={actions.redo}
              data-testid="redo"
            >
              <Redo2 size={20} />
            </IconButton>
          </div>
        )}
      </div>

      {(flyout || tool === 'sticky' || penActive) && (
        <div className={`${panel} pointer-events-auto`}>
          {flyout === 'create' && <CreatePanel actions={actions} close={close} onImage={onImage} />}
          {flyout === 'templates' && <TemplatesPanel actions={actions} close={close} />}
          {flyout === 'shapes' && <ShapesPanel close={close} />}
          {flyout === 'more' && <MorePanel actions={actions} board={board} close={close} onImage={onImage} />}
          {(flyout === 'pen' || (!flyout && penActive)) && <PenPanel />}
          {!flyout && tool === 'sticky' && <StickyColors />}
        </div>
      )}
    </div>
  );
}
