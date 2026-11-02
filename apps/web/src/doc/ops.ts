import {
  aabb,
  bringToFrontKeys,
  cellKey,
  cloneForPaste,
  getMetaMap,
  hasText,
  insertObject,
  isShapeObject,
  keyAbove,
  keysAbove,
  makeImage,
  makeShape,
  makeSticky,
  makeText,
  newId,
  patchObject,
  prepareCopy,
  removeCells,
  sendToBackKeys,
  toggleList,
  unionRects,
  type BoardObject,
  type ClipboardPayload,
  type ConnectorEnd,
  type DocumentObject,
  type ObjectPatch,
  type Rect,
  type ShapeKind,
  type TextBearingObject,
  type TextObject,
  type TableObject,
  type Vec,
} from '@canvasly/shared';
import { stepFontSize, textBox } from '../canvas/text';
import type { Board } from './board';
import type { DocStore } from './store';

/** Selecting any member of a group selects the whole group. */
export function expandGroups(store: DocStore, ids: Iterable<string>): string[] {
  const out = new Set<string>();
  const groups = new Set<string>();
  for (const id of ids) {
    const o = store.get(id);
    if (!o) continue;
    out.add(id);
    if (o.groupId) groups.add(o.groupId);
  }
  if (groups.size) {
    for (const o of store.all()) if (o.groupId && groups.has(o.groupId)) out.add(o.id);
  }
  return [...out];
}

export function selectionBounds(store: DocStore, ids: Iterable<string>): Rect | null {
  const rects: Rect[] = [];
  for (const id of ids) {
    const b = store.getBounds(id);
    if (b) rects.push(b);
  }
  return unionRects(rects);
}

export function contentBounds(store: DocStore): Rect | null {
  return unionRects([...store.allBounds()].map(([, r]) => r));
}

export const nextZ = (store: DocStore): string => keyAbove(store.getSorted().at(-1)?.z ?? null);

export function addObjects(board: Board, objs: BoardObject[]) {
  board.transact(() => {
    for (const o of objs) insertObject(board.objects, o);
  }, true);
}

export function patch(board: Board, id: string, p: ObjectPatch) {
  board.transact(() => patchObject(board.objects, id, p));
}

/** Delete unlocked objects; connectors attached to them are detached in place rather than deleted. */
export function deleteObjects(board: Board, ids: Iterable<string>): void {
  const { store } = board;
  const doomed = new Set([...ids].filter((id) => store.get(id) && !store.get(id)!.locked));
  if (!doomed.size) return;
  board.transact(() => {
    for (const id of doomed) {
      for (const cid of store.connectorsAttachedTo(id)) {
        if (doomed.has(cid)) continue;
        const c = store.get(cid);
        if (c?.type !== 'connector') continue;
        const r = store.resolve(c);
        if (!r) continue;
        const detach = (end: ConnectorEnd, at: Vec): ConnectorEnd =>
          end.kind === 'attached' && doomed.has(end.objectId) ? { kind: 'point', x: at.x, y: at.y } : end;
        patchObject(board.objects, cid, { start: detach(c.start, r.start), end: detach(c.end, r.end) });
      }
    }
    for (const id of doomed) board.objects.delete(id);
  }, true);
}

export function bringToFront(board: Board, ids: string[]) {
  const keys = bringToFrontKeys(board.store.getSorted(), new Set(ids));
  board.transact(() => keys.forEach((z, id) => patchObject(board.objects, id, { z })), true);
}

export function sendToBack(board: Board, ids: string[]) {
  const keys = sendToBackKeys(board.store.getSorted(), new Set(ids));
  board.transact(() => keys.forEach((z, id) => patchObject(board.objects, id, { z })), true);
}

export function group(board: Board, ids: string[]) {
  if (ids.length < 2) return;
  const groupId = newId();
  board.transact(() => ids.forEach((id) => patchObject(board.objects, id, { groupId })), true);
}

export function ungroup(board: Board, ids: string[]) {
  board.transact(() => ids.forEach((id) => patchObject(board.objects, id, { groupId: null })), true);
}

