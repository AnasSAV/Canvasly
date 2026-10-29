import {
  aabb,
  bringToFrontKeys,
  cloneForPaste,
  insertObject,
  keyAbove,
  keysAbove,
  newId,
  patchObject,
  prepareCopy,
  sendToBackKeys,
  unionRects,
  type BoardObject,
  type ClipboardPayload,
  type ConnectorEnd,
  type ObjectPatch,
  type Rect,
  type Vec,
} from '@canvasly/shared';
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

export function duplicate(board: Board, ids: string[]): string[] {
  const payload = copyPayload(board, ids);
  return payload ? pastePayload(board, payload, null) : [];
}
