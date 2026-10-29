import { describe, expect, it } from 'vitest';
import { PRESENCE_COLORS, PresenceState, colorForUser } from './presence';

describe('presence', () => {
  it('assigns stable colors from the palette', () => {
    expect(colorForUser('user-1')).toBe(colorForUser('user-1'));
    expect(PRESENCE_COLORS).toContain(colorForUser('someone-else'));
    const colors = new Set(Array.from({ length: 50 }, (_, i) => colorForUser(`u${i}`)));
    expect(colors.size).toBeGreaterThan(5);
  });

  it('accepts valid states and rejects malformed or hostile ones', () => {
    const ok = {
      user: { id: 'u1', name: 'Ada', color: '#e03131' },
      cursor: { x: 1, y: 2 },
      selection: ['a'],
      viewport: { x: 0, y: 0, zoom: 1, w: 800, h: 600 },
    };
    expect(PresenceState.safeParse(ok).success).toBe(true);
    expect(PresenceState.safeParse({ ...ok, cursor: null, viewport: null }).success).toBe(true);
    expect(
      PresenceState.safeParse({ ...ok, user: { ...ok.user, color: 'red;background:url(x)' } }).success,
    ).toBe(false);
    expect(PresenceState.safeParse({ ...ok, cursor: { x: Infinity, y: 0 } }).success).toBe(false);
    expect(PresenceState.safeParse({ ...ok, viewport: { ...ok.viewport, zoom: 0 } }).success).toBe(false);
  });
});
