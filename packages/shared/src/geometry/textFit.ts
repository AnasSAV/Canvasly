/** Width of `text` rendered at `fontSize`. */
export type MeasureText = (text: string, fontSize: number) => number;

/** Greedy word wrap; words longer than a line are broken by character. Preserves explicit newlines. */
export function wrapText(text: string, maxWidth: number, fontSize: number, measure: MeasureText): string[] {
  const lines: string[] = [];
  for (const para of text.split('\n')) {
    const words = para.split(/(\s+)/).filter((w) => w.length > 0);
    let line = '';
    for (const word of words) {
      const candidate = line + word;
      if (measure(candidate.trimEnd(), fontSize) <= maxWidth) {
        line = candidate;
        continue;
      }
      if (line.trim()) lines.push(line.trimEnd());
      line = '';
      if (/^\s+$/.test(word)) continue;
      if (measure(word, fontSize) <= maxWidth) {
        line = word;
        continue;
      }
      // Break overlong words character by character.
      let chunk = '';
      for (const ch of word) {
        if (measure(chunk + ch, fontSize) > maxWidth && chunk) {
          lines.push(chunk);
          chunk = ch;
        } else {
          chunk += ch;
        }
      }
      line = chunk;
    }
    lines.push(line.trimEnd());
  }
  return lines;
}

export interface FitOptions {
  min?: number;
  max?: number;
  lineHeight?: number;
}

/** Largest integer font size in [min, max] at which `text` wrapped to `width` fits within `height`. */
export function fitFontSize(
  text: string,
  width: number,
  height: number,
  measure: MeasureText,
  { min = 6, max = 48, lineHeight = 1.25 }: FitOptions = {},
): number {
  if (!text.trim()) return max;
  const fits = (size: number) => {
    const lines = wrapText(text, width, size, measure);
    if (lines.length * size * lineHeight > height) return false;
    return lines.every((l) => measure(l, size) <= width);
  };
  let lo = min;
  let hi = max;
  if (fits(hi)) return hi;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (fits(mid)) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}
