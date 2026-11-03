/**
 * Board colors are stored as authored (light-theme values) so exports and other users are unaffected by
 * anyone's theme. In dark mode, near-black ink and near-white paper are swapped at render time so text, lines
 * and plain shapes stay readable, whatever shade of black or white they came with; other colors render as-is.
 */
const NEAR_BLACK = 60; // perceived brightness, 0 to 255
const NEAR_WHITE = 235; // lowest channel
const NEUTRAL = 14; // spread between channels: more than this is a tint, like a pale yellow

function channels(color: string): [number, number, number] | null {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color)?.[1];
  if (!hex) return null;
  const full = hex.length === 3 ? [...hex].map((c) => c + c).join('') : hex;
  const channel = (i: number) => parseInt(full.slice(i, i + 2), 16);
  return [channel(0), channel(2), channel(4)];
}

function brightness(color: string): number | null {
  const c = channels(color);
  return c && 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
}

/** White and the off-whites that frames and plain shapes use, as opposed to a color someone picked. */
export function isPaper(color: string): boolean {
  const c = channels(color);
  return !!c && Math.min(...c) >= NEAR_WHITE && Math.max(...c) - Math.min(...c) <= NEUTRAL;
}

export const ink = (color: string, dark: boolean) => {
  if (!dark) return color;
  const b = brightness(color);
  return b !== null && b < NEAR_BLACK ? '#e4efee' : color;
};
export const paper = (color: string, dark: boolean) => (dark && isPaper(color) ? '#1c2e30' : color);

export const canvasColors = (dark: boolean) =>
  dark
    ? { background: '#0c1718', grid: 'rgba(160,215,210,0.07)', frameBorder: '#3c5557', frameTitle: '#9db3b2' }
    : { background: '#eef2f1', grid: 'rgba(3,88,87,0.07)', frameBorder: '#b4c4c1', frameTitle: '#486362' };
