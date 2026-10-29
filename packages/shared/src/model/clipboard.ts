import { z } from 'zod';
import type { ResolvedConnector } from '../geometry/connectors';
import type { Vec } from '../geometry/vec';
import { BoardObject, type ConnectorEnd, type ConnectorObject } from '../schemas/objects';

export const ClipboardPayload = z.object({
  kind: z.literal('canvasly/objects'),
  version: z.literal(1),
  objects: z.array(BoardObject),
});
export type ClipboardPayload = z.infer<typeof ClipboardPayload>;

/**
 * Snapshot objects for the clipboard. Connector ends attached to objects outside the copied set are
 * frozen to their current world position so the payload is self-contained.
 */
export function prepareCopy(
  objects: readonly BoardObject[],
  resolve: (c: ConnectorObject) => ResolvedConnector | null,
): ClipboardPayload {
  const ids = new Set(objects.map((o) => o.id));
  const out: BoardObject[] = [];
  for (const o of objects) {
    if (o.type !== 'connector') {
      out.push(o);
      continue;
    }
    const r = resolve(o);
    if (!r) continue;
    const freeze = (end: ConnectorEnd, at: Vec): ConnectorEnd =>
      end.kind === 'attached' && !ids.has(end.objectId) ? { kind: 'point', x: at.x, y: at.y } : end;
    out.push({ ...o, start: freeze(o.start, r.start), end: freeze(o.end, r.end) });
  }
  return { kind: 'canvasly/objects', version: 1, objects: out };
}

/**
 * Fresh copies of clipboard objects: new ids, remapped groups/attachments, shifted by `offset`,
 * and assigned the given z keys (one per object, in input order).
 */
export function cloneForPaste(
  objects: readonly BoardObject[],
  offset: Vec,
  zKeys: readonly string[],
  newId: () => string,
): BoardObject[] {
  const idMap = new Map(objects.map((o) => [o.id, newId()]));
  const groupMap = new Map<string, string>();
  const mapGroup = (g: string | null) => {
    if (!g) return null;
    let n = groupMap.get(g);
    if (!n) {
      n = newId();
      groupMap.set(g, n);
    }
    return n;
  };
  const mapEnd = (end: ConnectorEnd): ConnectorEnd => {
    if (end.kind === 'point') return { kind: 'point', x: end.x + offset.x, y: end.y + offset.y };
    const mapped = idMap.get(end.objectId);
    // Attachments to objects not in the payload can only come from hand-made JSON; keep them.
    return mapped ? { ...end, objectId: mapped } : end;
  };

  return objects.map((o, i) => {
    const base = { id: idMap.get(o.id)!, z: zKeys[i]!, groupId: mapGroup(o.groupId), locked: false };
    if (o.type === 'connector') return { ...o, ...base, start: mapEnd(o.start), end: mapEnd(o.end) };
    return { ...o, ...base, x: o.x + offset.x, y: o.y + offset.y };
  });
}
