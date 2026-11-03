import {
  LINE_CAPS,
  LINE_DASHES,
  LINE_ROUTINGS,
  STICKY_COLORS,
  STROKE_COLORS,
  hasText,
  isSafeLink,
  isShapeObject,
  listKind,
  parsePageRanges,
  patchObject,
  toggleList,
  worldToScreen,
  type BoardObject,
  type ConnectorObject,
  type DocumentObject,
  type FontId,
  type LineCap,
  type LineDash,
  type LineRouting,
  type ListKind,
  type ObjectPatch,
  type ShapeObject,
  type TextBearingObject,
} from '@canvasly/shared';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  ChartColumn,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Columns2,
  CornerDownRight,
  Download,
  EllipsisVertical,
  FileOutput,
  Group,
  Highlighter,
  Italic,
  Link2,
  List,
  ListOrdered,
  Lock,
  LockOpen,
  MessageCircleMore,
  Minus,
  RefreshCw,
  Rows2,
  Shapes,
  Spline,
  SquareRoundCorner,
  Strikethrough,
  Type,
  Underline,
  Ungroup,
} from 'lucide-react';
import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import type { Actions } from '../doc/actions';
import { ROTATE_ANCHOR_OFFSET } from '../canvas/Overlay';
import { SHAPE_LABELS, cornerRadiusOf, hasCorners } from '../canvas/shapePaths';
import { FONTS, FONT_MENU, MAX_FONT_SIZE, ensureFont, stepFontSize } from '../canvas/text';
import { useDocumentPage } from '../doc/assets';
import { useBoard, useDocVersion } from '../doc/context';
import { exportDocumentPdf } from '../lib/exporters';
import {
  addTableColumn,
  addTableRow,
  convertObject,
  deleteTableColumn,
  deleteTableRow,
  restyleText,
  extractPages,
  patch,
  selectionBounds,
  updateEach,
  type ConvertTarget,
} from '../doc/ops';
import { toast } from '../state/feedback';
import { usePrefs } from '../state/prefs';
import { useUI } from '../state/ui';
import { useViewport } from '../state/viewport';
import { objectContextEntries } from './boardMenus';
import { CustomColor, isFloatingPanel } from './CustomColor';
import { IconButton, Swatch, panel } from './IconButton';
import { MenuList } from './Menu';

const FILL_COLORS = [
  'transparent',
  '#ffffff',
  '#f1f3f5',
  '#ffe3e3',
  '#fff3bf',
  '#d3f9d8',
  '#d0ebff',
  '#e5dbff',
  '#1a1a1a',
];

const HIGHLIGHT_COLORS = [
  'transparent',
  '#fff3bf',
  '#f5d128',
  '#c9df56',
  '#6cd8fa',
  '#ff9d48',
  '#ea94bb',
  '#be88c7',
];

const RAIL_WIDTH = 72;
const MOD = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl';

/** Only one of the toolbar's dropdowns is open at a time. */
const OpenMenu = createContext<{ open: string | null; setOpen: (id: string | null) => void }>({
  open: null,
  setOpen: () => {},
});

function useDropdown(id: string) {
  const { open, setOpen } = useContext(OpenMenu);
  const isOpen = open === id;
  return { isOpen, toggle: () => setOpen(isOpen ? null : id), close: () => setOpen(null) };
}

