import {
  STICKY_COLORS,
  type ConnectorEnd,
  type Guide,
  type Rect,
  type ShapeKind,
  type Vec,
} from '@canvasly/shared';
import { create } from 'zustand';

export type Tool =
  | 'select'
  | 'hand'
  | 'sticky'
  | 'text'
  | ShapeKind
  | 'line'
  | 'arrow'
  | 'pen'
  | 'highlighter'
  | 'eraser'
  | 'frame'
  | 'comment'
  /** Drag out the area the board should open on. */
  | 'startview';

export interface ContextMenuState {
  /** Screen position of the menu. */
  x: number;
  y: number;
  /** Where the right-click landed on the board. */
  world: Vec;
  /** Object under the pointer, or null for the plain board. */
  targetId: string | null;
}

/** In-progress creation previews, drawn in the overlay layer until the gesture commits. */
export type Draft =
  | { kind: 'shape'; shape: ShapeKind | 'frame' | 'startview'; rect: Rect }
  | { kind: 'pen'; points: number[]; color: string; size: number; opacity: number }
  | { kind: 'connector'; start: ConnectorEnd; end: ConnectorEnd; arrow: boolean }
  | { kind: 'eraser'; x: number; y: number; r: number };

interface UIState {
  tool: Tool;
  selectedIds: string[];
  editingId: string | null;
  editingCell: { id: string; rowId: string; colId: string } | null;
  /** Last cell used in each table, so row/column actions know where to apply. */
  activeCell: { id: string; rowId: string; colId: string } | null;
  contextMenu: ContextMenuState | null;
  /** Chart whose data is open in the editor panel. */
  chartEditorId: string | null;
  shortcutsOpen: boolean;
  /** Board name is being edited in the top bar (also started from the board menu). */
  renamingBoard: boolean;
  /** Live width × height tag while resizing ("Show object size"). */
  liveSize: { w: number; h: number; x: number; y: number } | null;
  /** True while a drag/resize gesture runs; hides the floating selection toolbar. */
  interacting: boolean;
  spacePan: boolean;
  panning: boolean;
  /** Shape highlighted as the attach target while drawing or re-attaching a connector. */
  attachHoverId: string | null;
  guides: Guide[];
  marquee: Rect | null;
  draft: Draft | null;
  /** Viewer role: editing tools are hidden and local edits refused. */
  readOnly: boolean;
  /** World position of a comment being composed (comment tool click), or null. */
  commentDraft: Vec | null;
  openThreadId: string | null;
  commentsPanel: boolean;
  showResolved: boolean;
  framesPanel: boolean;
  /** Index into the frames list while presenting, or null. */
  presenting: number | null;
  /** Awareness client id whose viewport we mirror ("follow user"), or null. */
  followingClientId: number | null;
  stickyColor: string;
  penColor: string;
  penSize: number;
  highlightColor: string;

  setTool: (tool: Tool) => void;
  select: (ids: string[]) => void;
  setEditing: (id: string | null) => void;
  setInteracting: (v: boolean) => void;
  setSpacePan: (v: boolean) => void;
  setPanning: (v: boolean) => void;
  setAttachHover: (id: string | null) => void;
  setEditingCell: (c: UIState['editingCell']) => void;
  setContextMenu: (m: ContextMenuState | null) => void;
  setChartEditor: (id: string | null) => void;
  setShortcutsOpen: (v: boolean) => void;
  setLiveSize: (s: UIState['liveSize']) => void;
  setGuides: (g: Guide[]) => void;
  setMarquee: (r: Rect | null) => void;
  setDraft: (d: Draft | null) => void;
  setFollowing: (clientId: number | null) => void;
  setReadOnly: (v: boolean) => void;
  setCommentDraft: (p: Vec | null) => void;
  setOpenThread: (id: string | null) => void;
  toggleCommentsPanel: () => void;
  setShowResolved: (v: boolean) => void;
  toggleFramesPanel: () => void;
  setPresenting: (i: number | null) => void;
  setStickyColor: (c: string) => void;
  setPenColor: (c: string) => void;
  setPenSize: (s: number) => void;
  setHighlightColor: (c: string) => void;
}

const sameIds = (a: string[], b: string[]) => a.length === b.length && a.every((id, i) => id === b[i]);

export const useUI = create<UIState>()((set, get) => ({
  tool: 'select',
  selectedIds: [],
  editingId: null,
  editingCell: null,
  activeCell: null,
  contextMenu: null,
  chartEditorId: null,
  shortcutsOpen: false,
  renamingBoard: false,
  liveSize: null,
  interacting: false,
  spacePan: false,
  panning: false,
  attachHoverId: null,
  guides: [],
  marquee: null,
  draft: null,
  followingClientId: null,
  readOnly: false,
  commentDraft: null,
  openThreadId: null,
  commentsPanel: false,
  showResolved: false,
  framesPanel: false,
  presenting: null,
  stickyColor: STICKY_COLORS[0],
  penColor: '#1a1a1a',
  penSize: 4,
  highlightColor: '#f5d128',

  setTool: (tool) => set({ tool, editingId: null, editingCell: null, draft: null }),
  select: (ids) => {
    if (!sameIds(get().selectedIds, ids)) set({ selectedIds: ids });
  },
  setEditing: (editingId) => set({ editingId }),
  setInteracting: (interacting) => set({ interacting }),
  setSpacePan: (spacePan) => set({ spacePan }),
  setPanning: (panning) => set({ panning }),
  setAttachHover: (attachHoverId) => {
    if (get().attachHoverId !== attachHoverId) set({ attachHoverId });
  },
  setEditingCell: (editingCell) =>
    set(editingCell ? { editingCell, activeCell: editingCell } : { editingCell }),
  setContextMenu: (contextMenu) => set({ contextMenu }),
  setChartEditor: (chartEditorId) => set({ chartEditorId }),
  setShortcutsOpen: (shortcutsOpen) => set({ shortcutsOpen }),
  setLiveSize: (liveSize) => set({ liveSize }),
  setGuides: (guides) => {
    if (guides.length || get().guides.length) set({ guides });
  },
  setMarquee: (marquee) => set({ marquee }),
  setDraft: (draft) => set({ draft }),
  setFollowing: (followingClientId) => set({ followingClientId }),
  setReadOnly: (readOnly) =>
    set(readOnly ? { readOnly, editingId: null, tool: 'select', draft: null } : { readOnly }),
  setCommentDraft: (commentDraft) => set({ commentDraft, openThreadId: null }),
  setOpenThread: (openThreadId) => set({ openThreadId, commentDraft: null }),
  toggleCommentsPanel: () => set((s) => ({ commentsPanel: !s.commentsPanel, framesPanel: false })),
  setShowResolved: (showResolved) => set({ showResolved }),
  toggleFramesPanel: () => set((s) => ({ framesPanel: !s.framesPanel, commentsPanel: false })),
  setPresenting: (presenting) => set({ presenting, selectedIds: [], editingId: null }),
  setStickyColor: (stickyColor) => set({ stickyColor }),
  setPenColor: (penColor) => set({ penColor }),
  setPenSize: (penSize) => set({ penSize }),
  setHighlightColor: (highlightColor) => set({ highlightColor }),
}));
