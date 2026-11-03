import {
  buildLayers,
  getMetaMap,
  hasText,
  isShapeObject,
  type BoardObject,
  type LayerNode,
  type LayerTarget,
} from '@canvasly/shared';
import {
  ChartColumn,
  ChevronDown,
  ChevronRight,
  Circle,
  FileText,
  Frame,
  Group as GroupIcon,
  Highlighter,
  Image as ImageIcon,
  Layers as LayersIcon,
  Lock,
  LockOpen,
  Minus,
  MoveUpRight,
  PanelRightClose,
  Pencil,
  Shapes,
  Square,
  StickyNote,
  Table,
  Type,
  Ungroup,
  type LucideIcon,
} from 'lucide-react';
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';
import { SHAPE_LABELS } from '../canvas/shapePaths';
import type { Board } from '../doc/board';
import { useBoard, useDocVersion } from '../doc/context';
import { reorderLayers, toggleLock, ungroup } from '../doc/ops';
import { useUI } from '../state/ui';
import { useViewport } from '../state/viewport';
import { SidePanel } from './SidePanel';

const ui = () => useUI.getState();

function iconOf(o: BoardObject): LucideIcon {
  switch (o.type) {
    case 'frame':
      return Frame;
    case 'sticky':
      return StickyNote;
    case 'text':
      return Type;
    case 'pen':
      return o.opacity < 1 ? Highlighter : Pencil;
    case 'image':
      return ImageIcon;
    case 'pdf':
      return FileText;
    case 'table':
      return Table;
    case 'chart':
      return ChartColumn;
    case 'connector':
      return o.endCap === 'none' && o.startCap === 'none' ? Minus : MoveUpRight;
    case 'ellipse':
      return Circle;
    case 'rect':
    case 'roundrect':
      return Square;
    default:
      return Shapes;
  }
}

function nameOf(o: BoardObject): string {
  if (o.type === 'frame') return o.name || 'Frame';
  if (o.type === 'chart') return o.title || 'Chart';
  if (o.type === 'pdf') return o.title || 'Document';
  if (hasText(o)) {
    const line = o.text.split('\n').find((l) => l.trim());
    if (line) return line.trim().slice(0, 60);
    if (o.type === 'text') return 'Text';
    if (o.type === 'sticky') return 'Sticky note';
  }
  if (isShapeObject(o)) return SHAPE_LABELS[o.type];
  switch (o.type) {
    case 'pen':
      return o.opacity < 1 ? 'Highlight' : 'Drawing';
    case 'image':
      return 'Image';
    case 'table':
      return 'Table';
    case 'connector':
      return o.endCap === 'none' && o.startCap === 'none' ? 'Line' : 'Arrow';
    default:
      return 'Object';
  }
}

const groupKey = (groupId: string) => `groupName:${groupId}`;

/** Group names sit beside the objects, not on them, so that a group needs no object of its own. */
function useGroupName(board: Board, groupId: string): string | null {
  const meta = getMetaMap(board.doc);
  const subscribe = useCallback(
    (cb: () => void) => {
      meta.observe(cb);
      return () => meta.unobserve(cb);
    },
    [meta],
  );
  return useSyncExternalStore(subscribe, () => (meta.get(groupKey(groupId)) as string | undefined) ?? null);
}

/** Plain click selects; Shift or Ctrl/Cmd click adds or removes. */
function selectRows(ids: string[], additive: boolean) {
  const { selectedIds, select } = ui();
  if (!additive) {
    select(ids);
    return;
  }
  const allIn = ids.every((id) => selectedIds.includes(id));
  select(allIn ? selectedIds.filter((id) => !ids.includes(id)) : [...new Set([...selectedIds, ...ids])]);
}

function zoomTo(board: Board, id: string) {
  const b = board.store.getBounds(id);
  if (b) useViewport.getState().fit(b);
}

