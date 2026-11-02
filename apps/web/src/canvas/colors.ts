/**
 * Board colors are stored as authored (light-theme values) so exports and other users are unaffected by
 * anyone's theme. In dark mode, near-black ink and the default white paper are swapped at render time so text,
 * lines and plain shapes stay readable, whatever shade of black they came with; other colors render as-is.
 */
const PAPER = '#ffffff';
const NEAR_BLACK = 60; // perceived brightness, 0 to 255

function brightness(color: string): number | null {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color)?.[1];
  if (!hex) return null;
  const full = hex.length === 3 ? [...hex].map((c) => c + c).join('') : hex;
  const channel = (i: number) => parseInt(full.slice(i, i + 2), 16);
  return 0.299 * channel(0) + 0.587 * channel(2) + 0.114 * channel(4);
}

export const ink = (color: string, dark: boolean) => {
  if (!dark) return color;
  const b = brightness(color);
  return b !== null && b < NEAR_BLACK ? '#e7e7ea' : color;
};
export const paper = (color: string, dark: boolean) =>
  dark && color.toLowerCase() === PAPER ? '#2a2a30' : color;

export const canvasColors = (dark: boolean) =>
  dark
    ? { background: '#18181b', grid: 'rgba(255,255,255,0.05)', frameBorder: '#3f3f46', frameTitle: '#a1a1aa' }
    : { background: '#f2f2f3', grid: 'rgba(0,0,0,0.045)', frameBorder: '#d4d4d8', frameTitle: '#52525b' };