/** Opens below its button, or above it when it would run off the bottom of the screen. */
function Dropdown({ className = '', children }: { className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [up, setUp] = useState(false);
  useLayoutEffect(() => {
    const r = ref.current?.getBoundingClientRect();
    if (r && r.bottom > window.innerHeight - 8) setUp(true);
  }, []);
  return (
    <div ref={ref} className={`absolute z-10 ${up ? 'bottom-11' : 'top-11'} ${className}`}>
      {children}
    </div>
  );
}

function ColorPicker({
  label,
  value,
  colors,
  onPick,
  icon,
}: {
  label: string;
  value: string | undefined;
  colors: readonly string[];
  onPick: (c: string) => void;
  /** Shown instead of a swatch of the current color. */
  icon?: ReactNode;
}) {
  const { isOpen, toggle, close } = useDropdown(`color-${label}`);
  const pick = (c: string) => {
    onPick(c);
    close();
  };
  return (
    <div className="relative">
      {icon ? (
        <IconButton label={label} aria-expanded={isOpen} onClick={toggle}>
          {icon}
        </IconButton>
      ) : (
        <button
          type="button"
          aria-label={label}
          aria-expanded={isOpen}
          data-tip={label}
          onClick={toggle}
          className="tile"
        >
          <span
            className="swatch h-5! w-5! hover:scale-100!"
            style={{
              background:
                value === 'transparent'
                  ? 'linear-gradient(135deg, #fff 44%, #d9391f 44%, #d9391f 56%, #fff 56%)'
                  : (value ?? '#ffffff'),
            }}
          />
        </button>
      )}
      {isOpen && (
        <Dropdown className={`${panel} pop left-1/2 grid w-max -translate-x-1/2 grid-cols-6 gap-1.5 p-2`}>
          {colors.map((c) => (
            <Swatch key={c} color={c} active={c === value} onClick={() => pick(c)} />
          ))}
          <CustomColor value={value} onPick={onPick} />
        </Dropdown>
      )}
    </div>
  );
}

/** An icon with a bar under it showing the color it applies. */
function ColorIcon({ color, children }: { color: string | undefined; children: ReactNode }) {
  return (
    <span className="flex flex-col items-center gap-0.5">
      {children}
      <span
        className="h-[3px] w-5 rounded-full border border-(--swatch-edge)"
        style={{ background: color === 'transparent' ? 'transparent' : color }}
      />
    </span>
  );
}

function FontPicker({ value, onPick }: { value: FontId; onPick: (font: FontId) => void }) {
  const { isOpen, toggle, close } = useDropdown('font');
  return (
    <div className="relative">
      <button
        type="button"
        data-tip="Font"
        aria-expanded={isOpen}
        onClick={toggle}
        className="flex h-9 items-center gap-1 rounded-[7px] px-2 text-[13px] whitespace-nowrap hover:bg-hover"
        data-testid="font-picker"
      >
        <span className="w-24 truncate text-left" style={{ fontFamily: FONTS[value].family }}>
          {FONTS[value].label}
        </span>
        <ChevronDown size={14} className="shrink-0" />
      </button>
      {isOpen && (
        <Dropdown className={`${panel} pop left-0 max-h-80 w-56 overflow-y-auto p-1`}>
          <div role="listbox" aria-label="Font">
            {FONT_MENU.map((id) => (
              <button
                key={id}
                type="button"
                role="option"
                aria-selected={id === value}
                onClick={() => {
                  onPick(id);
                  close();
                }}
                className={`block w-full rounded-md px-2 py-1.5 text-left text-[15px] whitespace-nowrap hover:bg-hover ${
                  id === value ? 'text-link' : ''
                }`}
                style={{ fontFamily: FONTS[id].family }}
                data-testid={`font-${id}`}
              >
                {FONTS[id].label}
              </button>
            ))}
          </div>
        </Dropdown>
      )}
    </div>
  );
}

function FontSizeControl({ value, onChange }: { value: number; onChange: (size: number) => void }) {
  const size = Math.round(value);
  const stepper = 'flex h-4 w-5 items-center justify-center rounded hover:bg-hover';
  return (
    <div className="flex items-center">
      <input
        key={size}
        defaultValue={size}
        inputMode="numeric"
        aria-label="Font size"
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
        onBlur={(e) => {
          const n = Math.round(Number(e.currentTarget.value));
          const next = Number.isFinite(n) && n > 0 ? Math.min(MAX_FONT_SIZE, Math.max(4, n)) : size;
          if (next !== size) onChange(next);
          e.currentTarget.value = String(next);
        }}
        className="num h-8 w-9 rounded-md bg-transparent text-center text-xs outline-none hover:bg-hover focus:bg-hover"
        data-testid="font-size"
      />
      <div className="flex flex-col">
        <button
          type="button"
          aria-label="Bigger text"
          data-tip={`Bigger text (${MOD} Shift >)`}
          className={stepper}
          onClick={() => onChange(stepFontSize(size, 1))}
        >
          <ChevronUp size={14} />
        </button>
        <button
          type="button"
          aria-label="Smaller text"
          data-tip={`Smaller text (${MOD} Shift <)`}
          className={stepper}
          onClick={() => onChange(stepFontSize(size, -1))}
        >
          <ChevronDown size={14} />
        </button>
      </div>
    </div>
  );
}

/** A button that opens a small row of toggles. */
function ToggleMenu({
  id,
  label,
  icon,
  active,
  testId,
  children,
}: {
  id: string;
  label: string;
  icon: ReactNode;
  active?: boolean;
  testId: string;
  children: ReactNode;
}) {
  const { isOpen, toggle } = useDropdown(id);
  return (
    <div className="relative">
      <IconButton label={label} active={isOpen || active} onClick={toggle} data-testid={testId}>
        {icon}
      </IconButton>
      {isOpen && (
        <Dropdown className={`${panel} pop left-1/2 flex w-max -translate-x-1/2 gap-px p-1`}>
          {children}
        </Dropdown>
      )}
    </div>
  );
}

function LinkForm({
  value,
  onSet,
  close,
}: {
  value: string | null;
  onSet: (link: string | null) => void;
  close: () => void;
}) {
  const [draft, setDraft] = useState(value ?? '');
  const [invalid, setInvalid] = useState(false);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text) {
      onSet(null);
      close();
      return;
    }
    const url = /^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`;
    if (!isSafeLink(url)) {
      setInvalid(true);
      return;
    }
    onSet(url);
    close();
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <div className="flex gap-1.5">
        <input
          autoFocus
          value={draft}
          placeholder="Paste a link"
          aria-label="Link address"
          onChange={(e) => {
            setDraft(e.target.value);
            setInvalid(false);
          }}
          onKeyDown={(e) => e.stopPropagation()}
          className="field field-sm flex-1"
          data-testid="link-input"
        />
        <button type="submit" className="btn btn-sm btn-primary h-[1.875rem]!" data-testid="link-apply">
          Apply
        </button>
      </div>
      {invalid && <p className="text-xs text-danger">Links must be http, https or mailto.</p>}
      {value && (
        <div className="flex items-center justify-between text-xs">
          <a
            href={value}
            target="_blank"
            rel="noopener noreferrer"
            className="text-link"
            data-testid="link-open"
          >
            Open link
          </a>
          <button
            type="button"
            onClick={() => {
              onSet(null);
              close();
            }}
            className="text-muted hover:text-danger"
            data-testid="link-remove"
          >
            Remove
          </button>
        </div>
      )}
      <p className="text-xs text-muted">Ctrl or ⌘ + click the object to follow it.</p>
    </form>
  );
}

function LinkMenu({ value, onSet }: { value: string | null; onSet: (link: string | null) => void }) {
  const { isOpen, toggle, close } = useDropdown('link');
  return (
    <div className="relative">
      <IconButton label="Link" active={isOpen || !!value} onClick={toggle} data-testid="link-button">
        <Link2 size={18} />
      </IconButton>
      {isOpen && (
        <Dropdown className={`${panel} pop left-1/2 w-72 -translate-x-1/2 p-2.5`}>
          <LinkForm value={value} onSet={onSet} close={close} />
        </Dropdown>
      )}
    </div>
  );
}

const CONVERT_TARGETS: { target: ConvertTarget; label: string }[] = [
  { target: 'text', label: 'Text' },
  { target: 'sticky', label: 'Sticky note' },
  ...(['rect', 'roundrect', 'ellipse', 'diamond', 'hexagon', 'cloud'] as const).map((target) => ({
    target,
    label: SHAPE_LABELS[target],
  })),
];

function ConvertMenu({ o }: { o: TextBearingObject }) {
  const board = useBoard();
  const { isOpen, toggle, close } = useDropdown('convert');
  return (
    <div className="relative">
      <IconButton label="Change to" active={isOpen} onClick={toggle} data-testid="convert-menu">
        <Shapes size={18} />
      </IconButton>
      {isOpen && (
        <Dropdown className="left-0">
          <MenuList
            entries={CONVERT_TARGETS.filter((t) => t.target !== o.type).map(({ target, label }) => ({
              label,
              onSelect: () => convertObject(board, o, target),
            }))}
            onClose={close}
          />
        </Dropdown>
      )}
    </div>
  );
}

function MoreMenu({ actions, title }: { actions: Actions; title: string }) {
  const board = useBoard();
  const { isOpen, toggle, close } = useDropdown('more');
  return (
    <div className="relative">
      <IconButton label="More" active={isOpen} onClick={toggle} data-testid="selection-more">
        <EllipsisVertical size={18} />
      </IconButton>
      {isOpen && (
        <Dropdown className="right-0">
          <MenuList entries={objectContextEntries(board, actions, title)} onClose={close} />
        </Dropdown>
      )}
    </div>
  );
}

const CORNER_PRESETS = [
  { label: 'Square', fraction: 0 },
  { label: 'Slight', fraction: 0.15 },
  { label: 'Round', fraction: 0.4 },
  { label: 'Full', fraction: 1 },
];

/** Rounding for the selected shapes. The slider's whole drag is one undo step. */
function CornerMenu({ shapes, ids }: { shapes: ShapeObject[]; ids: string[] }) {
  const board = useBoard();
  const { isOpen, toggle } = useDropdown('corners');
  const first = shapes[0]!;
  const max = Math.round(Math.min(first.w, first.h) / 2);
  const value = Math.min(max, Math.round(cornerRadiusOf(first.type, first.w, first.h, first.cornerRadius)));
  const set = (cornerRadius: number, discrete = true) =>
    board.transact(() => {
      for (const id of ids) patchObject(board.objects, id, { cornerRadius });
    }, discrete);
  return (
    <div className="relative">
      <IconButton label="Corner radius" active={isOpen} onClick={toggle} data-testid="corner-radius">
        <SquareRoundCorner size={18} />
      </IconButton>
      {isOpen && (
        <Dropdown className={`${panel} pop left-1/2 w-52 -translate-x-1/2 p-2.5`}>
          <div className="mb-2.5 grid grid-cols-4 gap-1">
            {CORNER_PRESETS.map(({ label, fraction }) => {
              const preset = Math.round(max * fraction);
              return (
                <button
                  key={label}
                  type="button"
                  aria-pressed={value === preset}
                  onClick={() => set(preset)}
                  className={`rounded-md py-1 text-[11px] font-medium ${
                    value === preset ? 'bg-selected text-on-selected' : 'hover:bg-hover'
                  }`}
                  data-testid={`corner-${label.toLowerCase()}`}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <label className="text-xs font-semibold text-muted">
            Radius: {value}
            <input
              type="range"
              min={0}
              max={max}
              value={value}
              onPointerDown={() => board.beginGesture()}
              onPointerUp={() => board.endGesture()}
              onChange={(e) => set(Number(e.target.value), false)}
              className="slider mt-1.5"
              data-testid="corner-radius-input"
            />
          </label>
        </Dropdown>
      )}
    </div>
  );
}

const CAP_LABELS: Record<LineCap, string> = {
  none: 'None',
  arrow: 'Arrow',
  open: 'Open arrow',
  circle: 'Dot',
  diamond: 'Diamond',
  bar: 'Bar',
};

const ROUTING_LABELS: Record<LineRouting, string> = {
  straight: 'Straight line',
  elbow: 'Elbowed line',
  curved: 'Curved line',
};

function RoutingIcon({ routing }: { routing: LineRouting }) {
  if (routing === 'elbow') return <CornerDownRight size={17} />;
  if (routing === 'curved') return <Spline size={17} />;
  return <Minus size={17} className="-rotate-45" />;
}

/** A line end as it looks, drawn pointing right; the start of a line flips it to point left. */
function CapGlyph({ cap, flip }: { cap: LineCap; flip?: boolean }) {
  return (
    <svg
      width="26"
      height="14"
      viewBox="0 0 26 14"
      fill="currentColor"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={flip ? { transform: 'scaleX(-1)' } : undefined}
      aria-hidden
    >
      <path d="M2 7H22" fill="none" />
      {cap === 'arrow' && <path d="M24 7L16 2.5V11.5Z" />}
      {cap === 'open' && <path d="M17 2.5L24 7L17 11.5" fill="none" />}
      {cap === 'circle' && <circle cx="20.5" cy="7" r="3.5" />}
      {cap === 'diamond' && <path d="M24 7L19.5 3L15 7L19.5 11Z" />}
      {cap === 'bar' && <path d="M23 2.5V11.5" fill="none" />}
    </svg>
  );
}

function CapMenu({
  which,
  value,
  onPick,
}: {
  which: 'start' | 'end';
  value: LineCap;
  onPick: (cap: LineCap) => void;
}) {
  const { isOpen, toggle, close } = useDropdown(`cap-${which}`);
  const flip = which === 'start';
  return (
    <div className="relative">
      <button
        type="button"
        data-tip={which === 'start' ? 'Start of line' : 'End of line'}
        aria-expanded={isOpen}
        onClick={toggle}
        className={`flex h-9 min-w-9 items-center justify-center rounded-[7px] px-1.5 text-xs hover:bg-hover ${
          isOpen ? 'bg-selected text-on-selected' : ''
        }`}
        data-testid={`line-${which}-cap`}
      >
        {value === 'none' ? 'None' : <CapGlyph cap={value} flip={flip} />}
      </button>
      {isOpen && (
        <Dropdown className={`${panel} pop left-1/2 flex w-40 -translate-x-1/2 flex-col p-1`}>
          {LINE_CAPS.map((cap) => (
            <button
              key={cap}
              type="button"
              onClick={() => {
                onPick(cap);
                close();
              }}
              className={`flex items-center justify-between rounded-md px-2 py-1.5 text-[13px] whitespace-nowrap hover:bg-hover ${
                cap === value ? 'text-link' : ''
              }`}
              data-testid={`cap-${cap}`}
            >
              {CAP_LABELS[cap]}
              {cap !== 'none' && <CapGlyph cap={cap} flip={flip} />}
            </button>
          ))}
        </Dropdown>
      )}
    </div>
  );
}

function LineStyleMenu({
  dash,
  width,
  onDash,
  onWidth,
}: {
  dash: LineDash;
  width: number;
  onDash: (dash: LineDash) => void;
  onWidth: (width: number) => void;
}) {
  const { isOpen, toggle } = useDropdown('line-style');
  return (
    <div className="relative">
      <IconButton label="Line style" active={isOpen} onClick={toggle} data-testid="line-style">
        <svg
          width="20"
          height="16"
          viewBox="0 0 20 16"
          stroke="currentColor"
          strokeLinecap="round"
          aria-hidden
        >
          <path d="M2 3H18" strokeWidth="1.5" />
          <path d="M2 8H18" strokeWidth="2.5" strokeDasharray="4 3.5" />
          <path d="M2 13H18" strokeWidth="2.5" strokeDasharray="0.1 4" />
        </svg>
      </IconButton>
      {isOpen && (
        <Dropdown className={`${panel} pop left-1/2 w-44 -translate-x-1/2 p-2.5`}>
          <div className="mb-2.5 flex gap-1">
            {LINE_DASHES.map((d) => (
              <button
                key={d}
                type="button"
                data-tip={d[0]!.toUpperCase() + d.slice(1)}
                aria-label={d}
                aria-pressed={d === dash}
                onClick={() => onDash(d)}
                className={`flex h-8 flex-1 items-center justify-center rounded-md ${
                  d === dash ? 'bg-selected text-on-selected' : 'hover:bg-hover'
                }`}
                data-testid={`dash-${d}`}
              >
                <svg
                  width="28"
                  height="4"
                  viewBox="0 0 28 4"
                  stroke="currentColor"
                  strokeLinecap="round"
                  aria-hidden
                >
                  <path
                    d="M2 2H26"
                    strokeWidth="2.5"
                    strokeDasharray={d === 'dashed' ? '6 5' : d === 'dotted' ? '0.1 5' : undefined}
                  />
                </svg>
              </button>
            ))}
          </div>
          <label className="text-xs font-semibold text-muted">
            Thickness: {width}
            <input
              type="range"
              min={1}
              max={20}
              defaultValue={width}
              // Dragging the slider is one change, applied when it's let go.
              onPointerUp={(e) => onWidth(Number(e.currentTarget.value))}
              onKeyUp={(e) => onWidth(Number(e.currentTarget.value))}
              className="slider mt-1.5"
              data-testid="line-width"
            />
          </label>
        </Dropdown>
      )}
    </div>
  );
}

/** Pages as objects of their own: this one, some, or all of them. */
function ExtractMenu({ o, shown }: { o: DocumentObject; shown: number }) {
  const board = useBoard();
  const { isOpen, toggle, close } = useDropdown('extract');
  const [range, setRange] = useState('');
  const [error, setError] = useState<string | null>(null);
  const total = o.pages.length;

  const extract = (indexes: number[]) => {
    const ids = extractPages(board, o, indexes);
    close();
    const u = useUI.getState();
    u.select(ids);
    // A long document can run far past the edge of the view, so make sure all of it can be seen.
    const bounds = selectionBounds(board.store, ids);
    const view = useViewport.getState().visibleRect();
    if (bounds) {
      const outside =
        bounds.x < view.x ||
        bounds.y < view.y ||
        bounds.x + bounds.w > view.x + view.w ||
        bounds.y + bounds.h > view.y + view.h;
      if (outside) useViewport.getState().fit(bounds);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = parsePageRanges(range, total);
    if ('error' in parsed) setError(parsed.error);
    else extract(parsed.pages);
  };

  const row =
    'flex w-full items-center justify-between gap-3 rounded-md px-2.5 py-1.5 text-left text-sm whitespace-nowrap hover:bg-hover';
  return (
    <div className="relative">
      <IconButton label="Extract pages" active={isOpen} onClick={toggle} data-testid="doc-extract">
        <FileOutput size={18} />
      </IconButton>
      {isOpen && (
        <Dropdown className={`${panel} pop left-1/2 w-64 -translate-x-1/2 p-1.5`}>
          <p className="px-2.5 pt-1 pb-1.5 text-xs font-semibold text-muted">Extract as separate pages</p>
          <button
            type="button"
            className={row}
            onClick={() => extract([shown])}
            data-testid="extract-current"
          >
            This page
            <span className="text-xs text-muted">Page {shown + 1}</span>
          </button>
          <button
            type="button"
            className={row}
            onClick={() => extract(o.pages.map((_, i) => i))}
            data-testid="extract-all"
          >
            Entire document
            <span className="text-xs text-muted">
              {total} {total === 1 ? 'page' : 'pages'}
            </span>
          </button>
          <div className="my-1.5 h-px bg-line" />
          <form onSubmit={submit} className="px-2.5 pb-1.5">
            <label className="text-sm" htmlFor="extract-range">
              Custom range
            </label>
            <div className="mt-1 flex gap-1.5">
              <input
                id="extract-range"
                autoFocus
                value={range}
                placeholder={total > 1 ? `e.g. 1-${Math.min(3, total)}, ${total}` : '1'}
                onChange={(e) => {
                  setRange(e.target.value);
                  setError(null);
                }}
                onKeyDown={(e) => e.stopPropagation()}
                className="field field-sm flex-1"
                data-testid="extract-range"
              />
              <button
                type="submit"
                className="btn btn-sm btn-primary h-[1.875rem]!"
                data-testid="extract-apply"
              >
                Extract
              </button>
            </div>
            {error && (
              <p className="mt-1.5 text-xs whitespace-normal text-danger" data-testid="extract-error">
                {error}
              </p>
            )}
          </form>
        </Dropdown>
      )}
    </div>
  );
}

/** Page turning, for viewers too, plus putting the pages on the board and getting the PDF back. */
function DocumentControls({ o }: { o: DocumentObject }) {
  const board = useBoard();
  const readOnly = useUI((s) => s.readOnly);
  const shown = useDocumentPage(o);
  const last = o.pages.length - 1;
  const go = (page: number) => {
    const next = Math.max(0, Math.min(last, page));
    useUI.getState().setDocumentPage(o.id, next);
    if (!readOnly && !o.locked) patch(board, o.id, { page: next });
  };
  return (
    <>
      <span
        className="max-w-36 truncate px-2 text-[13px] font-semibold"
        data-tip={o.title}
        data-testid="doc-title"
      >
        {o.title}
      </span>
      <IconButton
        label="Previous page"
        disabled={shown === 0}
        onClick={() => go(shown - 1)}
        data-testid="doc-prev"
      >
        <ChevronLeft size={18} />
      </IconButton>
      <input
        key={shown}
        defaultValue={shown + 1}
        inputMode="numeric"
        aria-label="Page number"
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
        onBlur={(e) => {
          const n = Math.round(Number(e.currentTarget.value));
          const target = Number.isFinite(n) && n >= 1 ? Math.min(n - 1, last) : shown;
          if (target !== shown) go(target);
          e.currentTarget.value = String(target + 1);
        }}
        className="num h-8 w-9 rounded-md bg-transparent text-center text-xs outline-none hover:bg-hover focus:bg-hover"
        data-testid="doc-page"
      />
      <span className="pr-1 text-xs whitespace-nowrap text-muted" data-testid="doc-count">
        of {o.pages.length}
      </span>
      <IconButton
        label="Next page"
        disabled={shown >= last}
        onClick={() => go(shown + 1)}
        data-testid="doc-next"
      >
        <ChevronRight size={18} />
      </IconButton>
      <Divider />
      {!readOnly && <ExtractMenu o={o} shown={shown} />}
      <IconButton
        label="Download as PDF"
        onClick={() => void exportDocumentPdf(board, o).catch((e: Error) => toast(e.message, 'error'))}
        data-testid="doc-download"
      >
        <Download size={18} />
      </IconButton>
    </>
  );
}

const Divider = () => <div className="mx-0.5 h-6 w-px bg-line" />;

/** Style controls that apply to every selected object of the relevant type. */
function StyleControls({ objs, ids }: { objs: BoardObject[]; ids: string[] }) {
  const board = useBoard();
  const types = new Set(objs.map((o) => o.type));
  const only = (t: BoardObject['type']) => types.size === 1 && types.has(t);
  const first = objs[0];
  const controls: ReactNode[] = [];

  const lettered = objs.filter(hasText);
  const lead = lettered[0];
  if (lead && lettered.length === objs.length) {
    const style = (fn: (o: TextBearingObject) => ObjectPatch) => restyleText(board, ids, fn);
    const list = listKind(lead.text);
    const setList = (kind: ListKind) => style((o) => ({ text: toggleList(o.text, kind) }));
    const AlignIcon = lead.align === 'center' ? AlignCenter : lead.align === 'right' ? AlignRight : AlignLeft;
    controls.push(
      objs.length === 1 && <ConvertMenu key="convert" o={lead} />,
      <FontPicker
        key="font"
        value={lead.font}
        // The text box resizes to the new font, which has to be loaded before it can be measured.
        onPick={(font) => void ensureFont(font).then(() => style(() => ({ font })))}
      />,
      lead.type === 'text' && types.size === 1 && (
        <FontSizeControl
          key="size"
          value={lead.fontSize}
          onChange={(fontSize) => style(() => ({ fontSize }))}
        />
      ),
      <Divider key="divider-font" />,
      <ToggleMenu
        key="format"
        id="format"
        label="Text format"
        icon={<Bold size={18} />}
        active={lead.bold || lead.italic || lead.underline || lead.strike}
        testId="text-format"
      >
        <IconButton
          label={`Bold (${MOD} B)`}
          active={lead.bold}
          onClick={() => style(() => ({ bold: !lead.bold }))}
          data-testid="format-bold"
        >
          <Bold size={18} />
        </IconButton>
        <IconButton
          label={`Italic (${MOD} I)`}
          active={lead.italic}
          onClick={() => style(() => ({ italic: !lead.italic }))}
          data-testid="format-italic"
        >
          <Italic size={18} />
        </IconButton>
        <IconButton
          label={`Underline (${MOD} U)`}
          active={lead.underline}
          onClick={() => style(() => ({ underline: !lead.underline }))}
          data-testid="format-underline"
        >
          <Underline size={18} />
        </IconButton>
        <IconButton
          label={`Strikethrough (${MOD} Shift X)`}
          active={lead.strike}
          onClick={() => style(() => ({ strike: !lead.strike }))}
          data-testid="format-strike"
        >
          <Strikethrough size={18} />
        </IconButton>
      </ToggleMenu>,
      <ToggleMenu key="align" id="align" label="Align" icon={<AlignIcon size={18} />} testId="text-align">
        <IconButton
          label="Align left"
          active={lead.align === 'left'}
          onClick={() => style(() => ({ align: 'left' }))}
          data-testid="align-left"
        >
          <AlignLeft size={18} />
        </IconButton>
        <IconButton
          label="Align center"
          active={lead.align === 'center'}
          onClick={() => style(() => ({ align: 'center' }))}
          data-testid="align-center"
        >
          <AlignCenter size={18} />
        </IconButton>
        <IconButton
          label="Align right"
          active={lead.align === 'right'}
          onClick={() => style(() => ({ align: 'right' }))}
          data-testid="align-right"
        >
          <AlignRight size={18} />
        </IconButton>
      </ToggleMenu>,
      <ToggleMenu
        key="list"
        id="list"
        label="List"
        icon={list === 'number' ? <ListOrdered size={18} /> : <List size={18} />}
        active={!!list}
        testId="text-list"
      >
        <IconButton
          label={`Bulleted list (${MOD} Shift 8)`}
          active={list === 'bullet'}
          onClick={() => setList('bullet')}
          data-testid="list-bullet"
        >
          <List size={18} />
        </IconButton>
        <IconButton
          label={`Numbered list (${MOD} Shift 7)`}
          active={list === 'number'}
          onClick={() => setList('number')}
          data-testid="list-number"
        >
          <ListOrdered size={18} />
        </IconButton>
      </ToggleMenu>,
      <LinkMenu key="link" value={lead.link} onSet={(link) => style(() => ({ link }))} />,
      <Divider key="divider-format" />,
    );
  }
  if (only('sticky') && first?.type === 'sticky') {
    controls.push(
      <ColorPicker
        key="sticky"
        label="Sticky color"
        value={first.color}
        colors={STICKY_COLORS}
        onPick={(color) => {
          updateEach(board, ids, (o) => (o.type === 'sticky' ? { color } : null));
          useUI.getState().setStickyColor(color);
        }}
      />,
    );
  }
  const shapes = objs.filter(isShapeObject);
  if (shapes.length && shapes.length === objs.length) {
    controls.push(
      <ColorPicker
        key="fill"
        label="Fill"
        value={shapes[0]!.fill}
        colors={FILL_COLORS}
        onPick={(fill) => updateEach(board, ids, (o) => (isShapeObject(o) ? { fill } : null))}
      />,
      <ColorPicker
        key="stroke"
        label="Border"
        value={shapes[0]!.stroke}
        colors={['transparent', ...STROKE_COLORS]}
        onPick={(stroke) => updateEach(board, ids, (o) => (isShapeObject(o) ? { stroke } : null))}
      />,
      <ColorPicker
        key="shape-text"
        label="Text color"
        value={shapes[0]!.textColor}
        colors={STROKE_COLORS}
        icon={
          <ColorIcon color={shapes[0]!.textColor}>
            <span className="text-sm leading-none font-semibold">A</span>
          </ColorIcon>
        }
        onPick={(textColor) => updateEach(board, ids, (o) => (isShapeObject(o) ? { textColor } : null))}
      />,
      shapes.every((o) => hasCorners(o.type)) && <CornerMenu key="corners" shapes={shapes} ids={ids} />,
    );
  }
  if (only('text') && first?.type === 'text') {
    controls.push(
      <ColorPicker
        key="text"
        label="Text color"
        value={first.color}
        colors={STROKE_COLORS}
        icon={
          <ColorIcon color={first.color}>
            <span className="text-sm leading-none font-semibold">A</span>
          </ColorIcon>
        }
        onPick={(color) => updateEach(board, ids, (o) => (o.type === 'text' ? { color } : null))}
      />,
      <ColorPicker
        key="highlight"
        label="Highlight"
        value={first.highlight}
        colors={HIGHLIGHT_COLORS}
        icon={
          <ColorIcon color={first.highlight}>
            <Highlighter size={15} />
          </ColorIcon>
        }
        onPick={(highlight) => updateEach(board, ids, (o) => (o.type === 'text' ? { highlight } : null))}
      />,
      <Divider key="divider-color" />,
      <ColorPicker
        key="background"
        label="Background"
        value={first.background}
        colors={FILL_COLORS}
        onPick={(background) => updateEach(board, ids, (o) => (o.type === 'text' ? { background } : null))}
      />,
    );
  }
  if (only('pen') && first?.type === 'pen') {
    controls.push(
      <ColorPicker
        key="pen"
        label="Stroke color"
        value={first.stroke}
        colors={STROKE_COLORS}
        onPick={(stroke) => updateEach(board, ids, (o) => (o.type === 'pen' ? { stroke } : null))}
      />,
    );
  }
  if (only('frame') && first?.type === 'frame' && objs.length === 1) {
    controls.push(
      <input
        key={`name-${first.id}`}
        defaultValue={first.name}
        aria-label="Frame name"
        maxLength={80}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
        onBlur={(e) => {
          const name = e.currentTarget.value.trim();
          if (name && name !== first.name) updateEach(board, ids, () => ({ name }));
        }}
        className="field field-sm mx-1 w-36!"
      />,
      <ColorPicker
        key="frame-fill"
        label="Frame background"
        value={first.fill}
        colors={FILL_COLORS}
        onPick={(fill) => updateEach(board, ids, (o) => (o.type === 'frame' ? { fill } : null))}
      />,
    );
  }
  if (only('table') && first?.type === 'table' && objs.length === 1) {
    const active = useUI.getState().activeCell;
    const cell = active?.id === first.id ? active : null;
    const label = (t: string) => <span className="px-0.5 text-xs font-medium">{t}</span>;
    controls.push(
      <IconButton
        key="add-row"
        label="Add row"
        onClick={() => addTableRow(board, first, cell?.rowId)}
        data-testid="table-add-row"
      >
        <Rows2 size={16} />
        {label('+')}
      </IconButton>,
      <IconButton
        key="del-row"
        label="Delete row"
        disabled={first.rows.length <= 1}
        onClick={() => deleteTableRow(board, first, cell?.rowId)}
        data-testid="table-delete-row"
      >
        <Rows2 size={16} />
        {label('−')}
      </IconButton>,
      <IconButton
        key="add-col"
        label="Add column"
        onClick={() => addTableColumn(board, first, cell?.colId)}
        data-testid="table-add-column"
      >
        <Columns2 size={16} />
        {label('+')}
      </IconButton>,
      <IconButton
        key="del-col"
        label="Delete column"
        disabled={first.columns.length <= 1}
        onClick={() => deleteTableColumn(board, first, cell?.colId)}
        data-testid="table-delete-column"
      >
        <Columns2 size={16} />
        {label('−')}
      </IconButton>,
      <button
        key="header"
        type="button"
        aria-pressed={first.headerRow}
        data-tip="Header row"
        onClick={() => updateEach(board, ids, () => ({ headerRow: !first.headerRow }))}
        className={`h-9 rounded-[7px] px-2 text-xs font-semibold ${first.headerRow ? 'bg-selected text-on-selected' : 'hover:bg-hover'}`}
      >
        Header
      </button>,
    );
  }
  if (only('chart') && first?.type === 'chart' && objs.length === 1) {
    controls.push(
      <button
        key="edit-chart"
        type="button"
        onClick={() => useUI.getState().setChartEditor(first.id)}
        className="flex h-9 items-center gap-1.5 rounded-[7px] px-2 text-xs font-semibold hover:bg-hover"
        data-testid="chart-edit"
      >
        <ChartColumn size={16} /> Edit data
      </button>,
    );
  }
  if (only('connector') && first?.type === 'connector') {
    const conn = (fn: (c: ConnectorObject) => ObjectPatch) =>
      updateEach(board, ids, (o) => (o.type === 'connector' ? fn(o) : null));
    controls.push(
      <CapMenu
        key="start"
        which="start"
        value={first.startCap}
        onPick={(startCap) => conn(() => ({ startCap }))}
      />,
      <IconButton
        key="swap"
        label="Swap line ends"
        onClick={() => conn((c) => ({ startCap: c.endCap, endCap: c.startCap }))}
        data-testid="line-swap"
      >
        <RefreshCw size={18} />
      </IconButton>,
      <CapMenu key="end" which="end" value={first.endCap} onPick={(endCap) => conn(() => ({ endCap }))} />,
      <Divider key="divider-caps" />,
      <ToggleMenu
        key="type"
        id="line-type"
        label="Line type"
        icon={
          <span className="flex flex-col items-center leading-none">
            <RoutingIcon routing={first.routing} />
            <span className="mt-0.5 text-[9px]">Type</span>
          </span>
        }
        testId="line-type"
      >
        {LINE_ROUTINGS.map((routing) => (
          <IconButton
            key={routing}
            label={ROUTING_LABELS[routing]}
            active={first.routing === routing}
            // A bend is only meaningful along the route it was made on.
            onClick={() => conn(() => ({ routing, bend: null }))}
            data-testid={`route-${routing}`}
          >
            <RoutingIcon routing={routing} />
          </IconButton>
        ))}
      </ToggleMenu>,
      <ColorPicker
        key="line"
        label="Line color"
        value={first.stroke}
        colors={STROKE_COLORS}
        onPick={(stroke) => conn(() => ({ stroke }))}
      />,
      <LineStyleMenu
        key="style"
        dash={first.dash}
        width={first.strokeWidth}
        onDash={(dash) => conn(() => ({ dash }))}
        onWidth={(strokeWidth) => conn(() => ({ strokeWidth }))}
      />,
      <Divider key="divider-style" />,
      <IconButton
        key="label"
        label="Add text to line"
        active={!!first.label}
        disabled={objs.length > 1}
        onClick={() => useUI.getState().setEditingLabel(first.id)}
        data-testid="line-label"
      >
        <Type size={18} />
      </IconButton>,
    );
  }
  if (!controls.length) return null;
  return (
    <>
      {controls}
      <Divider />
    </>
  );
}

/** Width × height tag under the selection ("Show object size"), live while resizing. */
export function ObjectSizeTag() {
  const board = useBoard();
  useDocVersion(board);
  const show = usePrefs((s) => s.showObjectSize);
  const selectedIds = useUI((s) => s.selectedIds);
  const live = useUI((s) => s.liveSize);
  const camera = useViewport((s) => s.camera);
  if (!show || selectedIds.length !== 1) return null;
  const o = board.store.get(selectedIds[0]!);
  const bounds = board.store.getBounds(selectedIds[0]!);
  if (!o || o.type === 'connector' || !bounds) return null;
  const at = worldToScreen(camera, { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h });
  const size = live ?? o;
  const pos = live ?? at;
  return (
    <div
      className="pointer-events-none absolute z-10 -translate-x-1/2 num rounded bg-teal px-1.5 py-0.5 text-[11px] text-on-teal"
      style={{ left: pos.x, top: pos.y + 10 }}
      data-testid="object-size"
    >
      {Math.round(size.w)} × {Math.round(size.h)}
    </div>
  );
}

function ToolbarBody({
  objs,
  ids,
  actions,
  title,
}: {
  objs: BoardObject[];
  ids: string[];
  actions: Actions;
  title: string;
}) {
  const board = useBoard();
  const camera = useViewport((s) => s.camera);
  const viewWidth = useViewport((s) => s.width);
  const readOnly = useUI((s) => s.readOnly);
  const [open, setOpen] = useState<string | null>(null);
  const [toolbarWidth, setToolbarWidth] = useState(440);
  const root = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const measure = () => setToolbarWidth(el.offsetWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // The canvas keeps focus where it is on pointer down, so inputs have to be told to commit.
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (root.current?.contains(e.target as Node) || isFloatingPanel(e.target)) return;
      setOpen(null);
      const active = document.activeElement;
      if (active instanceof HTMLElement && root.current?.contains(active)) active.blur();
    };
    window.addEventListener('pointerdown', onDown, true);
    return () => window.removeEventListener('pointerdown', onDown, true);
  }, []);

  const bounds = selectionBounds(board.store, ids);
  if (!bounds) return null;
  const top = worldToScreen(camera, { x: bounds.x + bounds.w / 2, y: bounds.y });
  const bottom = worldToScreen(camera, { x: 0, y: bounds.y + bounds.h }).y;
  // Sit above the Transformer's rotate handle; flip below the selection near the top edge.
  const above = top.y - ROTATE_ANCHOR_OFFSET - 64;
  const y = above > 60 ? above : bottom + 16;
  const half = toolbarWidth / 2;
  // Stay clear of the tool rail, which only sits on the left on wider screens.
  const leftEdge = viewWidth >= 640 ? RAIL_WIDTH + half : half + 8;
  const x = Math.min(Math.max(top.x, leftEdge), Math.max(leftEdge, viewWidth - half - 8));

  const locked = objs.every((o) => o.locked);
  const grouped = objs.some((o) => o.groupId);
  const only = objs.length === 1 ? objs[0] : undefined;
  const pdfObject = only?.type === 'pdf' ? only : null;
  return (
    <OpenMenu.Provider value={{ open, setOpen }}>
      <div
        ref={root}
        className={`${panel} plain-bar absolute z-10 flex w-max max-w-[calc(100vw-1rem)] -translate-x-1/2 flex-wrap items-center justify-center gap-px p-1`}
        data-tip-side="top"
        style={{ left: x, top: y }}
        onPointerDown={(e) => e.stopPropagation()}
        data-testid="selection-toolbar"
      >
        {pdfObject && <DocumentControls o={pdfObject} />}
        {pdfObject && <Divider />}
        {!locked && !readOnly && <StyleControls objs={objs} ids={ids} />}
        {!locked &&
          !readOnly &&
          (grouped ? (
            <IconButton label="Ungroup (Ctrl Shift G)" onClick={actions.ungroup}>
              <Ungroup size={18} />
            </IconButton>
          ) : (
            objs.length > 1 && (
              <IconButton label="Group (Ctrl G)" onClick={actions.group}>
                <Group size={18} />
              </IconButton>
            )
          ))}
        {!board.anonymous && !readOnly && (
          <IconButton
            label="Comment"
            onClick={() => useUI.getState().setCommentDraft({ x: bounds.x + bounds.w, y: bounds.y })}
            data-testid="selection-comment"
          >
            <MessageCircleMore size={18} />
          </IconButton>
        )}
        {!readOnly && (
          <>
            <IconButton
              label={locked ? 'Unlock (Ctrl Shift L)' : 'Lock (Ctrl Shift L)'}
              active={locked}
              onClick={actions.toggleLock}
            >
              {locked ? <Lock size={18} /> : <LockOpen size={18} />}
            </IconButton>
            <MoreMenu actions={actions} title={title} />
          </>
        )}
      </div>
    </OpenMenu.Provider>
  );
}

export function SelectionToolbar({ actions, title }: { actions: Actions; title: string }) {
  const board = useBoard();
  useDocVersion(board);
  const selectedIds = useUI((s) => s.selectedIds);
  const interacting = useUI((s) => s.interacting);
  const editingId = useUI((s) => s.editingId);
  const editingCell = useUI((s) => s.editingCell);
  const editingLabel = useUI((s) => s.editingLabelId);
  const readOnly = useUI((s) => s.readOnly);
  const objs = selectedIds.map((id) => board.store.get(id)).filter((o) => o !== undefined);
  // Viewers only get a toolbar for turning the pages of a document.
  const viewerUse = objs.length === 1 && objs[0]?.type === 'pdf';
  const editing = editingId || editingCell || editingLabel;
  if (!objs.length || interacting || editing || (readOnly && !viewerUse)) return null;
  return (
    <ToolbarBody key={selectedIds.join()} objs={objs} ids={selectedIds} actions={actions} title={title} />
  );
}