const rowClass = (selected: boolean, moving: boolean) =>
  `group flex h-7 select-none items-center gap-1 rounded-md pr-0.5 text-[13px] ${
    selected ? 'bg-selected text-on-selected' : 'hover:bg-hover'
  } ${moving ? 'opacity-40' : ''}`;

const rowAction = 'rounded p-1 text-muted hover:bg-black/5 hover:text-fg dark:hover:bg-white/10';

/** How far in from the list's edge a drop below a group's last row counts as inside the group. */
const NEST_X = 34;
const DRAG_START = 4;
const SCROLL_EDGE = 28;
const SCROLL_SPEED = 7;

/** Hovering highlights the object on the canvas, which would only flicker while dragging across rows. */
let dragInProgress = false;
const hover = (ids: string[]) => {
  if (!dragInProgress) ui().setLayerHover(ids);
};

interface MoveContext {
  ids: ReadonlySet<string>;
  /** A whole group is on the move, and groups don't go inside each other. */
  keepsGroups: boolean;
  onlyFrames: boolean;
  noFrames: boolean;
}

function moveContext(board: Board, ids: ReadonlySet<string>): MoveContext {
  const sorted = board.store.getSorted();
  const moving = sorted.filter((o) => ids.has(o.id));
  const keepsGroups = moving.some(
    (o) => o.groupId && sorted.every((other) => other.groupId !== o.groupId || ids.has(other.id)),
  );
  const frames = moving.filter((o) => o.type === 'frame').length;
  return { ids, keepsGroups, onlyFrames: frames === moving.length, noFrames: frames === 0 };
}

const rowsOf = (list: HTMLElement) => [...list.querySelectorAll<HTMLElement>('[data-row]')];

interface Drop {
  target: LayerTarget;
  /** Where to draw the line, in the list's scrolling coordinates. */
  top: number;
  nested: boolean;
}

/**
 * What dropping into the gap before row `gap` means. Only places the canvas can show are on offer: frames stay
 * beneath other objects, and a group can't go inside another. `y` says which end of such a group to use.
 */
function dropAt(list: HTMLElement, gap: number, nest: boolean, y: number, context: MoveContext): Drop {
  const rows = rowsOf(list);
  let i = gap;
  const firstFrame = rows.findIndex((r) => r.dataset.frame !== undefined);
  if (firstFrame >= 0) {
    if (context.onlyFrames) i = Math.max(i, firstFrame);
    else if (context.noFrames) i = Math.min(i, firstFrame);
  }
  let groupId = rows[i]?.dataset.memberOf ?? (nest ? rows[i - 1]?.dataset.memberOf : undefined) ?? null;
  if (groupId && context.keepsGroups) {
    const head = rows.findIndex((r) => r.dataset.groupHead === groupId);
    const last = rows.findLastIndex((r) => r.dataset.memberOf === groupId);
    const middle = (rows[head]!.getBoundingClientRect().top + rows[last]!.getBoundingClientRect().bottom) / 2;
    i = y < middle ? head : last + 1;
    groupId = null;
  }
  const next = rows[i];
  const bounds = list.getBoundingClientRect();
  const edge = next
    ? next.getBoundingClientRect().top
    : (rows.at(-1)?.getBoundingClientRect().bottom ?? bounds.top);
  return {
    target: { beforeId: next?.dataset.first ?? null, groupId },
    top: edge - bounds.top + list.scrollTop,
    nested: groupId !== null,
  };
}

/** Everything that goes along when a row is moved: the row's objects, or the whole selection if they're part of it. */
function idsToMove(rowIds: string[]): Set<string> {
  const { selectedIds } = ui();
  return new Set(rowIds.every((id) => selectedIds.includes(id)) ? selectedIds : rowIds);
}

interface DragView {
  ids: ReadonlySet<string>;
  label: string;
  x: number;
  y: number;
  drop: Drop | null;
}

