/** Lists are part of the text itself, so they sync, wrap, export and copy like any other characters. */
export type ListKind = 'bullet' | 'number';

const BULLET = '• ';
const NUMBERED = /^(\d+)\. /;

function prefixLength(line: string): number {
  if (line.startsWith(BULLET)) return BULLET.length;
  return NUMBERED.exec(line)?.[0].length ?? 0;
}

function renumber(lines: string[]): string[] {
  let n = 0;
  return lines.map((line) => {
    const m = NUMBERED.exec(line);
    if (!m) {
      n = 0;
      return line;
    }
    n += 1;
    return `${n}. ${line.slice(m[0].length)}`;
  });
}

/** The list kind every non-empty line belongs to, or null. */
export function listKind(text: string): ListKind | null {
  const lines = text.split('\n').filter((l) => l.trim());
  if (!lines.length) return null;
  if (lines.every((l) => l.startsWith(BULLET))) return 'bullet';
  if (lines.every((l) => NUMBERED.test(l))) return 'number';
  return null;
}

/** Turn the text into a list of `kind`, or back into plain lines if it already is one. */
export function toggleList(text: string, kind: ListKind): string {
  const plain = text.split('\n').map((l) => l.slice(prefixLength(l)));
  if (listKind(text) === kind) return plain.join('\n');
  let n = 0;
  return plain
    .map((l) => {
      if (!l.trim() && plain.length > 1) return l;
      n += 1;
      return kind === 'bullet' ? `${BULLET}${l}` : `${n}. ${l}`;
    })
    .join('\n');
}

/**
 * What Enter does inside a list line: start the next item, or end the list if this item is empty.
 * Null when the caret isn't in a list, so the newline is typed normally.
 */
export function continueList(text: string, caret: number): { text: string; caret: number } | null {
  const start = text.lastIndexOf('\n', caret - 1) + 1;
  const nextBreak = text.indexOf('\n', caret);
  const end = nextBreak === -1 ? text.length : nextBreak;
  const line = text.slice(start, end);
  const prefix = prefixLength(line);
  if (!prefix || caret < start + prefix) return null;

  if (line.length === prefix) {
    const rest = text.slice(0, start) + text.slice(end);
    return { text: renumber(rest.split('\n')).join('\n'), caret: start };
  }
  const next = line.startsWith(BULLET) ? BULLET : `${Number(NUMBERED.exec(line)![1]) + 1}. `;
  const inserted = `${text.slice(0, caret)}\n${next}${text.slice(caret)}`;
  return { text: renumber(inserted.split('\n')).join('\n'), caret: caret + 1 + next.length };
}