/** Lock all if any is unlocked, otherwise unlock all. */
export function toggleLock(board: Board, ids: string[]) {
  const objs = ids.map((id) => board.store.get(id)).filter((o) => o !== undefined);
  const locked = !objs.every((o) => o.locked);
  board.transact(() => objs.forEach((o) => patchObject(board.objects, o.id, { locked })), true);
}

/** Apply a per-object patch (return null to skip an object). */
export function updateEach(board: Board, ids: string[], fn: (o: BoardObject) => ObjectPatch | null) {
  board.transact(() => {
    for (const id of ids) {
      const o = board.store.get(id);
      const p = o && fn(o);
      if (p) patchObject(board.objects, id, p);
    }
  }, true);
}

/** Shift objects from their original snapshot by (dx, dy). Point ends of connectors move too. */
export function moveFrom(board: Board, origins: ReadonlyMap<string, BoardObject>, dx: number, dy: number) {
  const shift = (e: ConnectorEnd): ConnectorEnd =>
    e.kind === 'point' ? { ...e, x: e.x + dx, y: e.y + dy } : e;
  board.transact(() => {
    for (const o of origins.values()) {
      if (o.type === 'connector')
        patchObject(board.objects, o.id, { start: shift(o.start), end: shift(o.end) });
      else patchObject(board.objects, o.id, { x: o.x + dx, y: o.y + dy });
    }
  });
}

export function nudge(board: Board, ids: string[], dx: number, dy: number) {
  const origins = new Map<string, BoardObject>();
  for (const id of ids) {
    const o = board.store.get(id);
    if (o && !o.locked) origins.set(id, o);
  }
  moveFrom(board, origins, dx, dy);
}

/** Clipboard snapshot of `ids` plus any connectors running between them. */
export function copyPayload(board: Board, ids: string[]): ClipboardPayload | null {
  const { store } = board;
  const set = new Set(ids);
  for (const o of store.all()) {
    if (o.type !== 'connector' || set.has(o.id)) continue;
    const ends = [o.start, o.end];
    if (ends.every((e) => e.kind === 'attached' && set.has(e.objectId))) set.add(o.id);
  }
  const objs = store.getSorted().filter((o) => set.has(o.id));
  if (!objs.length) return null;
  return prepareCopy(objs, store.resolve);
}

function payloadBounds(objects: readonly BoardObject[]): Rect | null {
  const rects: Rect[] = [];
  for (const o of objects) {
    if (o.type !== 'connector') rects.push(aabb(o));
    else for (const e of [o.start, o.end]) if (e.kind === 'point') rects.push({ x: e.x, y: e.y, w: 0, h: 0 });
  }
  return unionRects(rects);
}

/** Paste centered on `at` (world), or offset from the originals. Returns the new ids. */
export function pastePayload(board: Board, payload: ClipboardPayload, at: Vec | null): string[] {
  const bounds = payloadBounds(payload.objects);
  if (!bounds) return [];
  const offset = at
    ? { x: Math.round(at.x - (bounds.x + bounds.w / 2)), y: Math.round(at.y - (bounds.y + bounds.h / 2)) }
    : { x: 24, y: 24 };
  const zKeys = keysAbove(board.store.getSorted().at(-1)?.z ?? null, payload.objects.length);
  const clones = cloneForPaste(payload.objects, offset, zKeys, newId);
  addObjects(board, clones);
  return clones.map((o) => o.id);
}

/** Add objects built around the origin (templates, insert panels) centered at `at`. Returns the new ids. */
export function insertAt(board: Board, objects: BoardObject[], at: Vec): string[] {
  return pastePayload(board, { kind: 'canvasly/objects', version: 1, objects }, at);
}

// --- tables ---

export function setCell(board: Board, id: string, key: string, text: string) {
  board.transact(() => patchObject(board.objects, id, { cells: { [key]: text } }));
}

const sum = (items: readonly { w?: number; h?: number }[]) =>
  items.reduce((n, i) => n + (i.w ?? i.h ?? 0), 0);

