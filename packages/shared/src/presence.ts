import { z } from 'zod';

/** Distinct, readable-on-white cursor colors. */
export const PRESENCE_COLORS = [
  '#e03131',
  '#1971c2',
  '#2f9e44',
  '#f08c00',
  '#7048e8',
  '#c2255c',
  '#0c8599',
  '#5c940d',
  '#d6336c',
  '#4263eb',
] as const;

/** Stable color per user id (FNV-1a hash), so a person keeps their color across sessions and tabs. */
export function colorForUser(userId: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < userId.length; i++) {
    h ^= userId.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return PRESENCE_COLORS[(h >>> 0) % PRESENCE_COLORS.length]!;
}

const Finite = z.number().finite();

/** What each client publishes through Yjs awareness. Remote states are untrusted and parsed with this. */
export const PresenceState = z.object({
  user: z.object({
    id: z.string().max(64),
    name: z.string().max(120),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  }),
  /** Pointer in world coordinates, or null when it's off the canvas. */
  cursor: z.object({ x: Finite, y: Finite }).nullable(),
  selection: z.array(z.string().max(64)).max(1000),
  /** Camera (screen = world * zoom + (x, y)) and viewport size in CSS px; used by "follow". */
  viewport: z
    .object({ x: Finite, y: Finite, zoom: Finite.positive(), w: Finite.positive(), h: Finite.positive() })
    .nullable(),
});
export type PresenceState = z.infer<typeof PresenceState>;
export type PresenceViewport = NonNullable<PresenceState['viewport']>;
