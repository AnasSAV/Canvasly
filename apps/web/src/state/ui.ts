import { STICKY_COLORS, type ConnectorEnd, type Guide, type Rect, type ShapeKind } from '@canvasly/shared';
import { create } from 'zustand';

export type Tool =
  | 'select'
  | 'hand'
  | 'sticky'
  | 'text'
  | 'rect'
  | 'ellipse'
  | 'triangle'
  | 'line'
  | 'arrow'
  | 'pen'
  | 'eraser';

/** In-progress creation previews, drawn in the overlay layer until the gesture commits. */
export type Draft =
  | { kind: 'shape'; shape: ShapeKind; rect: Rect }
  | { kind: 'pen'; points: number[] }
  | { kind: 'connector'; start: ConnectorEnd; end: ConnectorEnd; arrow: boolean }
  | { kind: 'eraser'; x: number; y: number; r: number };

interface UIState {
  tool: Tool;
  selectedIds: string[];
  editingId: string | null;
  /** True while a drag/resize gesture runs; hides the floating selection toolbar. */
  interacting: boolean;
  spacePan: boolean;
  panning: boolean;
  /** Shape highlighted as the attach target while drawing or re-attaching a connector. */
  attachHoverId: string | null;
  snapToGrid: boolean;
  guides: Guide[];
  marquee: Rect | null;
  draft: Draft | null;
  /** Awareness client id whose viewport we mirror ("follow user"), or null. */
  followingClientId: number | null;
  stickyColor: string;
  penColor: string;
  penSize: number;

  setTool: (tool: Tool) => void;
  select: (ids: string[]) => void;
  setEditing: (id: string | null) => void;
  setInteracting: (v: boolean) => void;
  setSpacePan: (v: boolean) => void;
  setPanning: (v: boolean) => void;
  setAttachHover: (id: string | null) => void;
  toggleSnap: () => void;
  setGuides: (g: Guide[]) => void;
  setMarquee: (r: Rect | null) => void;
  setDraft: (d: Draft | null) => void;
  setFollowing: (clientId: number | null) => void;
  setStickyColor: (c: string) => void;
  setPenColor: (c: string) => void;
  setPenSize: (s: number) => void;
}

const sameIds = (a: string[], b: string[]) => a.length === b.length && a.every((id, i) => id === b[i]);

export const useUI = create<UIState>()((set, get) => ({
  tool: 'select',
  selectedIds: [],
  editingId: null,
  interacting: false,
  spacePan: false,
  panning: false,
  attachHoverId: null,
  snapToGrid: false,
  guides: [],
  marquee: null,
  draft: null,
  followingClientId: null,
  stickyColor: STICKY_COLORS[0],
  penColor: '#1a1a1a',
  penSize: 4,

  setTool: (tool) => set({ tool, editingId: null, draft: null }),
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
  toggleSnap: () => set((s) => ({ snapToGrid: !s.snapToGrid })),
  setGuides: (guides) => {
    if (guides.length || get().guides.length) set({ guides });
  },
  setMarquee: (marquee) => set({ marquee }),
  setDraft: (draft) => set({ draft }),
  setFollowing: (followingClientId) => set({ followingClientId }),
  setStickyColor: (stickyColor) => set({ stickyColor }),
  setPenColor: (penColor) => set({ penColor }),
  setPenSize: (penSize) => set({ penSize }),
}));
