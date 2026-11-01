/**
 * Board colors are stored as authored (light-theme values) so exports and other users are unaffected by
 * anyone's theme. In dark mode the default "ink" and "paper" colors are swapped at render time so default
 * black text/lines and white shapes stay readable; every other color renders as-is.
 */
const INK = '#1a1a1a';
const PAPER = '#ffffff';

export const ink = (color: string, dark: boolean) =>
  dark && color.toLowerCase() === INK ? '#e7e7ea' : color;
export const paper = (color: string, dark: boolean) =>
  dark && color.toLowerCase() === PAPER ? '#2a2a30' : color;

export const canvasColors = (dark: boolean) =>
  dark
    ? { background: '#18181b', grid: 'rgba(255,255,255,0.05)', frameBorder: '#3f3f46', frameTitle: '#a1a1aa' }
    : { background: '#f2f2f3', grid: 'rgba(0,0,0,0.045)', frameBorder: '#d4d4d8', frameTitle: '#52525b' };
