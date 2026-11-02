import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { resolveConnector } from '../geometry/connectors';
import {
  BoardObject,
  CHART_KINDS,
  SHAPE_KINDS,
  hasText,
  isShapeObject,
  type ConnectorObject,
} from '../schemas/objects';
import { cloneForPaste, prepareCopy } from './clipboard';
import {
  applyTextDiff,
  changedObjectIds,
  fromYObject,
  getObjectsMap,
  insertObject,
  patchObject,
  readObjects,
  removeCells,
} from './doc';
import { cellKey, makeChart, makeConnector, makeShape, makeSticky, makeTable, makeText } from './factories';
import { bringToFrontKeys, compareZ, keysAbove, sendToBackKeys } from './zorder';

function syncDocs(a: Y.Doc, b: Y.Doc) {
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)));
  Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)));
}

describe('doc helpers', () => {
  it('round-trips objects through Y.Maps with text as Y.Text', () => {
    const doc = new Y.Doc();
    const objects = getObjectsMap(doc);
    const sticky = { ...makeSticky({ x: 1, y: 2 }, 'a0'), text: 'hello' };
    insertObject(objects, sticky);
    const m = objects.get(sticky.id)!;
    expect(m.get('text')).toBeInstanceOf(Y.Text);
    expect(fromYObject(m)).toEqual(sticky);
  });

  it('rejects invalid objects on read', () => {
    const doc = new Y.Doc();
    const objects = getObjectsMap(doc);
    const m = new Y.Map<unknown>();
    m.set('id', 'x');
    m.set('type', 'sticky');
    objects.set('x', m);
    expect(readObjects(objects)).toEqual([]);
  });

  it('patches only changed fields and diffs text', () => {
    const doc = new Y.Doc();
    const objects = getObjectsMap(doc);
    const s = makeSticky({ x: 0, y: 0 }, 'a0');
    insertObject(objects, s);
    let updates = 0;
    doc.on('update', () => updates++);
    patchObject(objects, s.id, { x: 0, y: 0 });
    expect(updates).toBe(0);
    patchObject(objects, s.id, { x: 10, text: 'abc' });
    expect(fromYObject(objects.get(s.id)!)).toMatchObject({ x: 10, text: 'abc' });
    expect(patchObject(objects, 'missing', { x: 1 })).toBe(false);
  });

  it('merges concurrent text edits from two peers', () => {
    const a = new Y.Doc();
    const b = new Y.Doc();
    const s = makeSticky({ x: 0, y: 0 }, 'a0');
    insertObject(getObjectsMap(a), { ...s, text: 'hello world' });
    syncDocs(a, b);
    const ta = getObjectsMap(a).get(s.id)!.get('text') as Y.Text;
    const tb = getObjectsMap(b).get(s.id)!.get('text') as Y.Text;
    applyTextDiff(ta, 'hello brave world');
    applyTextDiff(tb, 'hello world!');
    syncDocs(a, b);
    expect(ta.toString()).toBe('hello brave world!');
    expect(tb.toString()).toBe('hello brave world!');
  });

  it('reports changed object ids from deep events', () => {
    const doc = new Y.Doc();
    const objects = getObjectsMap(doc);
    const s1 = makeSticky({ x: 0, y: 0 }, 'a0');
    const s2 = makeSticky({ x: 0, y: 0 }, 'a1');
    insertObject(objects, s1);
    insertObject(objects, s2);
    const seen: string[][] = [];
    objects.observeDeep((events) => seen.push([...changedObjectIds(events, objects)].sort()));
    doc.transact(() => {
      patchObject(objects, s1.id, { x: 5, text: 'x' });
      objects.delete(s2.id);
    });
    expect(seen).toEqual([[s1.id, s2.id].sort()]);
  });
});

describe('tables', () => {
  it('round-trips cells through a nested Y.Map and merges edits to different cells', () => {
    const a = new Y.Doc();
    const b = new Y.Doc();
    const t = makeTable({ x: 0, y: 0 }, 'a0', 2, 2);
    const k1 = cellKey(t.rows[0]!.id, t.columns[0]!.id);
    const k2 = cellKey(t.rows[1]!.id, t.columns[1]!.id);
    insertObject(getObjectsMap(a), t);
    syncDocs(a, b);
    expect(getObjectsMap(b).get(t.id)!.get('cells')).toBeInstanceOf(Y.Map);

    patchObject(getObjectsMap(a), t.id, { cells: { [k1]: 'from A' } });
    patchObject(getObjectsMap(b), t.id, { cells: { [k2]: 'from B' } });
    syncDocs(a, b);
    for (const doc of [a, b]) {
      const read = fromYObject(getObjectsMap(doc).get(t.id)!);
      expect(read?.type === 'table' && read.cells).toEqual({ [k1]: 'from A', [k2]: 'from B' });
    }

    removeCells(getObjectsMap(a), t.id, [k1]);
    const read = fromYObject(getObjectsMap(a).get(t.id)!);
    expect(read?.type === 'table' && read.cells).toEqual({ [k2]: 'from B' });
  });

  it('validates charts and tables', () => {
    expect(BoardObject.safeParse(makeTable({ x: 0, y: 0 }, 'a0')).success).toBe(true);
    for (const kind of CHART_KINDS) {
      expect(BoardObject.safeParse(makeChart({ x: 0, y: 0 }, 'a0', kind)).success).toBe(true);
    }
    const chart = makeChart({ x: 0, y: 0 }, 'a0');
    expect(BoardObject.safeParse({ ...chart, series: [] }).success).toBe(false);
  });

  it('accepts every shape kind and treats them all as text-bearing shapes', () => {
    for (const kind of SHAPE_KINDS) {
      const s = makeShape(kind, { x: 0, y: 0, w: 100, h: 100 }, 'a0');
      expect(BoardObject.safeParse(s).success).toBe(true);
      expect(isShapeObject(s)).toBe(true);
      expect(hasText(s)).toBe(true);
    }
  });
});

