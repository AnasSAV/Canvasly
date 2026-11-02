import { describe, expect, it } from 'vitest';
import { buildLayers } from './model/layers';

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
