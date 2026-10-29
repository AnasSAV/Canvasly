import {
  STICKY_COLORS,
  STROKE_COLORS,
  isShapeObject,
  worldToScreen,
  type BoardObject,
  type ConnectorObject,
} from '@canvasly/shared';
import {
  ArrowDownToLine,
  ArrowUpToLine,
  Copy,
  CornerDownRight,
  Group,
  Lock,
  LockOpen,
  Minus,
  MoveUpRight,
  Plus,
  Trash,
  Ungroup,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import type { Actions } from '../doc/actions';
import { ROTATE_ANCHOR_OFFSET } from '../canvas/Overlay';
import { useBoard, useDocVersion } from '../doc/context';
import { selectionBounds, updateEach } from '../doc/ops';
import { useUI } from '../state/ui';
import { useViewport } from '../state/viewport';
import { IconButton, Swatch, panel } from './IconButton';

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

function ColorPicker({
  label,
  value,
  colors,
  onPick,
}: {
  label: string;
  value: string | undefined;
  colors: readonly string[];
  onPick: (c: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <div title={label} className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-gray-100">
        <Swatch color={value ?? '#ffffff'} onClick={() => setOpen((o) => !o)} />
      </div>
      {open && (
        <div className={`${panel} absolute top-11 left-1/2 grid -translate-x-1/2 grid-cols-6 gap-1.5 p-2`}>
          {colors.map((c) => (
            <Swatch
              key={c}
              color={c}
              active={c === value}
              onClick={() => {
                onPick(c);
                setOpen(false);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

const Divider = () => <div className="mx-0.5 h-6 w-px bg-gray-200" />;

/** Style controls that apply to every selected object of the relevant type. */
function StyleControls({ objs, ids }: { objs: BoardObject[]; ids: string[] }) {
  const board = useBoard();
  const types = new Set(objs.map((o) => o.type));
  const only = (t: BoardObject['type']) => types.size === 1 && types.has(t);
  const first = objs[0];
  const controls: ReactNode[] = [];

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
    );
  }
  if (only('text') && first?.type === 'text') {
    controls.push(
      <ColorPicker
        key="text"
        label="Text color"
        value={first.color}
        colors={STROKE_COLORS}
        onPick={(color) => updateEach(board, ids, (o) => (o.type === 'text' ? { color } : null))}
      />,
      <IconButton
        key="smaller"
        label="Smaller text"
        onClick={() =>
          updateEach(board, ids, (o) =>
            o.type === 'text' ? { fontSize: Math.max(8, o.fontSize - 4) } : null,
          )
        }
      >
        <Minus size={16} />
      </IconButton>,
      <span key="size" className="w-7 text-center text-sm tabular-nums text-gray-600">
        {first.fontSize}
      </span>,
      <IconButton
        key="bigger"
        label="Bigger text"
        onClick={() =>
          updateEach(board, ids, (o) =>
            o.type === 'text' ? { fontSize: Math.min(200, o.fontSize + 4) } : null,
          )
        }
      >
        <Plus size={16} />
      </IconButton>,
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
  if (only('connector') && first?.type === 'connector') {
    const conn = (fn: (c: ConnectorObject) => Partial<ConnectorObject>) =>
      updateEach(board, ids, (o) => (o.type === 'connector' ? fn(o) : null));
    controls.push(
      <ColorPicker
        key="line"
        label="Line color"
        value={first.stroke}
        colors={STROKE_COLORS}
        onPick={(stroke) => conn(() => ({ stroke }))}
      />,
      <IconButton
        key="startcap"
        label="Arrow at start"
        active={first.startCap === 'arrow'}
        onClick={() => conn((c) => ({ startCap: c.startCap === 'arrow' ? 'none' : 'arrow' }))}
      >
        <MoveUpRight size={16} className="rotate-180" />
      </IconButton>,
      <IconButton
        key="endcap"
        label="Arrow at end"
        active={first.endCap === 'arrow'}
        onClick={() => conn((c) => ({ endCap: c.endCap === 'arrow' ? 'none' : 'arrow' }))}
      >
        <MoveUpRight size={16} />
      </IconButton>,
      <IconButton
        key="routing"
        label="Elbow routing"
        active={first.routing === 'elbow'}
        onClick={() => conn((c) => ({ routing: c.routing === 'elbow' ? 'straight' : 'elbow' }))}
      >
        <CornerDownRight size={16} />
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

export function SelectionToolbar({ actions }: { actions: Actions }) {
  const board = useBoard();
  useDocVersion(board);
  const selectedIds = useUI((s) => s.selectedIds);
  const interacting = useUI((s) => s.interacting);
  const editingId = useUI((s) => s.editingId);
  const camera = useViewport((s) => s.camera);
  const width = useViewport((s) => s.width);

  const objs = selectedIds.map((id) => board.store.get(id)).filter((o) => o !== undefined);
  const bounds = selectionBounds(board.store, selectedIds);
  if (!objs.length || !bounds || interacting || editingId) return null;

  const top = worldToScreen(camera, { x: bounds.x + bounds.w / 2, y: bounds.y });
  const bottom = worldToScreen(camera, { x: 0, y: bounds.y + bounds.h }).y;
  // Sit above the Transformer's rotate handle; flip below the selection near the top edge.
  const above = top.y - ROTATE_ANCHOR_OFFSET - 64;
  const y = above > 60 ? above : bottom + 16;
  const x = Math.min(Math.max(top.x, 220), Math.max(220, width - 220));

  const locked = objs.every((o) => o.locked);
  const grouped = objs.some((o) => o.groupId);
  return (
    <div
      className={`${panel} absolute z-20 flex -translate-x-1/2 items-center gap-0.5 p-1`}
      style={{ left: x, top: y }}
      onPointerDown={(e) => e.stopPropagation()}
      data-testid="selection-toolbar"
    >
      {!locked && <StyleControls objs={objs} ids={selectedIds} />}
      {!locked && (
        <>
          <IconButton label="Bring to front (])" onClick={actions.bringToFront}>
            <ArrowUpToLine size={16} />
          </IconButton>
          <IconButton label="Send to back ([)" onClick={actions.sendToBack}>
            <ArrowDownToLine size={16} />
          </IconButton>
          {grouped ? (
            <IconButton label="Ungroup (Ctrl Shift G)" onClick={actions.ungroup}>
              <Ungroup size={16} />
            </IconButton>
          ) : (
            objs.length > 1 && (
              <IconButton label="Group (Ctrl G)" onClick={actions.group}>
                <Group size={16} />
              </IconButton>
            )
          )}
          <IconButton label="Duplicate (Ctrl D)" onClick={actions.duplicateSelected}>
            <Copy size={16} />
          </IconButton>
        </>
      )}
      <IconButton
        label={locked ? 'Unlock (Ctrl Shift L)' : 'Lock (Ctrl Shift L)'}
        active={locked}
        onClick={actions.toggleLock}
      >
        {locked ? <Lock size={16} /> : <LockOpen size={16} />}
      </IconButton>
      {!locked && (
        <IconButton label="Delete (Del)" onClick={actions.deleteSelected}>
          <Trash size={16} />
        </IconButton>
      )}
    </div>
  );
}