/** Drags rows with the mouse or a pen. Touch is left to scroll the list. */
function useLayerDrag(list: RefObject<HTMLUListElement | null>) {
  const board = useBoard();
  const [view, setView] = useState<DragView | null>(null);

  const begin = useCallback(
    (e: ReactPointerEvent, rowIds: string[], name: string) => {
      const down = e.target as Element;
      if (e.button !== 0 || e.pointerType === 'touch' || down.closest('[data-no-drag], input')) return;
      const startX = e.clientX;
      const startY = e.clientY;
      const ids = idsToMove(rowIds);
      const context = moveContext(board, ids);
      const label = ids.size > rowIds.length ? `${name} +${ids.size - rowIds.length}` : name;
      let x = startX;
      let y = startY;
      let dragging = false;
      let drop: Drop | null = null;
      let frame = 0;

      const update = () => {
        const el = list.current;
        if (!el) return;
        const rows = rowsOf(el);
        const gap = rows.findIndex((r) => {
          const b = r.getBoundingClientRect();
          return y < b.top + b.height / 2;
        });
        const inset = x - el.getBoundingClientRect().left;
        drop = dropAt(el, gap < 0 ? rows.length : gap, inset > NEST_X, y, context);
        setView({ ids, label, x, y, drop });
      };
      const autoScroll = () => {
        const el = list.current;
        if (el) {
          const b = el.getBoundingClientRect();
          const before = el.scrollTop;
          if (y < b.top + SCROLL_EDGE) el.scrollTop -= SCROLL_SPEED;
          else if (y > b.bottom - SCROLL_EDGE) el.scrollTop += SCROLL_SPEED;
          if (el.scrollTop !== before) update();
        }
        frame = requestAnimationFrame(autoScroll);
      };
      const stop = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', stop);
        window.removeEventListener('keydown', onKey, true);
        cancelAnimationFrame(frame);
        document.body.style.cursor = '';
        dragInProgress = false;
        setView(null);
      };
      const onMove = (ev: PointerEvent) => {
        x = ev.clientX;
        y = ev.clientY;
        if (!dragging) {
          if (Math.hypot(x - startX, y - startY) < DRAG_START) return;
          dragging = true;
          dragInProgress = true;
          ui().setLayerHover([]);
          document.body.style.cursor = 'grabbing';
          frame = requestAnimationFrame(autoScroll);
        }
        update();
      };
      const onUp = () => {
        const dropped = dragging ? drop : null;
        const wasDragging = dragging;
        stop();
        if (!wasDragging) return;
        // The release also counts as a click on whichever row it's over, which would change the selection.
        const swallow = (ev: MouseEvent) => ev.stopPropagation();
        window.addEventListener('click', swallow, { capture: true, once: true });
        setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 50);
        if (dropped) {
          reorderLayers(board, ids, dropped.target);
          ui().select([...ids]);
        }
      };
      const onKey = (ev: KeyboardEvent) => {
        if (ev.key !== 'Escape' || !dragging) return;
        ev.stopPropagation();
        stop();
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', stop);
      window.addEventListener('keydown', onKey, true);
    },
    [board, list],
  );

  /** Alt + up or down moves a row one place, for anyone not dragging. */
  const onKeyDown = useCallback(
    (e: ReactKeyboardEvent, rowIds: string[]) => {
      if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
      const el = list.current;
      if (!el) return;
      e.preventDefault();
      e.stopPropagation();
      const ids = idsToMove(rowIds);
      const rows = rowsOf(el);
      const sorted = board.store.getSorted();
      // A group's header only counts as moving with the whole group, not just its top member.
      const moving = (r: HTMLElement) => {
        const head = r.dataset.groupHead;
        if (!head) return ids.has(r.dataset.first!);
        return sorted.every((o) => o.groupId !== head || ids.has(o.id));
      };
      const first = rows.findIndex(moving);
      const last = rows.findLastIndex(moving);
      const up = e.key === 'ArrowUp';
      const leavesGroup = !up && rows[last]!.dataset.memberOf && !rows[last + 1]?.dataset.memberOf;
      const gap = up ? first - 1 : leavesGroup ? last + 1 : last + 2;
      if (gap < 0 || gap > rows.length) return;
      const drop = dropAt(el, gap, false, up ? -Infinity : Infinity, moveContext(board, ids));
      reorderLayers(board, ids, drop.target);
      // Moving a row in the page can take the keyboard focus off it.
      const row =
        rowIds.length === 1
          ? `[data-layer="${CSS.escape(rowIds[0]!)}"]`
          : `[data-group-head][data-first="${CSS.escape(rowIds[0]!)}"]`;
      requestAnimationFrame(() => el.querySelector<HTMLElement>(`${row} [data-row-main]`)?.focus());
    },
    [board, list],
  );

  return { view, begin, onKeyDown };
}

