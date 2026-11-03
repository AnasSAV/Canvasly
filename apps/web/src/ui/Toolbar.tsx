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
  Lasso,
  LayoutTemplate,
  MessageSquare,
  Minus,
  MousePointer2,
  MoveUpRight,
  Network,
  Pencil,
  PenTool,
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
import { ink } from '../canvas/colors';
import { SHAPE_LABELS, traceShape } from '../canvas/shapePaths';
import type { Actions } from '../doc/actions';
import type { Board } from '../doc/board';
import { useBoard } from '../doc/context';
import { useDrawing, type PresetKind } from '../state/drawing';
import { useTheme } from '../state/theme';
import { useUI, type Tool } from '../state/ui';
import { CustomColor, isFloatingPanel } from './CustomColor';
import { IconButton, Swatch, panel } from './IconButton';
import { addStressObjects } from './stress';
import { TemplatePreview } from './TemplatePreview';

type Flyout = 'create' | 'templates' | 'shapes' | 'pen' | 'more';

const HIGHLIGHT_COLORS = ['#f5d128', '#c9df56', '#6cd8fa', '#ff9d48', '#ea94bb', '#be88c7'];
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
}: {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  testId?: string;
}) {
  return (
    <button type="button" onClick={onClick} data-testid={testId} className="menu-row">
      <span className="text-muted">{icon}</span>
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
    <div className="w-56 p-1" data-testid="create-panel">
      <p className="section-label">Data</p>
      <PanelItem
        label="Table"
        icon={<Table size={18} />}
        testId="create-table"
        onClick={() => {
          actions.insertTable();
          close();
        }}
      />
      <PanelItem
        label="Bar chart"
        icon={<ChartColumn size={18} />}
        testId="create-chart-bar"
        onClick={chart('bar')}
      />
      <PanelItem
        label="Line chart"
        icon={<ChartLine size={18} />}
        testId="create-chart-line"
        onClick={chart('line')}
      />
      <PanelItem
        label="Area chart"
        icon={<ChartArea size={18} />}
        testId="create-chart-area"
        onClick={chart('area')}
      />
      <PanelItem
        label="Pie chart"
        icon={<ChartPie size={18} />}
        testId="create-chart-pie"
        onClick={chart('pie')}
      />
      <PanelItem
        label="Donut chart"
        icon={<Donut size={18} />}
        testId="create-chart-donut"
        onClick={chart('donut')}
      />
      <div className="hairline" />
      <p className="section-label">Diagrams</p>
      <PanelItem label="Kanban" icon={<Columns3 size={18} />} onClick={template('kanban')} />
      <PanelItem label="Timeline" icon={<ChartGantt size={18} />} onClick={template('roadmap')} />
      <PanelItem label="Flowchart" icon={<Workflow size={18} />} onClick={template('flowchart')} />
      <PanelItem label="Mind map" icon={<Network size={18} />} onClick={template('mindmap')} />
      <div className="hairline" />
      <PanelItem
        label="Upload image or PDF"
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
      <h3 className="mb-2.5 text-[13px] font-semibold">Templates</h3>
      <div className="grid grid-cols-2 gap-3">
        {TEMPLATES.filter((t) => t.id !== 'blank').map((t) => (
          <button
            key={t.id}
            type="button"
            data-tip={t.description}
            onClick={() => {
              actions.insertTemplate(t.id);
              close();
            }}
            className="group text-left"
            data-testid={`insert-template-${t.id}`}
          >
            <span className="block aspect-[4/3] overflow-hidden rounded-md border border-line transition-colors duration-100 group-hover:border-teal">
              <TemplatePreview id={t.id} />
            </span>
            <span className="mt-1 block truncate text-xs font-semibold">{t.name}</span>
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
    `flex h-9 w-9 items-center justify-center rounded-[7px] ${
      active ? 'bg-teal text-on-teal' : 'hover:bg-hover'
    }`;
  return (
    <div className="w-[13.5rem] p-1.5" data-testid="shapes-panel" data-tip-side="top">
      <p className="section-label px-1!">Lines</p>
      <div className="mb-2 flex gap-0.5">
        <button
          type="button"
          data-tip="Line (L)"
          aria-label="Line"
          className={cell(tool === 'line')}
          onClick={pick('line')}
          data-testid="tool-line"
        >
          <Minus size={18} className="-rotate-45" />
        </button>
        <button
          type="button"
          data-tip="Arrow / connector (A)"
          aria-label="Arrow"
          className={cell(tool === 'arrow')}
          onClick={pick('arrow')}
          data-testid="tool-arrow"
        >
          <MoveUpRight size={18} />
        </button>
      </div>
      <p className="section-label px-1!">Shapes</p>
      <div className="grid grid-cols-5 gap-0.5">
        {SHAPE_KINDS.map((k) => (
          <button
            key={k}
            type="button"
            data-tip={SHAPE_LABELS[k]}
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

const DRAW_TOOLS: { tool: Tool; label: string; icon: ReactNode; testId: string }[] = [
  { tool: 'pen', label: 'Pen (P)', icon: <Pencil size={18} />, testId: 'tool-draw-pen' },
  { tool: 'highlighter', label: 'Highlighter', icon: <Highlighter size={18} />, testId: 'tool-highlighter' },
  {
    tool: 'smartpen',
    label: 'Smart drawing: sketches become clean shapes',
    icon: <PenTool size={18} />,
    testId: 'tool-smartpen',
  },
  {
    tool: 'spoteraser',
    label: 'Eraser: removes only what you touch',
    icon: <Eraser size={18} />,
    testId: 'tool-spoteraser',
  },
  {
    tool: 'eraser',
    label: 'Stroke eraser: removes whole strokes (E)',
    icon: (
      <span className="relative">
        <Eraser size={18} />
        <span className="absolute -right-1 -bottom-0.5 text-[9px] leading-none font-bold">⋯</span>
      </span>
    ),
    testId: 'tool-eraser',
  },
  {
    tool: 'lasso',
    label: 'Lasso: draw around objects to select them',
    icon: <Lasso size={18} />,
    testId: 'tool-lasso',
  },
];

function PenPanel() {
  const tool = useUI((s) => s.tool);
  const setTool = useUI((s) => s.setTool);
  const { presets, active, setActive, update } = useDrawing();
  const dark = useTheme((s) => s.dark);
  const [editing, setEditing] = useState(false);
  const kind: PresetKind | null =
    tool === 'highlighter' ? 'highlighter' : tool === 'pen' || tool === 'smartpen' ? 'pen' : null;
  const current = kind ? presets[kind][active[kind]] : undefined;
  return (
    <div className="flex" data-testid="pen-panel">
      <div className="flex flex-col items-center gap-px p-1">
        {DRAW_TOOLS.map((t) => (
          <IconButton
            tool
            key={t.tool}
            label={t.label}
            active={tool === t.tool}
            onClick={() => setTool(t.tool)}
            data-testid={t.testId}
          >
            {t.icon}
          </IconButton>
        ))}
        {kind && current && (
          <>
            <div className="my-1 h-px w-7 bg-line" />
            {presets[kind].map((p, i) => (
              <button
                key={i}
                type="button"
                data-tip={i === active[kind] ? 'Change color and size' : `Size ${p.size}`}
                aria-label={`Preset ${i + 1}`}
                aria-pressed={i === active[kind]}
                onClick={() => {
                  if (i === active[kind]) setEditing((v) => !v);
                  else setActive(kind, i);
                }}
                className={`my-0.5 flex h-8 w-8 items-center justify-center rounded-[7px] border-2 ${
                  i === active[kind] ? 'border-cta' : 'border-line hover:border-line-strong'
                }`}
                data-testid={`pen-preset-${i}`}
              >
                <span
                  className="rounded-full"
                  style={{
                    width: Math.min(22, Math.max(3, p.size)),
                    height: Math.min(22, Math.max(3, p.size)),
                    background: ink(p.color, dark), // as strokes are drawn in this theme
                    opacity: kind === 'highlighter' ? 0.6 : 1,
                  }}
                />
              </button>
            ))}
            <div className="my-1">
              <CustomColor value={current.color} onPick={(color) => update(kind, { color })} />
            </div>
          </>
        )}
      </div>
      {kind && current && editing && (
        <div className="flex w-44 flex-col gap-3 border-l border-line p-2.5" data-testid="pen-preset-editor">
          <div className="grid grid-cols-5 gap-1.5">
            {(kind === 'highlighter' ? HIGHLIGHT_COLORS : STROKE_COLORS).map((c) => (
              <Swatch
                key={c}
                color={c}
                active={c === current.color}
                onClick={() => update(kind, { color: c })}
              />
            ))}
          </div>
          <label className="text-xs font-semibold text-muted">
            Size <span className="num font-normal">{current.size}</span>
            <input
              type="range"
              min={1}
              max={kind === 'highlighter' ? 60 : 40}
              value={current.size}
              onChange={(e) => update(kind, { size: Number(e.target.value) })}
              className="slider mt-1.5"
              data-testid="pen-size"
            />
          </label>
        </div>
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
    <div className="w-56 p-1" data-testid="more-panel">
      <p className="section-label">Stickers</p>
      <div className="mb-1 grid grid-cols-8 gap-px px-0.5">
        {STICKERS.map((s) => (
          <button
            key={s}
            type="button"
            aria-label={`Sticker ${s}`}
            className="flex h-[26px] w-[26px] items-center justify-center rounded-md text-[15px] hover:bg-hover"
            onClick={() => {
              actions.insertSticker(s);
              close();
            }}
          >
            {s}
          </button>
        ))}
      </div>
      <div className="hairline" />
      <PanelItem
        label="Upload image or PDF"
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
    <div className="grid w-max grid-cols-4 gap-2 p-2.5" data-testid="sticky-panel">
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
    const close = (e: PointerEvent) =>
      !root.current?.contains(e.target as Node) && !isFloatingPanel(e.target) && setFlyout(null);
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [flyout]);

  const toggle = (f: Flyout) => () => setFlyout((cur) => (cur === f ? null : f));
  const choose = (t: Tool) => () => {
    setTool(t);
    setFlyout(null);
  };
  const close = () => setFlyout(null);
  const penActive = DRAW_TOOLS.some((t) => t.tool === tool);
  const shapeActive = isShape(tool) || tool === 'line' || tool === 'arrow';

  return (
    <div
      ref={root}
      className="pointer-events-none absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 flex-col-reverse items-center gap-2 sm:top-16 sm:bottom-auto sm:left-3 sm:translate-x-0 sm:flex-row sm:items-start"
    >
      <div className="flex flex-col gap-2">
        <div
          className={`${panel} pointer-events-auto flex max-w-[calc(100vw-1.5rem)] flex-row gap-px overflow-x-auto p-1 sm:max-h-[calc(100vh-9rem)] sm:flex-col sm:overflow-x-visible sm:overflow-y-auto`}
          role="toolbar"
          aria-label="Tools"
          data-tip-side="right"
        >
          <IconButton
            tool
            label="Select (V)"
            active={tool === 'select'}
            onClick={choose('select')}
            data-testid="tool-select"
          >
            <MousePointer2 size={18} />
          </IconButton>
          <IconButton
            tool
            label="Hand (H)"
            active={tool === 'hand'}
            onClick={choose('hand')}
            data-testid="tool-hand"
          >
            <Hand size={18} />
          </IconButton>
          {!readOnly && (
            <>
              <IconButton
                tool
                label="Create: tables, charts, diagrams"
                active={flyout === 'create'}
                onClick={toggle('create')}
                data-testid="tool-create"
              >
                <SquarePlus size={18} />
              </IconButton>
              <IconButton
                tool
                label="Templates"
                active={flyout === 'templates'}
                onClick={toggle('templates')}
                data-testid="tool-templates"
              >
                <LayoutTemplate size={18} />
              </IconButton>
              <IconButton
                tool
                label="Text (T)"
                active={tool === 'text'}
                onClick={choose('text')}
                data-testid="tool-text"
              >
                <Type size={18} />
              </IconButton>
              <IconButton
                tool
                label="Sticky note (N)"
                active={tool === 'sticky'}
                onClick={choose('sticky')}
                data-testid="tool-sticky"
              >
                <StickyNote size={18} />
              </IconButton>
              <IconButton
                tool
                label="Shapes and lines"
                active={shapeActive || flyout === 'shapes'}
                onClick={toggle('shapes')}
                data-testid="tool-shapes"
              >
                <Shapes size={18} />
              </IconButton>
              <IconButton
                tool
                label="Pen (P)"
                active={penActive}
                onClick={() => {
                  if (!penActive) setTool('pen');
                  setFlyout((cur) => (cur === 'pen' ? null : 'pen'));
                }}
                data-testid="tool-pen"
              >
                <Pencil size={18} />
              </IconButton>
              <IconButton
                tool
                label="Frame (F)"
                active={tool === 'frame'}
                onClick={choose('frame')}
                data-testid="tool-frame"
              >
                <Frame size={18} />
              </IconButton>
            </>
          )}
          {!board.anonymous && (
            <IconButton
              tool
              label="Comment (C)"
              active={tool === 'comment'}
              onClick={choose('comment')}
              data-testid="tool-comment"
            >
              <MessageSquare size={18} />
            </IconButton>
          )}
          {!readOnly && (
            <IconButton
              tool
              label="More tools"
              active={flyout === 'more'}
              onClick={toggle('more')}
              data-testid="tool-more"
            >
              <Plus size={18} />
            </IconButton>
          )}
        </div>
        {!readOnly && (
          <div
            className={`${panel} pointer-events-auto hidden flex-col gap-px p-1 sm:flex`}
            data-tip-side="right"
          >
            <IconButton label="Undo (Ctrl Z)" disabled={!canUndo} onClick={actions.undo} data-testid="undo">
              <Undo2 size={18} />
            </IconButton>
            <IconButton
              tool
              label="Redo (Ctrl Shift Z)"
              disabled={!canRedo}
              onClick={actions.redo}
              data-testid="redo"
            >
              <Redo2 size={18} />
            </IconButton>
          </div>
        )}
      </div>

      {(flyout || tool === 'sticky' || penActive) && (
        <div className={`${panel} pop pointer-events-auto`} data-tip-side="right">
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
