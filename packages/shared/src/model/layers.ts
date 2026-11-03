import { keysForOrder } from './zorder';

/** A row in the layers list: one object, or a group of them. */
export type LayerNode<T> =
  | { kind: 'object'; object: T }
  | {
      kind: 'group';
      groupId: string;
      /** Default name's number, counting groups from the bottom of the board up. */
      number: number;
      objects: T[];
    };

/**
 * Layers from objects in paint order, with what's painted last listed first. A group sits where its topmost member
 * is. Grouping and reordering keep a group's members together in paint order too, so this is also what's on top of
 * what; only members split up by people editing at the same moment can differ, until the next reorder gathers them.
 */
export function buildLayers<T extends { groupId: string | null }>(sorted: readonly T[]): LayerNode<T>[] {
  const numbers = new Map<string, number>();
  for (const o of sorted) {
    if (o.groupId && !numbers.has(o.groupId)) numbers.set(o.groupId, numbers.size + 1);
  }
  const nodes: LayerNode<T>[] = [];
  const groups = new Map<string, Extract<LayerNode<T>, { kind: 'group' }>>();
  for (let i = sorted.length - 1; i >= 0; i--) {
    const object = sorted[i]!;
    if (!object.groupId) {
      nodes.push({ kind: 'object', object });
      continue;
    }
    let group = groups.get(object.groupId);
    if (!group) {
      group = {
        kind: 'group',
        groupId: object.groupId,
        number: numbers.get(object.groupId)!,
        objects: [],
      };
      groups.set(object.groupId, group);
      nodes.push(group);
    }
    group.objects.push(object);
  }
  return nodes;
}

interface Layered {
  id: string;
  z: string;
  type: string;
  groupId: string | null;
}

/** Layers as a flat list of objects, top first. */
function flatten<T extends { groupId: string | null }>(sorted: readonly T[]): T[] {
  return buildLayers(sorted).flatMap((n) => (n.kind === 'object' ? [n.object] : n.objects));
}

/** Keys for a list order. Frames are painted beneath everything else whatever their key, so each kind has its own run. */
function keysForList(topFirst: readonly Layered[]): Map<string, string> {
  const bottomUp = [...topFirst].reverse();
  return new Map([
    ...keysForOrder(bottomUp.filter((o) => o.type !== 'frame')),
    ...keysForOrder(bottomUp.filter((o) => o.type === 'frame')),
  ]);
}

/** New z keys that bring each group's members together, at its topmost member. */
export function gatherGroupKeys(sorted: readonly Layered[]): Map<string, string> {
  return keysForList(flatten(sorted));
}

export interface LayerTarget {
  /** The object that ends up directly below what's moved in the list, or null for the very bottom. */
  beforeId: string | null;
  /** The group what's moved ends up in, or null for none. A whole group that's moved stays a group of its own. */
  groupId: string | null;
}

export interface LayerChange {
  z?: string;
  groupId?: string | null;
}

/**
 * What changes when objects are dragged to a new place in the list, in the list's order. Frames can't rise above other
 * objects, as they're always painted beneath them, so they stay among the frames, and a group left with one
 * object stops being a group.
 */
export function moveLayers(
  sorted: readonly Layered[],
  ids: ReadonlySet<string>,
  target: LayerTarget,
): Map<string, LayerChange> {
  const list = flatten(sorted);
  const moving = list.filter((o) => ids.has(o.id));
  if (!moving.length) return new Map();

  const staying = list.filter((o) => !ids.has(o.id));
  const start = target.beforeId === null ? -1 : list.findIndex((o) => o.id === target.beforeId);
  const below = start < 0 ? undefined : list.slice(start).find((o) => !ids.has(o.id));
  const at = below ? staying.indexOf(below) : staying.length;

  const groupOf = new Map<string, string | null>();
  const whole = (groupId: string) => staying.every((o) => o.groupId !== groupId);
  for (const o of moving) groupOf.set(o.id, o.groupId && whole(o.groupId) ? o.groupId : target.groupId);

  const placed = [...staying.slice(0, at), ...moving, ...staying.slice(at)].map((o) => ({
    ...o,
    groupId: groupOf.has(o.id) ? groupOf.get(o.id)! : o.groupId,
  }));

  const sizes = new Map<string, number>();
  for (const o of placed) if (o.groupId) sizes.set(o.groupId, (sizes.get(o.groupId) ?? 0) + 1);
  const settled = placed.map((o) => (o.groupId && sizes.get(o.groupId) === 1 ? { ...o, groupId: null } : o));

  // Going through the list once more keeps every group in one piece, wherever the drop landed.
  const order = flatten([...settled].reverse());
  const keys = keysForList(order);
  const before = new Map(sorted.map((o) => [o.id, o]));
  const changes = new Map<string, LayerChange>();
  for (const o of order) {
    const change: LayerChange = {};
    const z = keys.get(o.id);
    if (z) change.z = z;
    if (o.groupId !== before.get(o.id)!.groupId) change.groupId = o.groupId;
    if (Object.keys(change).length) changes.set(o.id, change);
  }
  return changes;
}
