import * as Y from 'yjs';
import { BoardObject } from '../schemas/objects';

/** Each board object lives in the root `objects` map as a nested Y.Map; text fields are Y.Text. */
export type YObject = Y.Map<unknown>;
export type YObjects = Y.Map<YObject>;

export const getObjectsMap = (doc: Y.Doc): YObjects => doc.getMap<YObject>('objects');
export const getMetaMap = (doc: Y.Doc): Y.Map<unknown> => doc.getMap<unknown>('meta');

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type UnionToIntersection<U> = (U extends unknown ? (x: U) => void : never) extends (x: infer I) => void
  ? I
  : never;

/** Any subset of fields across all object types (id/type are immutable). */
export type ObjectPatch = Partial<UnionToIntersection<DistributiveOmit<BoardObject, 'id' | 'type'>>>;

export function toYObject(obj: BoardObject): YObject {
  const m = new Y.Map<unknown>();
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    if (k === 'text' && typeof v === 'string') m.set(k, new Y.Text(v));
    else if (k === 'cells') m.set(k, new Y.Map(Object.entries(v as Record<string, string>)));
    else m.set(k, v);
  }
  return m;
}

/** Plain, validated snapshot of a Y object, or null if it doesn't match the schema. */
export function fromYObject(m: YObject): BoardObject | null {
  const r = BoardObject.safeParse(m.toJSON());
  return r.success ? r.data : null;
}

export function insertObject(objects: YObjects, obj: BoardObject): void {
  objects.set(obj.id, toYObject(obj));
}

/** Minimal edit turning `ytext` into `next` (common prefix/suffix diff) so concurrent edits merge well. */
export function applyTextDiff(ytext: Y.Text, next: string): void {
  const prev = ytext.toString();
  if (prev === next) return;
  let start = 0;
  const minLen = Math.min(prev.length, next.length);
  while (start < minLen && prev[start] === next[start]) start++;
  let endPrev = prev.length;
  let endNext = next.length;
  while (endPrev > start && endNext > start && prev[endPrev - 1] === next[endNext - 1]) {
    endPrev--;
    endNext--;
  }
  if (endPrev > start) ytext.delete(start, endPrev - start);
  if (endNext > start) ytext.insert(start, next.slice(start, endNext));
}

function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Apply only the fields that actually changed. Returns false if the object doesn't exist. */
export function patchObject(objects: YObjects, id: string, patch: ObjectPatch): boolean {
  const m = objects.get(id);
  if (!m) return false;
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    const cur = m.get(k);
    if (cur instanceof Y.Text && typeof v === 'string') {
      applyTextDiff(cur, v);
    } else if (cur instanceof Y.Map && k === 'cells') {
      // Cells merge key by key; removing rows and columns goes through removeCells().
      for (const [key, text] of Object.entries(v as Record<string, string>)) {
        if (cur.get(key) !== text) cur.set(key, text);
      }
    } else if (!sameValue(cur, v)) {
      m.set(k, k === 'text' && typeof v === 'string' ? new Y.Text(v) : v);
    }
  }
  return true;
}

/** Delete table cells, e.g. when their row or column is removed. */
export function removeCells(objects: YObjects, id: string, keys: Iterable<string>): void {
  const cells = objects.get(id)?.get('cells');
  if (cells instanceof Y.Map) for (const key of keys) cells.delete(key);
}

export function readObjects(objects: YObjects): BoardObject[] {
  const out: BoardObject[] = [];
  objects.forEach((m) => {
    const o = fromYObject(m);
    if (o) out.push(o);
  });
  return out;
}

/** Object ids touched by a batch of observeDeep events on the objects map. */
export function changedObjectIds(events: readonly Y.YEvent<Y.AbstractType<unknown>>[], objects: YObjects) {
  const ids = new Set<string>();
  for (const e of events) {
    if (e.target === objects) {
      for (const k of e.changes.keys.keys()) ids.add(k);
    } else {
      const first = e.path[0];
      if (typeof first === 'string') ids.add(first);
    }
  }
  return ids;
}
