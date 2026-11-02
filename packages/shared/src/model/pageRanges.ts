export type PageRanges = { pages: number[] } | { error: string };

/**
 * Pages from what someone typed, like "1-3, 5, 8-": numbered from 1 as they read them, returned as indexes from 0 in
 * the order given, each once. An open end runs to the edge of the document.
 */
export function parsePageRanges(text: string, pageCount: number): PageRanges {
  const parts = text
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  if (!parts.length) return { error: 'Enter the pages to extract, like 1-3, 5' };

  const pages = new Set<number>();
  for (const part of parts) {
    const m = /^(\d*)\s*[-–—]\s*(\d*)$/.exec(part);
    const single = /^\d+$/.test(part);
    if (!single && (!m || (!m[1] && !m[2]))) return { error: `"${part}" isn't a page or a range` };
    const from = single ? Number(part) : m![1] ? Number(m![1]) : 1;
    const to = single ? Number(part) : m![2] ? Number(m![2]) : pageCount;
    if (from > to) return { error: `"${part}" runs backwards` };
    if (from < 1 || to > pageCount) {
      return { error: `This document has pages 1 to ${pageCount}` };
    }
    for (let n = from; n <= to; n++) pages.add(n - 1);
  }
  return { pages: [...pages] };
}