type BeginDrag = ReturnType<typeof useLayerDrag>['begin'];
type RowKeyDown = ReturnType<typeof useLayerDrag>['onKeyDown'];

interface ObjectRowProps {
  id: string;
  name: string;
  Icon: LucideIcon;
  locked: boolean;
  selected: boolean;
  /** The group it's listed in. */
  memberOf: string | null;
  /** A frame outside any group, which has to stay below everything but other frames. */
  frame: boolean;
  moving: boolean;
  readOnly: boolean;
  onBeginDrag: BeginDrag;
  onRowKey: RowKeyDown;
}

const ObjectRow = memo(function ObjectRow({
  id,
  name,
  Icon,
  locked,
  selected,
  memberOf,
  frame,
  moving,
  readOnly,
  onBeginDrag,
  onRowKey,
}: ObjectRowProps) {
  const board = useBoard();
  return (
    <li
      className={rowClass(selected, moving)}
      style={{ paddingLeft: memberOf ? 26 : 6 }}
      data-layer={id}
      data-row
      data-first={id}
      data-member-of={memberOf ?? undefined}
      data-frame={frame ? '' : undefined}
      data-testid="layer-row"
      onMouseEnter={() => hover([id])}
      onMouseLeave={() => hover([])}
      onPointerDown={readOnly ? undefined : (e) => onBeginDrag(e, [id], name)}
      onKeyDown={readOnly ? undefined : (e) => onRowKey(e, [id])}
    >
      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-2 py-1 text-left"
        data-row-main
        data-tip={
          readOnly
            ? 'Click to select, double-click to zoom to it'
            : 'Click to select, drag to rearrange, double-click to zoom to it'
        }
        onClick={(e) => selectRows([id], e.shiftKey || e.ctrlKey || e.metaKey)}
        onDoubleClick={() => zoomTo(board, id)}
      >
        <Icon size={14} className="shrink-0 opacity-70" />
        <span className="truncate">{name}</span>
      </button>
      {!readOnly && (
        <button
          type="button"
          aria-label={locked ? `Unlock ${name}` : `Lock ${name}`}
          data-no-drag
          onClick={() => toggleLock(board, [id])}
          className={`${rowAction} ${locked ? '' : 'opacity-0 group-hover:opacity-100 focus:opacity-100'}`}
        >
          {locked ? <Lock size={13} /> : <LockOpen size={13} />}
        </button>
      )}
    </li>
  );
});

function GroupName({ groupId, fallback, ids }: { groupId: string; fallback: string; ids: string[] }) {
  const board = useBoard();
  const readOnly = useUI((s) => s.readOnly);
  const saved = useGroupName(board, groupId);
  const name = saved ?? fallback;
  const [editing, setEditing] = useState(false);
  const commit = (value: string) => {
    setEditing(false);
    const next = value.trim().slice(0, 80);
    if (next && next !== name) board.transact(() => getMetaMap(board.doc).set(groupKey(groupId), next));
  };
  if (editing) {
    return (
      <input
        autoFocus
        defaultValue={name}
        aria-label="Group name"
        onFocus={(e) => e.currentTarget.select()}
        onBlur={(e) => commit(e.currentTarget.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') commit(e.currentTarget.value);
          if (e.key === 'Escape') setEditing(false);
        }}
        className="field mr-1 h-6! min-w-0 flex-1 px-1! text-[13px]!"
        data-testid="group-name-input"
      />
    );
  }
  return (
    <button
      type="button"
      className="flex min-w-0 flex-1 items-center gap-2 py-1 text-left font-semibold"
      data-row-main
      data-tip={readOnly ? name : 'Click to select, drag to rearrange, double-click to rename'}
      onClick={(e) => selectRows(ids, e.shiftKey || e.ctrlKey || e.metaKey)}
      onDoubleClick={() => !readOnly && setEditing(true)}
    >
      <GroupIcon size={14} className="shrink-0 opacity-70" />
      <span className="truncate">{name}</span>
    </button>
  );
}

