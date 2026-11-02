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
 * is, even if other objects were painted between its members.
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