describe('fonts and text sizing', () => {
  it('reads older text as fixed-width in the default font; new text hugs its content', () => {
    const { font: _font, autoWidth: _autoWidth, ...old } = makeText({ x: 0, y: 0 }, 'a0');
    const parsed = BoardObject.parse(old);
    expect(parsed).toMatchObject({ font: 'sans', autoWidth: false });
    expect(makeText({ x: 0, y: 0 }, 'a0')).toMatchObject({ font: 'sans', autoWidth: true });
  });

  it('falls back to the default for a font this client does not know', () => {
    const sticky = { ...makeSticky({ x: 0, y: 0 }, 'a0'), font: 'from-the-future' };
    expect(BoardObject.parse(sticky)).toMatchObject({ font: 'sans' });
  });

  it('keeps an object font through the Yjs round trip', () => {
    const doc = new Y.Doc();
    const objects = getObjectsMap(doc);
    const s = makeShape('rect', { x: 0, y: 0, w: 100, h: 50 }, 'a0');
    insertObject(objects, s);
    patchObject(objects, s.id, { font: 'caveat' });
    expect(fromYObject(objects.get(s.id)!)).toMatchObject({ font: 'caveat' });
  });
});

describe('z-order', () => {
  const mk = (id: string, z: string) => ({ id, z });

  it('sorts by z then id', () => {
    const list = [mk('b', 'a1'), mk('a', 'a1'), mk('c', 'a0')].sort(compareZ);
    expect(list.map((o) => o.id)).toEqual(['c', 'a', 'b']);
  });

  it('brings to front and sends to back preserving relative order', () => {
    const [k0, k1, k2, k3] = keysAbove(null, 4) as [string, string, string, string];
    const sorted = [mk('a', k0), mk('b', k1), mk('c', k2), mk('d', k3)];
    const front = bringToFrontKeys(sorted, new Set(['a', 'c']));
    expect(front.get('a')! > k3).toBe(true);
    expect(front.get('c')! > front.get('a')!).toBe(true);
    const back = sendToBackKeys(sorted, new Set(['b', 'd']));
    expect(back.get('d')! < k0).toBe(true);
    expect(back.get('b')! < back.get('d')!).toBe(true);
  });
});

describe('clipboard', () => {
  const a = makeShape('rect', { x: 0, y: 0, w: 100, h: 50 }, 'a0');
  const b = makeShape('ellipse', { x: 300, y: 0, w: 100, h: 50 }, 'a1');
  const outside = makeShape('rect', { x: 0, y: 300, w: 100, h: 50 }, 'a2');
  const ab = makeConnector(
    { kind: 'attached', objectId: a.id, anchor: 'auto' },
    { kind: 'attached', objectId: b.id, anchor: 'auto' },
    'a3',
    { arrow: true },
  );
  const aOut = makeConnector(
    { kind: 'attached', objectId: a.id, anchor: 'auto' },
    { kind: 'attached', objectId: outside.id, anchor: [0.5, 0] },
    'a4',
    { arrow: false },
  );
  const all: Record<string, BoardObject> = { [a.id]: a, [b.id]: b, [outside.id]: outside };
  const resolve = (c: ConnectorObject) =>
    resolveConnector(c, (id) => {
      const o = all[id];
      return o && o.type !== 'connector' ? { ...o, outline: 'rect' } : undefined;
    });

  it('freezes attachments to objects outside the copied set', () => {
    const payload = prepareCopy([a, b, ab, aOut], resolve);
    const frozen = payload.objects.find((o) => o.id === aOut.id) as ConnectorObject;
    expect(frozen.start).toEqual(aOut.start);
    expect(frozen.end).toEqual({ kind: 'point', x: 50, y: 300 });
  });

  it('remaps ids, groups and attachments on paste', () => {
    let n = 0;
    const grouped = [
      { ...a, groupId: 'g1' },
      { ...b, groupId: 'g1' },
    ];
    const payload = prepareCopy([...grouped, ab], resolve);
    const pasted = cloneForPaste(payload.objects, { x: 20, y: 20 }, ['b0', 'b1', 'b2'], () => `n${n++}`);
    const [pa, pb, pc] = pasted as [BoardObject, BoardObject, ConnectorObject];
    expect(pa.id).not.toBe(a.id);
    expect(pa.groupId).toBe(pb.groupId);
    expect(pa.groupId).not.toBe('g1');
    expect(pa).toMatchObject({ x: 20, y: 20, z: 'b0' });
    expect(pc.start).toEqual({ kind: 'attached', objectId: pa.id, anchor: 'auto' });
    expect(pc.end).toEqual({ kind: 'attached', objectId: pb.id, anchor: 'auto' });
  });
});
