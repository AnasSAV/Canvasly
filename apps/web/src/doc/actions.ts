import {
  ClipboardPayload,
  buildTemplate,
  hasText,
  makeChart,
  makeImage,
  makeSticky,
  makeTable,
  makeText,
  patchObject,
  STICKY_SIZE,
  type BoardObject,
  type ChartKind,
  type TemplateId,
  type Vec,
} from '@canvasly/shared';
import { useUI } from '../state/ui';
import { useViewport } from '../state/viewport';
import { compressImage, uploadAsset } from './assets';
import type { Board } from './board';
import {
  addObjects,
  bringToFront,
  contentBounds,
  copyPayload,
  deleteObjects,
  duplicate,
  expandGroups,
  getStartView,
  group,
  insertAt,
  nextZ,
  nudge,
  pastePayload,
  selectionBounds,
  sendToBack,
  setStartView,
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

  /** Viewers can look and copy; anything that changes the board is a no-op for them. */
  const editable = () => !board.readOnly;

  const actions = {
    undo: () => editable() && board.undo.undo(),
    redo: () => editable() && board.undo.redo(),
    deleteSelected: () => {
      if (!editable()) return;
      deleteObjects(board, sel());
      ui().select(sel().filter((id) => board.store.has(id)));
    },
    duplicateSelected: () => editable() && ui().select(duplicate(board, sel())),
    selectAll: () => ui().select(board.store.getSorted().map((o) => o.id)),
    deselect: () => {
      ui().select([]);
      ui().setTool('select');
      ui().setFollowing(null);
    },
    group: () => editable() && group(board, sel()),
    ungroup: () => editable() && ungroup(board, sel()),
    toggleLock: () => editable() && toggleLock(board, sel()),
    unlockAll: () => {
      if (!editable()) return;
      board.transact(() => {
        for (const o of board.store.all()) if (o.locked) patchObject(board.objects, o.id, { locked: false });
      }, true);
    },
    bringToFront: () => editable() && bringToFront(board, sel()),
    sendToBack: () => editable() && sendToBack(board, sel()),
    nudge: (dx: number, dy: number) => editable() && nudge(board, sel(), dx, dy),
    zoomToFit: () => {
      const ids = sel();
      useViewport.getState().fit(ids.length ? selectionBounds(board.store, ids) : contentBounds(board.store));
    },

    /** Enter on the selection: edit text, the first table cell, or a chart's data. */
    editSelected: () => {
      const o = board.store.get(ui().selectedIds[0] ?? '');
      if (!o || o.locked || !editable()) return;
      if (o.type === 'table')
        ui().setEditingCell({ id: o.id, rowId: o.rows[0]!.id, colId: o.columns[0]!.id });
      else if (o.type === 'chart') ui().setChartEditor(o.id);
      else if (hasText(o)) ui().setEditing(o.id);
    },

    /** Everything on the board, regardless of selection (Alt+1). */
    showAll: () => useViewport.getState().fit(contentBounds(board.store)),
    goToStartView: () => {
      const v = getStartView(board);
      if (v) useViewport.getState().fitExact(v);
      else actions.showAll();
    },
    setCurrentViewAsStart: () => {
      if (editable()) setStartView(board, useViewport.getState().visibleRect());
    },

    /** Place new objects at the center of the view and select them. */
    insertObjects: (objects: BoardObject[], at?: Vec) => {
      if (!editable() || !objects.length) return;
      const ids = insertAt(board, objects, at ?? viewCenter());
      ui().setTool('select');
      ui().select(ids);
    },
    insertTemplate: (id: TemplateId) => {
      const objects = buildTemplate(id);
      actions.insertObjects(objects);
      const b = selectionBounds(board.store, ui().selectedIds);
      if (b) useViewport.getState().fit(b);
    },
    insertTable: () => actions.insertObjects([makeTable(viewCenter(), nextZ(board.store))]),
    insertChart: (kind: ChartKind) => {
      actions.insertObjects([makeChart(viewCenter(), nextZ(board.store), kind)]);
      ui().setChartEditor(ui().selectedIds[0] ?? null);
    },
    insertSticker: (emoji: string) => {
      const at = viewCenter();
      const t = makeText({ x: at.x - 40, y: at.y - 40 }, nextZ(board.store), '#1a1a1a', 64);
      actions.insertObjects([{ ...t, text: emoji, w: 90, h: 80 }]);
    },

    /** Serialize the selection; returns the text to put on the clipboard. */
    copy: (): string | null => {
      const payload = copyPayload(board, sel());
      if (!payload) return null;
      memoryClipboard = payload;
      return JSON.stringify(payload);
    },
    cut: (): string | null => {
      if (!editable()) return null;
      const text = actions.copy();
      if (text) actions.deleteSelected();
      return text;
    },
    /** Paste canvasly JSON (or the in-app clipboard when empty); other plain text becomes a sticky note. */
    pasteText: (text: string | null, target?: Vec) => {
      if (!editable()) return;
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
      const at = target ?? getPointerWorld() ?? viewCenter();
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

    /** Menu-driven paste: reads the system clipboard if the browser allows, else the in-app clipboard. */
    pasteAt: async (at: Vec) => {
      if (!editable()) return;
      try {
        for (const item of await navigator.clipboard.read()) {
          const type = item.types.find((t) => t.startsWith('image/'));
          if (type) {
            const blob = await item.getType(type);
            await actions.insertImages([new File([blob], 'pasted-image', { type })], at);
            return;
          }
        }
        actions.pasteText((await navigator.clipboard.readText()) || null, at);
      } catch {
        actions.pasteText(null, at);
      }
    },

    insertImages: async (files: Iterable<File>, at?: Vec) => {
      if (!editable()) return;
      let pos = at ?? viewCenter();
      const created: string[] = [];
      for (const file of files) {
        if (!file.type.startsWith('image/')) continue;
        try {
          const { blob, width, height } = await compressImage(file);
          const assetId = await uploadAsset(board.id, blob);
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
