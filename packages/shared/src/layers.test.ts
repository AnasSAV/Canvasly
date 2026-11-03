import { describe, expect, it } from 'vitest';
import { buildLayers, gatherGroupKeys, moveLayers, type LayerTarget } from './model/layers';
import { comparePaint, keysAbove, keysForOrder } from './model/zorder';

const o = (id: string, groupId: string | null = null) => ({ id, groupId });

/** Layers as nested ids, for easy comparison. */
const shape = (objects: ReturnType<typeof o>[]) =>
  buildLayers(objects).map((n) => (n.kind === 'object' ? n.object.id : n.objects.map((m) => m.id)));

describe('buildLayers', () => {
  it('lists what is painted last first', () => {
    expect(shape([o('a'), o('b'), o('c')])).toEqual(['c', 'b', 'a']);
  });

  it('gathers a group at its topmost member, even with others painted between', () => {
    expect(shape([o('a', 'g'), o('b'), o('c', 'g'), o('d')])).toEqual(['d', ['c', 'a'], 'b']);
  });

  it('numbers groups from the bottom of the board up', () => {
    const nodes = buildLayers([o('a', 'first'), o('b', 'second'), o('c', 'first')]);
    const numbers = nodes.map((n) => (n.kind === 'group' ? [n.groupId, n.number] : null));
    expect(numbers).toEqual([
      ['first', 1],
      ['second', 2],
    ]);
  });

  it('handles an empty board', () => {
    expect(buildLayers([])).toEqual([]);
  });
});

describe('reordering', () => {
  type Item = { id: string; z: string; type: string; groupId: string | null };

  /** Objects in paint order, bottom first; `f` makes a frame, and `name:g` puts it in group g. */
  const board = (...names: string[]): Item[] => {
    const keys = keysAbove(null, names.length);
    return names.map((name, i) => {
      const [id, groupId] = name.split(':') as [string, string | undefined];
      return { id, z: keys[i]!, type: id.startsWith('f') ? 'frame' : 'rect', groupId: groupId ?? null };
    });
  };

  const apply = (items: Item[], changes: ReturnType<typeof moveLayers>): Item[] =>
    items.map((o) => ({ ...o, ...changes.get(o.id) })).sort(comparePaint);

  /** What's painted, top first, with each object's group. */
  const painted = (items: Item[]) =>
    [...items].reverse().map((o) => (o.groupId ? `${o.id}:${o.groupId}` : o.id));

  const move = (items: Item[], ids: string[], target: Partial<LayerTarget>) =>
    painted(apply(items, moveLayers(items, new Set(ids), { beforeId: null, groupId: null, ...target })));

  it('moves an object, and the paint order follows the list', () => {
    const items = board('a', 'b', 'c', 'd');
    expect(move(items, ['a'], { beforeId: 'c' })).toEqual(['d', 'a', 'c', 'b']);
    expect(move(items, ['d'], {})).toEqual(['c', 'b', 'a', 'd']);
    expect(move(items, ['b'], { beforeId: 'd' })).toEqual(['b', 'd', 'c', 'a']);
  });

  it('changes as few objects as it can', () => {
    const items = board('a', 'b', 'c', 'd', 'e');
    const changes = moveLayers(items, new Set(['a']), { beforeId: 'c', groupId: null });
    expect([...changes.keys()]).toEqual(['a']);
  });

  it('changes nothing when dropped where it already is', () => {
    const items = board('a', 'b', 'c');
    expect(moveLayers(items, new Set(['b']), { beforeId: 'a', groupId: null }).size).toBe(0);
    expect(moveLayers(items, new Set(['b']), { beforeId: 'b', groupId: null }).size).toBe(0);
  });

  it('keeps several objects in their order when they move together', () => {
    const items = board('a', 'b', 'c', 'd', 'e');
    expect(move(items, ['a', 'c'], { beforeId: 'd' })).toEqual(['e', 'c', 'a', 'd', 'b']);
  });

  it('moves a whole group as one, keeping it a group even if dropped inside another', () => {
    const items = board('a', 'b:g', 'c:g', 'd');
    expect(move(items, ['b', 'c'], { beforeId: 'd' })).toEqual(['c:g', 'b:g', 'd', 'a']);
    expect(move(board('a:h', 'b:h', 'c:g', 'd:g'), ['c', 'd'], { beforeId: 'a', groupId: 'h' })).toEqual([
      'b:h',
      'a:h',
      'd:g',
      'c:g',
    ]);
  });

  it('takes an object into a group, and back out', () => {
    const items = board('a:g', 'b:g', 'c');
    expect(move(items, ['c'], { beforeId: 'a', groupId: 'g' })).toEqual(['b:g', 'c:g', 'a:g']);
    const three = board('a:g', 'b:g', 'c:g', 'd');
    expect(move(three, ['b'], { beforeId: 'd' })).toEqual(['b', 'd', 'c:g', 'a:g']);
  });

  it('stops being a group once only one object is left in it', () => {
    expect(move(board('a:g', 'b:g', 'c'), ['b'], { beforeId: 'c' })).toEqual(['b', 'c', 'a']);
  });

  it('keeps frames beneath everything else', () => {
    const items = board('f1', 'f2', 'a', 'b');
    expect(move(items, ['f1'], { beforeId: 'b' })).toEqual(['b', 'a', 'f1', 'f2']);
    expect(move(items, ['b'], {})).toEqual(['a', 'b', 'f2', 'f1']);
    expect(move(items, ['f1'], { beforeId: 'f2' })).toEqual(['b', 'a', 'f1', 'f2']);
  });

  it('gathers a group split up by other objects at its topmost member', () => {
    const items = board('a:g', 'b', 'c:g', 'd');
    const keys = gatherGroupKeys(items);
    const after = items.map((o) => ({ ...o, z: keys.get(o.id) ?? o.z })).sort(comparePaint);
    expect(painted(after)).toEqual(['d', 'c:g', 'a:g', 'b']);
    expect(gatherGroupKeys(after).size).toBe(0);
  });

  it('gives keys that sort in the requested order, whatever order they started in', () => {
    const [a, b, c, d] = keysAbove(null, 4) as [string, string, string, string];
    const items = [
      { id: '1', z: c },
      { id: '2', z: a },
      { id: '3', z: d },
      { id: '4', z: b },
      { id: '5', z: b },
    ];
    const keys = keysForOrder(items);
    const final = items.map((o) => keys.get(o.id) ?? o.z);
    expect(final).toEqual([...final].sort());
    expect(new Set(final).size).toBe(items.length);
  });
});