export function addTableRow(board: Board, t: TableObject, afterRowId?: string) {
  const at = afterRowId ? t.rows.findIndex((r) => r.id === afterRowId) + 1 : t.rows.length;
  const h = t.rows[t.rows.length - 1]?.h ?? 44;
  const rows = [...t.rows.slice(0, at), { id: newId(), h }, ...t.rows.slice(at)];
  board.transact(() => patchObject(board.objects, t.id, { rows, h: sum(rows) }), true);
}

export function addTableColumn(board: Board, t: TableObject, afterColId?: string) {
  const at = afterColId ? t.columns.findIndex((c) => c.id === afterColId) + 1 : t.columns.length;
  const w = t.columns[t.columns.length - 1]?.w ?? 160;
  const columns = [...t.columns.slice(0, at), { id: newId(), w }, ...t.columns.slice(at)];
  board.transact(() => patchObject(board.objects, t.id, { columns, w: sum(columns) }), true);
}

export function deleteTableRow(board: Board, t: TableObject, rowId?: string) {
  if (t.rows.length <= 1) return;
  const id = rowId ?? t.rows[t.rows.length - 1]!.id;
  const rows = t.rows.filter((r) => r.id !== id);
  board.transact(() => {
    patchObject(board.objects, t.id, { rows, h: sum(rows) });
    removeCells(
      board.objects,
      t.id,
      t.columns.map((c) => cellKey(id, c.id)),
    );
  }, true);
}

export function deleteTableColumn(board: Board, t: TableObject, colId?: string) {
  if (t.columns.length <= 1) return;
  const id = colId ?? t.columns[t.columns.length - 1]!.id;
  const columns = t.columns.filter((c) => c.id !== id);
  board.transact(() => {
    patchObject(board.objects, t.id, { columns, w: sum(columns) });
    removeCells(
      board.objects,
      t.id,
      t.rows.map((r) => cellKey(r.id, id)),
    );
  }, true);
}

/** The neighboring cell; moving past the last row adds one, so Tab/Enter keep working at the end. */
export function moveTableCell(
  board: Board,
  t: TableObject,
  from: { rowId: string; colId: string },
  dir: 'right' | 'left' | 'down',
): { rowId: string; colId: string } | null {
  const r = t.rows.findIndex((x) => x.id === from.rowId);
  const c = t.columns.findIndex((x) => x.id === from.colId);
  if (dir === 'left') {
    if (c > 0) return { rowId: from.rowId, colId: t.columns[c - 1]!.id };
    return r > 0 ? { rowId: t.rows[r - 1]!.id, colId: t.columns[t.columns.length - 1]!.id } : null;
  }
  if (dir === 'right' && c < t.columns.length - 1) return { rowId: from.rowId, colId: t.columns[c + 1]!.id };
  const col = dir === 'right' ? t.columns[0]!.id : from.colId;
  if (r < t.rows.length - 1) return { rowId: t.rows[r + 1]!.id, colId: col };
  addTableRow(board, t);
  const updated = board.store.get(t.id);
  return updated?.type === 'table' ? { rowId: updated.rows[updated.rows.length - 1]!.id, colId: col } : null;
}

// --- start view ---

/** The area the board opens on, shared by everyone; stored in the document's meta map. */
export function getStartView(board: Board): Rect | null {
  const v = getMetaMap(board.doc).get('startView') as Rect | undefined;
  return v && v.w > 0 && v.h > 0 ? v : null;
}

export function setStartView(board: Board, rect: Rect) {
  board.transact(() => getMetaMap(board.doc).set('startView', rect));
}

export function duplicate(board: Board, ids: string[]): string[] {
  const payload = copyPayload(board, ids);
  return payload ? pastePayload(board, payload, null) : [];
}

export type ConvertTarget = 'text' | 'sticky' | ShapeKind;