function GroupRows({
  node,
  selected,
  readOnly,
  movingIds,
  onBeginDrag,
  onRowKey,
}: {
  node: Extract<LayerNode<BoardObject>, { kind: 'group' }>;
  selected: ReadonlySet<string>;
  readOnly: boolean;
  movingIds: ReadonlySet<string> | undefined;
  onBeginDrag: BeginDrag;
  onRowKey: RowKeyDown;
}) {
  const board = useBoard();
  const fallback = `Group ${node.number}`;
  const name = useGroupName(board, node.groupId) ?? fallback;
  const [collapsed, setCollapsed] = useState(false);
  const ids = node.objects.map((o) => o.id);
  const allSelected = ids.every((id) => selected.has(id));
  const anySelected = ids.some((id) => selected.has(id));

  // Selecting one member on the canvas reveals it, so that the highlight is never hidden in a closed group.
  const reveal = anySelected && !allSelected;
  useEffect(() => {
    if (reveal) setCollapsed(false);
  }, [reveal]);

  const allLocked = node.objects.every((o) => o.locked);
  const Chevron = collapsed ? ChevronRight : ChevronDown;
  return (
    <>
      <li
        className={rowClass(allSelected, !!movingIds && ids.every((id) => movingIds.has(id)))}
        style={{ paddingLeft: 2 }}
        data-row
        data-first={ids[0]}
        data-group-head={node.groupId}
        data-testid="layer-group"
        onMouseEnter={() => hover(ids)}
        onMouseLeave={() => hover([])}
        onPointerDown={readOnly ? undefined : (e) => onBeginDrag(e, ids, name)}
        onKeyDown={readOnly ? undefined : (e) => onRowKey(e, ids)}
      >
        <button
          type="button"
          aria-label={collapsed ? 'Expand group' : 'Collapse group'}
          aria-expanded={!collapsed}
          data-no-drag
          onClick={() => setCollapsed((c) => !c)}
          className={rowAction}
          data-testid="layer-group-toggle"
        >
          <Chevron size={14} />
        </button>
        <GroupName groupId={node.groupId} fallback={fallback} ids={ids} />
        {!readOnly && (
          <>
            <button
              type="button"
              aria-label="Ungroup"
              data-tip="Ungroup"
              data-no-drag
              onClick={() => ungroup(board, ids)}
              className={`${rowAction} opacity-0 group-hover:opacity-100 focus:opacity-100`}
            >
              <Ungroup size={13} />
            </button>
            <button
              type="button"
              aria-label={allLocked ? 'Unlock group' : 'Lock group'}
              data-no-drag
              onClick={() => toggleLock(board, ids)}
              className={`${rowAction} ${allLocked ? '' : 'opacity-0 group-hover:opacity-100 focus:opacity-100'}`}
            >
              {allLocked ? <Lock size={13} /> : <LockOpen size={13} />}
            </button>
          </>
        )}
      </li>
      {!collapsed &&
        node.objects.map((o) => (
          <ObjectRow
            key={o.id}
            id={o.id}
            name={nameOf(o)}
            Icon={iconOf(o)}
            locked={o.locked}
            selected={selected.has(o.id)}
            memberOf={node.groupId}
            frame={false}
            moving={!!movingIds?.has(o.id)}
            readOnly={readOnly}
            onBeginDrag={onBeginDrag}
            onRowKey={onRowKey}
          />
        ))}
    </>
  );
}

