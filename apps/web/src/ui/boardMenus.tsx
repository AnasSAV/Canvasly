import { STICKY_SIZE, can, makeSticky, makeText, type BoardSummary, type Vec } from '@canvasly/shared';
import {
  Accessibility as AccessibilityIcon,
  ArrowDownToLine,
  ArrowUpToLine,
  Clipboard,
  ClipboardCopy,
  Copy,
  Download,
  Eye,
  FileUp,
  Group,
  Lock,
  LockOpen,
  Pencil,
  Presentation,
  Scissors,
  SlidersHorizontal,
  Trash,
  Ungroup,
  UserPlus,
} from 'lucide-react';
import type { Actions } from '../doc/actions';
import type { Board } from '../doc/board';
import { addObjects, nextZ } from '../doc/ops';
import { api } from '../lib/api';
import { exportJson, exportPdf, exportPng } from '../lib/exporters';
import { navigate } from '../lib/router';
import { usePrefs } from '../state/prefs';
import { askConfirm, toastError } from '../state/feedback';
import { useTheme } from '../state/theme';
import { useUI } from '../state/ui';
import { useViewport } from '../state/viewport';
import type { MenuEntry } from './Menu';

const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
const MOD = isMac ? '⌘' : 'Ctrl+';

const ui = () => useUI.getState();
const prefs = () => usePrefs.getState();

/** Copy the selection to the system clipboard from a menu (keyboard copy goes through the copy event). */
function copyToClipboard(actions: Actions) {
  const text = actions.copy();
  if (text) void navigator.clipboard?.writeText(text).catch(() => {});
}

function cutToClipboard(actions: Actions) {
  const text = actions.cut();
  if (text) void navigator.clipboard?.writeText(text).catch(() => {});
}

function viewCenter(): Vec {
  const v = useViewport.getState().visibleRect();
  return { x: v.x + v.w / 2, y: v.y + v.h / 2 };
}

/** Preferences shared by the right-click menu and the board menu. */
function canvasPrefEntries(): MenuEntry[] {
  const p = prefs();
  return [
    { label: 'Show grid', shortcut: 'G', checked: p.showGrid, onSelect: () => p.toggle('showGrid') },
    {
      label: 'Show comments on board',
      shortcut: 'Shift+C',
      checked: p.showComments,
      onSelect: () => p.toggle('showComments'),
    },
    { label: 'Snap to grid', checked: p.snapToGrid, onSelect: () => p.toggle('snapToGrid') },
    { label: 'Snap objects', checked: p.snapObjects, onSelect: () => p.toggle('snapObjects') },
    { label: 'Show object size', checked: p.showObjectSize, onSelect: () => p.toggle('showObjectSize') },
    {
      label: 'Suggest object size',
      checked: p.suggestObjectSize,
      onSelect: () => p.toggle('suggestObjectSize'),
    },
  ];
}

function navModeEntry(): MenuEntry {
  const p = prefs();
  return {
    label: 'Mouse or trackpad',
    submenu: [
      {
        label: 'Mouse: wheel zooms',
        checked: p.navMode === 'mouse',
        onSelect: () => p.setNavMode('mouse'),
      },
      {
        label: 'Trackpad: scroll pans, pinch zooms',
        checked: p.navMode === 'trackpad',
        onSelect: () => p.setNavMode('trackpad'),
      },
    ],
  };
}

/** Right-click on the empty board. */
export function boardContextEntries(board: Board, actions: Actions, world: Vec): MenuEntry[] {
  const readOnly = board.readOnly;
  const anyLocked = [...board.store.all()].some((o) => o.locked);
  const edit: MenuEntry[] = readOnly
    ? []
    : [
        { label: 'Paste', shortcut: `${MOD}V`, onSelect: () => void actions.pasteAt(world) },
        { label: 'Unlock all', disabled: !anyLocked, onSelect: actions.unlockAll },
        'divider',
        {
          label: 'Add text',
          onSelect: () => {
            const t = makeText({ x: world.x, y: world.y - 15 }, nextZ(board.store));
            addObjects(board, [t]);
            ui().select([t.id]);
            ui().setEditing(t.id);
          },
        },
        {
          label: 'Add sticky note',
          onSelect: () => {
            const at = { x: world.x - STICKY_SIZE / 2, y: world.y - STICKY_SIZE / 2 };
            const s = makeSticky(at, nextZ(board.store), ui().stickyColor);
            addObjects(board, [s]);
            ui().select([s.id]);
            ui().setEditing(s.id);
          },
        },
      ];
  const comment: MenuEntry[] = board.anonymous
    ? []
    : [{ label: 'Add comment', onSelect: () => ui().setCommentDraft(world) }];
  const startView: MenuEntry[] = readOnly
    ? []
    : [
        { label: 'Set start view', onSelect: () => ui().setTool('startview') },
        { label: 'Set current view as start', onSelect: actions.setCurrentViewAsStart },
        'divider',
      ];
  return [
    ...edit,
    ...comment,
    'divider',
    ...startView,
    ...canvasPrefEntries(),
    'divider',
    navModeEntry(),
    { label: 'Show all', shortcut: 'Alt+1', onSelect: actions.showAll },
  ];
}

