import {
  ClipboardPayload,
  buildTemplate,
  hasText,
  makeChart,
  makeDocument,
  makeImage,
  makeTable,
  makeText,
  patchObject,
  type BoardObject,
  type ChartKind,
  type TemplateId,
  type Vec,
} from '@canvasly/shared';
import { textBox } from '../canvas/text';
import { toast } from '../state/feedback';
import { useUI } from '../state/ui';
import { useViewport } from '../state/viewport';
import { compressImage, uploadAsset } from './assets';
import type { Board } from './board';
import { canvaDataFromHtml, canvaToObjects } from './canvaImport';
import { readHtml, toObjects } from './htmlImport';
import { MAX_PDF_PAGES, PdfCancelled, pdfToPages } from './pdfImport';
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
  textShortcut,
  toggleLock,
  ungroup,
} from './ops';

/** Pasted text longer than this wraps instead of running on as one line. */
const MAX_PASTED_LINE = 640;

const isPdf = (f: File) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
const isAddable = (f: File) => f.type.startsWith('image/') || isPdf(f);

/** User-level commands shared by keyboard shortcuts, toolbars and menus. */
export function createActions(board: Board, getPointerWorld: () => Vec | null) {
  const ui = () => useUI.getState();
  const sel = () => ui().selectedIds.filter((id) => board.store.has(id));
  const viewCenter = (): Vec => {
    const r = useViewport.getState().visibleRect();
    return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
  };
  const isOwnPayload = (text: string) => {
    try {
      return ClipboardPayload.safeParse(JSON.parse(text)).success;
    } catch {
      return false;
    }
  };
  let cancelRequested = false;
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
    textShortcut: (e: KeyboardEvent) => editable() && textShortcut(board, sel(), e),
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
      const sticker = { ...t, text: emoji };
      actions.insertObjects([{ ...sticker, ...textBox(sticker) }]);
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
    /** Pasted designs can be far larger than the view, so make sure all of it can be seen. */
    insertRich: (objects: BoardObject[], target?: Vec) => {
      actions.insertObjects(objects, target ?? getPointerWorld() ?? viewCenter());
      const pasted = selectionBounds(board.store, ui().selectedIds);
      const view = useViewport.getState().visibleRect();
      if (pasted && (pasted.w > view.w * 0.9 || pasted.h > view.h * 0.9)) {
        useViewport.getState().fit(pasted);
      }
    },

    /** Paste canvasly JSON (or the in-app clipboard when empty); other plain text becomes a text object. */
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
        const plain = { ...makeText(at, nextZ(board.store)), text: text.trim().slice(0, 20_000) };
        const fits = textBox(plain).w <= MAX_PASTED_LINE;
        const t = fits ? plain : { ...plain, autoWidth: false, w: MAX_PASTED_LINE };
        actions.insertObjects([{ ...t, ...textBox(t) }], at);
      }
    },

    /**
     * Paste from the system clipboard. Other apps usually offer several forms of the same content, and the
     * richest one that works wins: our own objects, then Canva's elements, then styled HTML, then image files,
     * then plain text.
     */
    pasteContent: async (
      { html, text, files, canva }: { html: string; text: string; files: File[]; canva?: string },
      target?: Vec,
    ) => {
      if (!editable()) return;
      const images = files.filter(isAddable);
      const own = isOwnPayload(text);
      const canvaData = own ? null : canva || canvaDataFromHtml(html);
      const fromCanva = canvaData ? await canvaToObjects(board.id, canvaData) : null;
      if (fromCanva?.objects.length) {
        actions.insertRich(fromCanva.objects, target);
        const { pictures, unreadable } = fromCanva;
        const notes = [
          pictures === 1 && "1 picture is a gray box: Canva doesn't share image files with other apps.",
          pictures > 1 &&
            `${pictures} pictures are gray boxes: Canva doesn't share image files with other apps.`,
          pictures > 0 && 'To add one, take a screenshot of it or download it, then paste it here.',
          unreadable === 1 && "1 other element couldn't be read, and is a gray box too.",
          unreadable > 1 && `${unreadable} other elements couldn't be read, and are gray boxes too.`,
        ].filter(Boolean);
        if (notes.length) toast(notes.join(' '));
        return;
      }
      if (html.trim() && !own) {
        const items = await readHtml(html);
        const pictures = items.filter((i) => i.kind === 'image').length;
        // A lone picture is better taken from the image file, when there is one: no host can refuse it.
        if (items.length > 0 && (!images.length || items.length > 1 || pictures !== 1)) {
          const { objects, failed } = await toObjects(board.id, items);
          if (objects.length) actions.insertRich(objects, target);
          if (failed) {
            toast(
              failed === 1
                ? "1 image couldn't be copied: the site it's on doesn't allow it."
                : `${failed} images couldn't be copied: the site they're on doesn't allow it.`,
            );
          }
          if (objects.length) return;
        }
      }
      if (images.length) {
        await actions.insertFiles(images, target);
        return;
      }
      actions.pasteText(text || null, target);
    },

    /** Menu-driven paste: reads the system clipboard if the browser allows, else the in-app clipboard. */
    pasteAt: async (at: Vec) => {
      if (!editable()) return;
      try {
        const content = { html: '', text: '', files: [] as File[] };
        for (const item of await navigator.clipboard.read()) {
          for (const type of item.types) {
            const blob = await item.getType(type);
            if (type === 'text/html') content.html = await blob.text();
            else if (type === 'text/plain') content.text = await blob.text();
            else if (type.startsWith('image/') || type === 'application/pdf') {
              content.files.push(new File([blob], 'pasted-file', { type }));
            }
          }
        }
        await actions.pasteContent(content, at);
      } catch {
        actions.pasteText(null, at);
      }
    },

    /** Images and PDFs, from a drop, a paste or the file picker. Anything else is turned away by name. */
    insertFiles: async (files: File[], at?: Vec) => {
      if (!editable()) return;
      const refused = files.filter((f) => !isAddable(f)).map((f) => f.name);
      if (refused.length) toast(`Only images and PDFs can be added. Skipped: ${refused.join(', ')}`);
      await actions.insertImages(
        files.filter((f) => f.type.startsWith('image/')),
        at,
      );
      for (const pdf of files.filter(isPdf)) await actions.insertPdf(pdf, at);
    },

    /** One at a time, since each renders every page; a second drop waits its turn in `insertFiles`. */
    insertPdf: async (file: File, at?: Vec) => {
      if (!editable()) return;
      const name = file.name;
      cancelRequested = false;
      ui().setImportProgress({ name, done: 0, total: 0 });
      try {
        const { pages, omitted } = await pdfToPages(
          file,
          board.id,
          (p) => ui().setImportProgress({ name, ...p }),
          () => cancelRequested,
        );
        const title = name.replace(/\.pdf$/i, '');
        const doc = makeDocument(at ?? viewCenter(), nextZ(board.store), title, pages);
        addObjects(board, [doc]);
        ui().select([doc.id]);
        ui().setTool('select');
        if (omitted) {
          toast(`Added the first ${MAX_PDF_PAGES} pages of ${name}. The other ${omitted} were left out.`);
        }
      } catch (err) {
        if (!(err instanceof PdfCancelled)) toast(`Couldn't add ${name}: ${(err as Error).message}`, 'error');
      } finally {
        ui().setImportProgress(null);
      }
    },
    cancelImport: () => {
      cancelRequested = true;
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
          toast(`Couldn't add ${file.name}: ${(err as Error).message}`, 'error');
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
