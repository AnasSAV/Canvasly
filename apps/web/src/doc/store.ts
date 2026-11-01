import {
  aabb,
  changedObjectIds,
  comparePaint,
  expandRect,
  fromYObject,
  isBoxObject,
  polylineBounds,
  resolveConnector,
  type AttachTarget,
  type BoardObject,
  type ConnectorObject,
  type Rect,
  type ResolvedConnector,
  type YObjects,
} from '@canvasly/shared';
import RBush from 'rbush';
import type * as Y from 'yjs';

interface IndexItem {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  id: string;
}

/**
 * Plain-object mirror of the Y.Doc `objects` map for rendering.
 * Unchanged objects keep their identity so memoized React nodes skip re-rendering; an R-tree over
 * world bounds powers viewport culling and hit queries.
 */
export class DocStore {
  private objects = new Map<string, BoardObject>();
  private bounds = new Map<string, Rect>();
  private items = new Map<string, IndexItem>();
  private tree = new RBush<IndexItem>();
  /** objectId -> connectors attached to it */
  private dependents = new Map<string, Set<string>>();
  private sorted: BoardObject[] | null = null;
  private listeners = new Set<() => void>();
  private version = 0;

  constructor(private readonly ymap: YObjects) {
    ymap.forEach((m, id) => {
      const o = fromYObject(m);
      if (o) this.objects.set(id, o);
    });
    for (const o of this.objects.values()) this.trackDependents(o, null);
    const items: IndexItem[] = [];
    for (const id of this.objects.keys()) {
      const item = this.computeItem(id);
      if (item) items.push(item);
    }
    this.tree.load(items);
    ymap.observeDeep(this.onDeep);
  }

  dispose() {
    this.ymap.unobserveDeep(this.onDeep);
  }

  // --- subscription (useSyncExternalStore) ---
  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
  getVersion = () => this.version;

  // --- reads ---
  get(id: string): BoardObject | undefined {
    return this.objects.get(id);
  }
  has(id: string): boolean {
    return this.objects.has(id);
  }
  get size(): number {
    return this.objects.size;
  }
  all(): IterableIterator<BoardObject> {
    return this.objects.values();
  }
  /** All objects in paint order. */
  getSorted(): BoardObject[] {
    this.sorted ??= [...this.objects.values()].sort(comparePaint);
    return this.sorted;
  }
  getBounds(id: string): Rect | undefined {
    return this.bounds.get(id);
  }
  allBounds(): IterableIterator<[string, Rect]> {
    return this.bounds.entries();
  }
  /** Ids whose world bounds intersect `r`. */
  query(r: Rect): string[] {
    return this.tree.search({ minX: r.x, minY: r.y, maxX: r.x + r.w, maxY: r.y + r.h }).map((i) => i.id);
  }

  getAttachTarget = (id: string): AttachTarget | undefined => {
    const o = this.objects.get(id);
    if (!o || !isBoxObject(o)) return undefined;
    return { x: o.x, y: o.y, w: o.w, h: o.h, rotation: o.rotation, outline: o.type };
  };

  resolve = (c: Pick<ConnectorObject, 'start' | 'end' | 'routing'>): ResolvedConnector | null =>
    resolveConnector(c, this.getAttachTarget);

  connectorsAttachedTo(id: string): ReadonlySet<string> {
    return this.dependents.get(id) ?? new Set();
  }

  // --- updates ---
  private onDeep = (events: Y.YEvent<Y.AbstractType<unknown>>[]) => {
    const ids = changedObjectIds(events, this.ymap);
    const toReindex = new Set<string>();
    for (const id of ids) {
      const prev = this.objects.get(id) ?? null;
      const m = this.ymap.get(id);
      const next = m ? fromYObject(m) : null;
      if (next) this.objects.set(id, next);
      else this.objects.delete(id);
      this.trackDependents(next, prev);
      toReindex.add(id);
      for (const c of this.dependents.get(id) ?? []) toReindex.add(c);
    }
    for (const id of toReindex) {
      const old = this.items.get(id);
      if (old) this.tree.remove(old);
      this.items.delete(id);
      this.bounds.delete(id);
      const item = this.computeItem(id);
      if (item) this.tree.insert(item);
    }
    this.sorted = null;
    this.version++;
    for (const l of this.listeners) l();
  };

  private trackDependents(next: BoardObject | null, prev: BoardObject | null) {
    const ends = (o: BoardObject | null) =>
      o?.type === 'connector'
        ? [o.start, o.end].flatMap((e) => (e.kind === 'attached' ? [e.objectId] : []))
        : [];
    for (const target of ends(prev)) this.dependents.get(target)?.delete(prev!.id);
    for (const target of ends(next)) {
      let set = this.dependents.get(target);
      if (!set) this.dependents.set(target, (set = new Set()));
      set.add(next!.id);
    }
  }

  private computeItem(id: string): IndexItem | null {
    const o = this.objects.get(id);
    if (!o) return null;
    let r: Rect;
    if (o.type === 'connector') {
      const res = this.resolve(o);
      if (!res) return null;
      r = expandRect(polylineBounds(res.points), o.strokeWidth * 3 + 6);
    } else {
      r = aabb(o);
      if (o.type === 'pen') r = expandRect(r, o.size);
    }
    this.bounds.set(id, r);
    const item = { minX: r.x, minY: r.y, maxX: r.x + r.w, maxY: r.y + r.h, id };
    this.items.set(id, item);
    return item;
  }
}