/** Right-click on an object (the selection). */
export function objectContextEntries(board: Board, actions: Actions, title: string): MenuEntry[] {
  const ids = ui().selectedIds;
  const objs = ids.map((id) => board.store.get(id)).filter((o) => o !== undefined);
  const exportItem: MenuEntry = {
    label: 'Export selection as PNG',
    icon: <Download size={15} />,
    onSelect: () => void exportPng(board, title, ids).catch(toastError),
  };
  const copyItem: MenuEntry = {
    label: 'Copy',
    shortcut: `${MOD}C`,
    icon: <ClipboardCopy size={15} />,
    onSelect: () => copyToClipboard(actions),
  };
  if (board.readOnly) return [copyItem, exportItem];
  const locked = objs.length > 0 && objs.every((o) => o.locked);
  const grouped = objs.some((o) => o.groupId);
  return [
    {
      label: 'Cut',
      shortcut: `${MOD}X`,
      icon: <Scissors size={15} />,
      disabled: locked,
      onSelect: () => cutToClipboard(actions),
    },
    copyItem,
    {
      label: 'Paste',
      shortcut: `${MOD}V`,
      icon: <Clipboard size={15} />,
      onSelect: () => void actions.pasteAt(viewCenter()),
    },
    {
      label: 'Duplicate',
      shortcut: `${MOD}D`,
      icon: <Copy size={15} />,
      disabled: locked,
      onSelect: () => void actions.duplicateSelected(),
    },
    'divider',
    {
      label: 'Bring to front',
      shortcut: ']',
      icon: <ArrowUpToLine size={15} />,
      disabled: locked,
      onSelect: () => void actions.bringToFront(),
    },
    {
      label: 'Send to back',
      shortcut: '[',
      icon: <ArrowDownToLine size={15} />,
      disabled: locked,
      onSelect: () => void actions.sendToBack(),
    },
    'divider',
    grouped
      ? {
          label: 'Ungroup',
          shortcut: `${MOD}Shift+G`,
          icon: <Ungroup size={15} />,
          onSelect: () => void actions.ungroup(),
        }
      : {
          label: 'Group',
          shortcut: `${MOD}G`,
          icon: <Group size={15} />,
          disabled: objs.length < 2,
          onSelect: () => void actions.group(),
        },
    {
      label: locked ? 'Unlock' : 'Lock',
      shortcut: `${MOD}Shift+L`,
      icon: locked ? <LockOpen size={15} /> : <Lock size={15} />,
      onSelect: () => void actions.toggleLock(),
    },
    'divider',
    exportItem,
    {
      label: 'Delete',
      shortcut: 'Del',
      icon: <Trash size={15} />,
      danger: true,
      disabled: locked,
      onSelect: actions.deleteSelected,
    },
  ];
}

