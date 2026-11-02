import {
  buildLayers,
  getMetaMap,
  hasText,
  isShapeObject,
  type BoardObject,
  type LayerNode,
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
import { memo, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { SHAPE_LABELS } from '../canvas/shapePaths';
import type { Board } from '../doc/board';
import { useBoard, useDocVersion } from '../doc/context';
import { toggleLock, ungroup } from '../doc/ops';
import { useUI } from '../state/ui';
import { useViewport } from '../state/viewport';
import { panel } from './IconButton';

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

const rowClass = (selected: boolean) =>
  `group flex h-8 items-center gap-1.5 rounded-md pr-1 text-sm ${
    selected
      ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-500/20 dark:text-indigo-200'
      : 'hover:bg-gray-100 dark:hover:bg-zinc-800'
  }`;

const rowAction = 'rounded p-1 text-gray-500 hover:bg-black/5 dark:text-zinc-400 dark:hover:bg-white/10';

interface ObjectRowProps {
  id: string;
  name: string;
  Icon: LucideIcon;
  locked: boolean;
  selected: boolean;
  nested: boolean;
  readOnly: boolean;
}

const ObjectRow = memo(function ObjectRow({
  id,
  name,
  Icon,
  locked,
  selected,
  nested,
  readOnly,
}: ObjectRowProps) {
  const board = useBoard();
  return (
    <li
      className={rowClass(selected)}
      style={{ paddingLeft: nested ? 28 : 8 }}
      data-layer={id}
      data-testid="layer-row"
      onMouseEnter={() => ui().setLayerHover([id])}
      onMouseLeave={() => ui().setLayerHover([])}
    >
      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-2 py-1 text-left"
        title="Click to select, double-click to zoom to it"
        onClick={(e) => selectRows([id], e.shiftKey || e.ctrlKey || e.metaKey)}
        onDoubleClick={() => zoomTo(board, id)}
      >
        <Icon size={15} className="shrink-0 text-gray-500 dark:text-zinc-400" />
        <span className="truncate">{name}</span>
      </button>
      {!readOnly && (
        <button
          type="button"
          aria-label={locked ? `Unlock ${name}` : `Lock ${name}`}
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
        className="mr-1 min-w-0 flex-1 rounded border border-indigo-400 px-1 text-sm outline-none dark:bg-zinc-800"
        data-testid="group-name-input"
      />
    );
  }
  return (
    <button
      type="button"
      className="flex min-w-0 flex-1 items-center gap-2 py-1 text-left font-medium"
      title={readOnly ? name : 'Click to select, double-click to rename'}
      onClick={(e) => selectRows(ids, e.shiftKey || e.ctrlKey || e.metaKey)}
      onDoubleClick={() => !readOnly && setEditing(true)}
    >
      <GroupIcon size={15} className="shrink-0 text-gray-500 dark:text-zinc-400" />
      <span className="truncate">{name}</span>
    </button>
  );
}

function GroupRows({
  node,
  selected,
  readOnly,
}: {
  node: Extract<LayerNode<BoardObject>, { kind: 'group' }>;
  selected: ReadonlySet<string>;
  readOnly: boolean;
}) {
  const board = useBoard();
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
        className={rowClass(allSelected)}
        style={{ paddingLeft: 2 }}
        data-testid="layer-group"
        onMouseEnter={() => ui().setLayerHover(ids)}
        onMouseLeave={() => ui().setLayerHover([])}
      >
        <button
          type="button"
          aria-label={collapsed ? 'Expand group' : 'Collapse group'}
          aria-expanded={!collapsed}
          onClick={() => setCollapsed((c) => !c)}
          className={rowAction}
          data-testid="layer-group-toggle"
        >
          <Chevron size={14} />
        </button>
        <GroupName groupId={node.groupId} fallback={`Group ${node.number}`} ids={ids} />
        {!readOnly && (
          <>
            <button
              type="button"
              aria-label="Ungroup"
              title="Ungroup"
              onClick={() => ungroup(board, ids)}
              className={`${rowAction} opacity-0 group-hover:opacity-100 focus:opacity-100`}
            >
              <Ungroup size={13} />
            </button>
            <button
              type="button"
              aria-label={allLocked ? 'Unlock group' : 'Lock group'}
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
            nested
            readOnly={readOnly}
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
        title="Layers"
        aria-label="Open layers"
        className="absolute top-1/2 right-0 z-10 hidden -translate-y-1/2 flex-col items-center gap-1.5 rounded-l-xl bg-white py-3 pr-1.5 pl-2 text-xs font-medium text-gray-700 shadow-[0_1px_8px_rgba(5,0,56,0.14)] hover:text-indigo-600 sm:flex dark:bg-zinc-900 dark:text-zinc-300 dark:shadow-[0_1px_8px_rgba(0,0,0,0.5)] dark:ring-1 dark:ring-white/10 dark:hover:text-indigo-400"
        data-testid="layers-tab"
      >
        <LayersIcon size={16} />
        <span style={{ writingMode: 'vertical-rl' }}>Layers</span>
      </button>
    );
  }

  return (
    <aside
      className={`${panel} absolute top-[72px] right-3 bottom-16 z-20 flex w-64 max-w-[calc(100%-1.5rem)] flex-col`}
      data-testid="layers-panel"
    >
      <div className="flex items-center gap-2 border-b border-gray-200 px-3 py-2.5 dark:border-zinc-700">
        <LayersIcon size={16} />
        <h2 className="text-sm font-semibold">Layers</h2>
        <button
          type="button"
          aria-label="Collapse layers"
          title="Collapse"
          onClick={toggle}
          className="ml-auto rounded p-0.5 hover:bg-gray-100 dark:hover:bg-zinc-800"
          data-testid="layers-collapse"
        >
          <PanelRightClose size={16} />
        </button>
      </div>
      <ul
        ref={list}
        className="flex-1 overflow-y-auto p-1.5"
        onMouseLeave={() => ui().setLayerHover([])}
        data-testid="layer-list"
      >
        {nodes.length === 0 && (
          <li className="flex flex-col items-center gap-2 p-6 text-center text-sm text-gray-500 dark:text-zinc-400">
            <FileText size={20} />
            Everything you add to the board is listed here.
          </li>
        )}
        {nodes.map((node) =>
          node.kind === 'group' ? (
            <GroupRows key={node.groupId} node={node} selected={selected} readOnly={readOnly} />
          ) : (
            <ObjectRow
              key={node.object.id}
              id={node.object.id}
              name={nameOf(node.object)}
              Icon={iconOf(node.object)}
              locked={node.object.locked}
              selected={selected.has(node.object.id)}
              nested={false}
              readOnly={readOnly}
            />
          ),
        )}
      </ul>
    </aside>
  );
}