/** Turn a text-bearing object into another kind, keeping its id so that connectors stay attached. */
export function convertObject(board: Board, o: TextBearingObject, target: ConvertTarget) {
  const { id, z, locked, groupId, x, y, rotation, text, font, bold, italic, underline, strike, link } = o;
  const kept = { id, z, locked, groupId, x, y, rotation, text, font, bold, italic, underline, strike, link };
  const ink = o.type === 'text' ? o.color : isShapeObject(o) ? o.textColor : '#1a1a1a';
  let next: BoardObject;
  if (target === 'text') {
    const t = { ...makeText({ x, y }, z, ink), ...kept };
    next = { ...t, ...textBox(t) };
  } else if (target === 'sticky') {
    next = { ...makeSticky({ x, y }, z), ...kept };
  } else {
    // Bare text needs room to become a shape; a sticky or shape keeps its size and any shape keeps its style.
    const size =
      o.type === 'text' ? { w: Math.max(o.w + 40, 160), h: Math.max(o.h + 40, 100) } : { w: o.w, h: o.h };
    const shape = makeShape(target, { x, y, ...size }, z);
    const style = isShapeObject(o) ? { fill: o.fill, stroke: o.stroke, strokeWidth: o.strokeWidth } : {};
    next = { ...shape, ...style, ...kept, textColor: ink };
  }
  board.transact(() => insertObject(board.objects, next), true);
}

/** A text box takes the size its new style needs. */
export function fittedText(o: TextBearingObject, p: ObjectPatch): ObjectPatch {
  return o.type === 'text' ? { ...p, ...textBox({ ...o, ...p } as TextObject) } : p;
}

export function restyleText(board: Board, ids: string[], fn: (o: TextBearingObject) => ObjectPatch) {
  updateEach(board, ids, (o) => (hasText(o) ? fittedText(o, fn(o)) : null));
}

const FORMAT_KEYS = { b: 'bold', i: 'italic', u: 'underline' } as const;
const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

/**
 * Formatting keys, shared by the selection and the text editor, and applied to the object's whole text.
 * True if the keys meant something here and the browser's own meaning for them should be stopped.
 */
export function textShortcut(board: Board, ids: string[], e: KeyboardEvent | React.KeyboardEvent): boolean {
  if (!(isMac ? e.metaKey : e.ctrlKey) || e.altKey) return false;
  const targets = ids.filter((id) => {
    const o = board.store.get(id);
    return !!o && hasText(o) && !o.locked;
  });
  const lead = board.store.get(targets[0] ?? '');
  if (!lead || !hasText(lead)) return false;
  const key = e.key.toLowerCase();

  const toggle = !e.shiftKey
    ? FORMAT_KEYS[key as keyof typeof FORMAT_KEYS]
    : key === 'x'
      ? 'strike'
      : undefined;
  if (toggle) {
    const next = !lead[toggle];
    restyleText(board, targets, () => ({ [toggle]: next }));
    return true;
  }
  if (e.shiftKey && (key === '>' || key === '<')) {
    const dir = key === '>' ? 1 : -1;
    restyleText(board, targets, (o) =>
      o.type === 'text' ? { fontSize: stepFontSize(o.fontSize, dir) } : {},
    );
    return true;
  }
  if (e.shiftKey && (e.code === 'Digit7' || e.code === 'Digit8')) {
    const kind = e.code === 'Digit8' ? 'bullet' : 'number';
    restyleText(board, targets, (o) => ({ text: toggleList(o.text, kind) }));
    return true;
  }
  return false;
}

/** Lay a document's pages out on the board as separate images, beside it. Returns their ids. */
export function spreadDocument(board: Board, o: DocumentObject): string[] {
  const COLUMNS = 5;
  const GAP = 40;
  const pageW = o.w;
  const rowH = Math.max(...o.pages.map((p) => (p.h / p.w) * pageW));
  const keys = keysAbove(board.store.getSorted().at(-1)?.z ?? null, o.pages.length);
  const images = o.pages.map((p, i) => {
    const img = makeImage({ x: 0, y: 0 }, keys[i]!, p.assetId, p.w, p.h);
    return {
      ...img,
      x: o.x + o.w + GAP + (i % COLUMNS) * (pageW + GAP),
      y: o.y + Math.floor(i / COLUMNS) * (rowH + GAP),
      w: pageW,
      h: (p.h / p.w) * pageW,
    };
  });
  addObjects(board, images);
  return images.map((i) => i.id);
}