/** Everything on the board, top first, with groups as folders. Opens and closes from a tab on the right edge. */
export function LayersPanel() {
  const board = useBoard();
  const version = useDocVersion(board);
  const open = useUI((s) => s.layersPanel);
  const otherPanel = useUI((s) => s.commentsPanel || s.framesPanel || s.chartEditorId !== null);
  const selectedIds = useUI((s) => s.selectedIds);
  const readOnly = useUI((s) => s.readOnly);
  const toggle = useUI((s) => s.toggleLayersPanel);
  const list = useRef<HTMLUListElement>(null);
  const { view: drag, begin, onKeyDown } = useLayerDrag(list);

  const nodes = useMemo(
    () => (open ? buildLayers(board.store.getSorted()) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [board, version, open],
  );
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);

  // Keep the row of whatever was just selected on the canvas in view.
  const only = selectedIds.length === 1 ? selectedIds[0] : null;
  useEffect(() => {
    if (!open || !only) return;
    list.current?.querySelector(`[data-layer="${CSS.escape(only)}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [open, only]);

  if (!open) {
    if (otherPanel) return null;
    return (
      <button
        type="button"
        onClick={toggle}
        aria-label="Open layers"
        className="absolute top-1/2 right-0 z-10 hidden -translate-y-1/2 flex-col items-center gap-1.5 rounded-l-[10px] border border-r-0 border-line bg-surface py-3 pr-1.5 pl-2 text-xs font-semibold text-muted shadow-panel transition-colors duration-100 hover:text-fg sm:flex"
        data-testid="layers-tab"
      >
        <LayersIcon size={15} />
        <span style={{ writingMode: 'vertical-rl' }}>Layers</span>
      </button>
    );
  }

  return (
    <SidePanel
      title="Layers"
      icon={<LayersIcon size={15} />}
      width="w-64"
      closeLabel="Collapse layers"
      closeIcon={<PanelRightClose size={16} />}
      closeTestId="layers-collapse"
      onClose={toggle}
      testId="layers-panel"
    >
      <ul
        ref={list}
        className={`relative flex-1 overflow-y-auto p-1 ${drag ? 'cursor-grabbing [&_*]:cursor-grabbing' : ''}`}
        onMouseLeave={() => hover([])}
        data-testid="layer-list"
      >
        {nodes.length === 0 && (
          <li className="p-5 text-center text-[13px] text-muted">
            Everything you add to the board is listed here.
          </li>
        )}
        {nodes.map((node) =>
          node.kind === 'group' ? (
            <GroupRows
              key={node.groupId}
              node={node}
              selected={selected}
              readOnly={readOnly}
              movingIds={drag?.ids}
              onBeginDrag={begin}
              onRowKey={onKeyDown}
            />
          ) : (
            <ObjectRow
              key={node.object.id}
              id={node.object.id}
              name={nameOf(node.object)}
              Icon={iconOf(node.object)}
              locked={node.object.locked}
              selected={selected.has(node.object.id)}
              memberOf={null}
              frame={node.object.type === 'frame'}
              moving={!!drag?.ids.has(node.object.id)}
              readOnly={readOnly}
              onBeginDrag={begin}
              onRowKey={onKeyDown}
            />
          ),
        )}
        {drag?.drop && (
          <li
            aria-hidden
            className="pointer-events-none absolute right-1 h-0.5 -translate-y-1/2 rounded-full bg-cta"
            style={{ top: drag.drop.top, left: drag.drop.nested ? 26 : 4 }}
            data-testid="layer-drop-line"
          >
            <span className="absolute top-1/2 -left-0.5 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-cta" />
          </li>
        )}
      </ul>
      {drag && (
        <div
          className="panel pointer-events-none fixed z-[80] max-w-48 truncate px-2 py-1 text-xs font-semibold shadow-pop"
          style={{ left: drag.x + 12, top: drag.y + 10 }}
          data-testid="layer-drag-label"
        >
          {drag.label}
        </div>
      )}
    </SidePanel>
  );
}
