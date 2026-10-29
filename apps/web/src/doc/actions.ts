import { ClipboardPayload, makeImage, makeSticky, STICKY_SIZE, type Vec } from '@canvasly/shared';
import { useUI } from '../state/ui';
import { useViewport } from '../state/viewport';
import { compressImage, putAsset } from './assets';
import type { Board } from './board';
import {
  addObjects,
  bringToFront,
  contentBounds,
  copyPayload,
  deleteObjects,
  duplicate,
  expandGroups,
  group,
  nextZ,
  nudge,
  pastePayload,
  selectionBounds,
  sendToBack,
  toggleLock,
  ungroup,
} from './ops';

/** User-level commands shared by keyboard shortcuts, toolbars and menus. */
export function createActions(board: Board, getPointerWorld: () => Vec | null) {
  const ui = () => useUI.getState();
  const sel = () => ui().selectedIds.filter((id) => board.store.has(id));
  const viewCenter = (): Vec => {
    const r = useViewport.getState().visibleRect();
    return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
  };
  /** In-app clipboard fallback for when the system clipboard is unavailable. */
  let memoryClipboard: ClipboardPayload | null = null;

  const actions = {
    undo: () => board.undo.undo(),
    redo: () => board.undo.redo(),
    deleteSelected: () => {
      deleteObjects(board, sel());
      ui().select(sel().filter((id) => board.store.has(id)));
    },
    duplicateSelected: () => ui().select(duplicate(board, sel())),
    selectAll: () => ui().select(board.store.getSorted().map((o) => o.id)),
    deselect: () => {
      ui().select([]);
      ui().setTool('select');
    },
    group: () => group(board, sel()),
    ungroup: () => ungroup(board, sel()),
    toggleLock: () => toggleLock(board, sel()),
    bringToFront: () => bringToFront(board, sel()),
    sendToBack: () => sendToBack(board, sel()),
    nudge: (dx: number, dy: number) => nudge(board, sel(), dx, dy),
    zoomToFit: () => {
      const ids = sel();
      useViewport.getState().fit(ids.length ? selectionBounds(board.store, ids) : contentBounds(board.store));
    },

    /** Serialize the selection; returns the text to put on the clipboard. */
    copy: (): string | null => {
      const payload = copyPayload(board, sel());
      if (!payload) return null;
      memoryClipboard = payload;
      return JSON.stringify(payload);
    },
    cut: (): string | null => {
      const text = actions.copy();
      if (text) actions.deleteSelected();
      return text;
    },
    /** Paste canvasly JSON (or the in-app clipboard when empty); other plain text becomes a sticky note. */
    pasteText: (text: string | null) => {
      let payload: ClipboardPayload | null = null;
      if (text) {
        try {
          const parsed = ClipboardPayload.safeParse(JSON.parse(text));
          if (parsed.success) payload = parsed.data;
        } catch {
          // not ours
        }
      } else {
        payload = memoryClipboard;
      }
      const at = getPointerWorld() ?? viewCenter();
      if (payload) {
        const ids = pastePayload(board, payload, at);
        ui().select(expandGroups(board.store, ids));
      } else if (text?.trim()) {
        const sticky = makeSticky(
          { x: at.x - STICKY_SIZE / 2, y: at.y - STICKY_SIZE / 2 },
          nextZ(board.store),
        );
        addObjects(board, [{ ...sticky, color: ui().stickyColor, text: text.trim().slice(0, 2000) }]);
        ui().select([sticky.id]);
      }
    },

    insertImages: async (files: Iterable<File>, at?: Vec) => {
      let pos = at ?? viewCenter();
      const created: string[] = [];
      for (const file of files) {
        if (!file.type.startsWith('image/')) continue;
        try {
          const { blob, width, height } = await compressImage(file);
          const assetId = await putAsset(blob);
          const img = makeImage(pos, nextZ(board.store), assetId, width, height);
          addObjects(board, [img]);
          created.push(img.id);
          pos = { x: pos.x + 40, y: pos.y + 40 };
        } catch (err) {
          alert(`Couldn't add ${file.name}: ${(err as Error).message}`);
        }
      }
      if (created.length) {
        ui().select(created);
        ui().setTool('select');
      }
    },
  };
  return actions;
}

export type Actions = ReturnType<typeof createActions>;
