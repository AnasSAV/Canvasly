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

/** Which positions to leave alone: the longest run of keys that's already in order. */
function keysInOrder(keys: readonly string[]): Set<number> {
  const tails: number[] = [];
  const before = new Array<number>(keys.length).fill(-1);
  keys.forEach((key, i) => {
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (keys[tails[mid]!]! < key) lo = mid + 1;
      else hi = mid;
    }
    if (lo > 0) before[i] = tails[lo - 1]!;
    tails[lo] = i;
  });
  const kept = new Set<number>();
  for (let i = tails.at(-1) ?? -1; i >= 0; i = before[i]!) kept.add(i);
  return kept;
}

/**
 * New z keys that put objects in the given order, bottom first. Only what has to change changes, so that someone
 * else moving another object at the same moment still merges cleanly.
 */
export function keysForOrder(bottomUp: readonly Ordered[]): Map<string, string> {
  const kept = keysInOrder(bottomUp.map((o) => o.z));
  const keys = new Map<string, string>();
  for (let i = 0; i < bottomUp.length; i++) {
    if (kept.has(i)) continue;
    let end = i;
    while (end < bottomUp.length && !kept.has(end)) end++;
    const fresh = generateNKeysBetween(bottomUp[i - 1]?.z ?? null, bottomUp[end]?.z ?? null, end - i);
    for (let j = i; j < end; j++) keys.set(bottomUp[j]!.id, fresh[j - i]!);
    i = end;
  }
  return keys;
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
