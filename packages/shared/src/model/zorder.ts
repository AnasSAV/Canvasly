import { generateKeyBetween, generateNKeysBetween } from 'fractional-indexing';

interface Ordered {
  id: string;
  z: string;
}

/** Paint order: z ascending, ties (concurrent identical keys) broken by id. Plain comparison, not locale. */
export function compareZ(a: Ordered, b: Ordered): number {
  if (a.z !== b.z) return a.z < b.z ? -1 : 1;
  if (a.id !== b.id) return a.id < b.id ? -1 : 1;
  return 0;
}

/** Rendering/hit order: frames always sit beneath everything else, then z order. */
export function comparePaint(a: Ordered & { type: string }, b: Ordered & { type: string }): number {
  const fa = a.type === 'frame' ? 0 : 1;
  const fb = b.type === 'frame' ? 0 : 1;
  return fa !== fb ? fa - fb : compareZ(a, b);
}

export function keyAbove(top: string | null): string {
  return generateKeyBetween(top, null);
}

export function keysAbove(top: string | null, n: number): string[] {
  return generateNKeysBetween(top, null, n);
}

/** New z keys moving `ids` above everything, preserving their relative order. `sorted` must be in paint order. */
export function bringToFrontKeys(sorted: readonly Ordered[], ids: ReadonlySet<string>): Map<string, string> {
  const moving = sorted.filter((o) => ids.has(o.id));
  const top = sorted.at(-1)?.z ?? null;
  const keys = generateNKeysBetween(top, null, moving.length);
  return new Map(moving.map((o, i) => [o.id, keys[i]!]));
}

/** New z keys moving `ids` below everything, preserving their relative order. */
export function sendToBackKeys(sorted: readonly Ordered[], ids: ReadonlySet<string>): Map<string, string> {
  const moving = sorted.filter((o) => ids.has(o.id));
  const bottom = sorted[0]?.z ?? null;
  const keys = generateNKeysBetween(null, bottom, moving.length);
  return new Map(moving.map((o, i) => [o.id, keys[i]!]));
}