/** The ⋮ menu next to the board name. */
export function boardMenuEntries(
  board: Board,
  actions: Actions,
  meta: BoardSummary,
  opts: { isPublic: boolean; onShare: () => void },
): MenuEntry[] {
  const p = prefs();
  const v = useViewport.getState();
  const readOnly = board.readOnly;
  const selected = ui().selectedIds;
  const title = meta.title;
  const theme = useTheme.getState();

  const boardItems: MenuEntry[] = [
    ...(can(meta.role, 'rename') && !opts.isPublic
      ? [
          {
            label: 'Rename',
            icon: <Pencil size={15} />,
            onSelect: () => useUI.setState({ renamingBoard: true }),
          },
        ]
      : []),
    ...(meta.role === 'owner' && !opts.isPublic
      ? [{ label: 'Share', icon: <UserPlus size={15} />, onSelect: opts.onShare }]
      : []),
    {
      label: 'Export',
      icon: <Download size={15} />,
      submenu: [
        { label: 'Board as PNG', onSelect: () => void exportPng(board, title).catch(toastError) },
        {
          label: 'Selection as PNG',
          disabled: !selected.length,
          onSelect: () => void exportPng(board, title, selected).catch(toastError),
        },
        { label: 'PDF (one page per frame)', onSelect: () => void exportPdf(board, title).catch(toastError) },
        { label: 'Board file (.json)', onSelect: () => void exportJson(board, title).catch(toastError) },
      ],
    },
    ...(readOnly
      ? []
      : [
          {
            label: 'Import board file…',
            icon: <FileUp size={15} />,
            onSelect: () => document.querySelector<HTMLInputElement>('[data-testid="import-input"]')?.click(),
          },
        ]),
    ...(meta.role === 'owner' && !opts.isPublic
      ? ([
          'divider',
          {
            label: 'Delete board',
            icon: <Trash size={15} />,
            danger: true,
            onSelect: () => {
              void askConfirm({
                title: `Delete “${title}”?`,
                body: "This removes the board for everyone it's shared with, and can't be undone.",
                confirmLabel: 'Delete board',
                danger: true,
              }).then((ok) => {
                if (ok) void api.deleteBoard(meta.id).then(() => navigate('/'), toastError);
              });
            },
          },
        ] as MenuEntry[])
      : []),
  ];

  const editItems: MenuEntry[] = [
    {
      label: 'Undo',
      shortcut: `${MOD}Z`,
      disabled: readOnly || !board.undo.canUndo(),
      onSelect: actions.undo,
    },
    {
      label: 'Redo',
      shortcut: `${MOD}Shift+Z`,
      disabled: readOnly || !board.undo.canRedo(),
      onSelect: actions.redo,
    },
    'divider',
    {
      label: 'Cut',
      shortcut: `${MOD}X`,
      disabled: readOnly || !selected.length,
      onSelect: () => cutToClipboard(actions),
    },
    {
      label: 'Copy',
      shortcut: `${MOD}C`,
      disabled: !selected.length,
      onSelect: () => copyToClipboard(actions),
    },
    {
      label: 'Paste',
      shortcut: `${MOD}V`,
      disabled: readOnly,
      onSelect: () => void actions.pasteAt(viewCenter()),
    },
    {
      label: 'Duplicate',
      shortcut: `${MOD}D`,
      disabled: readOnly || !selected.length,
      onSelect: () => void actions.duplicateSelected(),
    },
    {
      label: 'Delete',
      shortcut: 'Del',
      disabled: readOnly || !selected.length,
      onSelect: actions.deleteSelected,
    },
    'divider',
    { label: 'Select all', shortcut: `${MOD}A`, onSelect: actions.selectAll },
    {
      label: 'Group',
      shortcut: `${MOD}G`,
      disabled: readOnly || selected.length < 2,
      onSelect: () => void actions.group(),
    },
    {
      label: 'Ungroup',
      shortcut: `${MOD}Shift+G`,
      disabled: readOnly || !selected.length,
      onSelect: () => void actions.ungroup(),
    },
    {
      label: 'Lock / unlock',
      shortcut: `${MOD}Shift+L`,
      disabled: readOnly || !selected.length,
      onSelect: () => void actions.toggleLock(),
    },
    { label: 'Unlock all', disabled: readOnly, onSelect: actions.unlockAll },
  ];

  const viewItems: MenuEntry[] = [
    { label: 'Show all', shortcut: 'Alt+1', onSelect: actions.showAll },
    { label: 'Go to start view', onSelect: actions.goToStartView },
    { label: 'Zoom in', shortcut: `${MOD}+`, onSelect: () => v.zoomStep(1) },
    { label: 'Zoom out', shortcut: `${MOD}-`, onSelect: () => v.zoomStep(-1) },
    { label: 'Zoom to 100%', shortcut: 'Shift+0', onSelect: () => v.zoomTo(1) },
    'divider',
    { label: 'Show grid', shortcut: 'G', checked: p.showGrid, onSelect: () => p.toggle('showGrid') },
    {
      label: 'Show comments on board',
      shortcut: 'Shift+C',
      checked: p.showComments,
      onSelect: () => p.toggle('showComments'),
    },
    { label: 'Minimap', checked: p.showMinimap, onSelect: () => p.toggle('showMinimap') },
    'divider',
    { label: 'Comments panel', onSelect: () => ui().toggleCommentsPanel() },
    { label: 'Frames panel', onSelect: () => ui().toggleFramesPanel() },
    { label: 'Layers panel', onSelect: () => ui().toggleLayersPanel() },
  ];

  const preferenceItems: MenuEntry[] = [
    navModeEntry(),
    {
      label: 'Theme',
      submenu: (['light', 'dark', 'system'] as const).map((t) => ({
        label: t[0]!.toUpperCase() + t.slice(1),
        checked: theme.pref === t,
        onSelect: () => theme.setPref(t),
      })),
    },
    'divider',
    { label: 'Snap to grid', checked: p.snapToGrid, onSelect: () => p.toggle('snapToGrid') },
    { label: 'Snap objects', checked: p.snapObjects, onSelect: () => p.toggle('snapObjects') },
    { label: 'Show object size', checked: p.showObjectSize, onSelect: () => p.toggle('showObjectSize') },
    {
      label: 'Suggest object size',
      checked: p.suggestObjectSize,
      onSelect: () => p.toggle('suggestObjectSize'),
    },
  ];

  const accessibilityItems: MenuEntry[] = [
    { label: 'Keyboard shortcuts', shortcut: '?', onSelect: () => ui().setShortcutsOpen(true) },
    { label: 'Reduce motion', checked: p.reduceMotion, onSelect: () => p.toggle('reduceMotion') },
  ];

  return [
    { label: 'Board', icon: <Presentation size={15} />, submenu: boardItems },
    { label: 'Edit', icon: <Pencil size={15} />, submenu: editItems },
    { label: 'View', icon: <Eye size={15} />, submenu: viewItems },
    { label: 'Preferences', icon: <SlidersHorizontal size={15} />, submenu: preferenceItems },
    { label: 'Accessibility', icon: <AccessibilityIcon size={15} />, submenu: accessibilityItems },
  ];
}
