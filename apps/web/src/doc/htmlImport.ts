import { MAX_FONT_SIZE, ensureFont, matchFont, textBox } from '../canvas/text';
import {
  makeImage,
  makeShape,
  makeText,
  type BoardObject,
  type FontId,
  type Rect,
  type ShapeKind,
} from '@canvasly/shared';
import { compressImage, uploadAsset } from './assets';

/**
 * Turns rich content from the clipboard (other apps put styled HTML there) into board objects. The HTML is laid
 * out for real in a hidden iframe so that positions and styles come from the browser. The iframe is sandboxed
 * without scripts and locked down by CSP, so pasted markup can only ever produce plain objects.
 */

interface StyledText {
  kind: 'text';
  rect: Rect;
  text: string;
  font: FontId;
  fontSize: number;
  color: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  align: 'left' | 'center' | 'right';
  highlight: string;
  background: string;
  multiline: boolean;
}
interface Box {
  kind: 'box';
  rect: Rect;
  shape: ShapeKind;
  fill: string;
  stroke: string;
  strokeWidth: number;
}
interface Picture {
  kind: 'image';
  rect: Rect;
  src: string;
}
export type Imported = StyledText | Box | Picture;

const MAX_ITEMS = 1000;
const MAX_IMAGES = 60;
const LOAD_TIMEOUT_MS = 4000;
const SKIPPED = new Set(['script', 'style', 'meta', 'link', 'head', 'title', 'noscript', 'template', 'br']);
const TRANSPARENT = 'transparent';

const toHex = (n: string) => Math.round(Number(n)).toString(16).padStart(2, '0');

/** Computed `rgb()` to the #rrggbb our schema takes. Fully transparent and unknown colors give null. */
function cssColor(value: string): string | null {
  const m = /^rgba?\((\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?)(?:,\s*([\d.]+))?\)$/.exec(value);
  if (!m || m[4] === '0') return null;
  return `#${toHex(m[1]!)}${toHex(m[2]!)}${toHex(m[3]!)}`;
}

const toRect = (r: DOMRect): Rect => ({ x: r.left, y: r.top, w: r.width, h: r.height });

const isInline = (cs: CSSStyleDeclaration) => cs.display === 'inline' || cs.display === 'contents';

/** Text an element shows directly, with no block or image inside: it becomes a single text object. */
function isTextBlock(el: Element, win: Window): boolean {
  if (!el.textContent?.trim()) return false;
  for (const child of el.querySelectorAll('*')) {
    const tag = child.tagName.toLowerCase();
    if (tag === 'img' || tag === 'svg') return false;
    if (tag !== 'br' && !isInline(win.getComputedStyle(child))) return false;
  }
  return true;
}

function readText(el: HTMLElement, win: Window): StyledText | null {
  const doc = el.ownerDocument;
  const range = doc.createRange();
  range.selectNodeContents(el);
  const rect = range.getBoundingClientRect();
  const text = el.innerText.replace(/\s+$/, '');
  if (!text.trim() || !rect.width || !rect.height) return null;

  // Formatting applies to a whole object here, so the style covering the most characters decides.
  const counts = new Map<Element, number>();
  const walker = doc.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const parent = walker.currentNode.parentElement!;
    counts.set(parent, (counts.get(parent) ?? 0) + (walker.currentNode.textContent?.trim().length ?? 0));
  }
  const run = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? el;
  const cs = win.getComputedStyle(run);
  const color = cssColor(cs.color);
  if (!color) return null;

  // Text decoration isn't inherited in computed style, so look up through the ancestors.
  const lines = new Set<string>();
  let highlight: string | null = null;
  for (let at: Element | null = run; at; at = at === el ? null : at.parentElement) {
    const style = win.getComputedStyle(at);
    style.textDecorationLine.split(' ').forEach((l) => lines.add(l));
    if (at !== el) highlight ??= cssColor(style.backgroundColor);
  }
  const own = win.getComputedStyle(el);
  const fontSize = Math.max(4, Math.min(MAX_FONT_SIZE, Math.round(parseFloat(cs.fontSize) || 16)));
  return {
    kind: 'text',
    rect: toRect(rect),
    text,
    font: matchFont(cs.fontFamily),
    fontSize,
    color,
    bold: Number(cs.fontWeight) >= 600,
    italic: cs.fontStyle !== 'normal',
    underline: lines.has('underline'),
    strike: lines.has('line-through'),
    align: own.textAlign === 'center' ? 'center' : /right|end/.test(own.textAlign) ? 'right' : 'left',
    highlight: highlight ?? TRANSPARENT,
    background: (isInline(own) ? null : cssColor(own.backgroundColor)) ?? TRANSPARENT,
    multiline: rect.height > fontSize * 1.9,
  };
}

/** Inline SVG as an image, at double size so that it stays sharp when rasterized. */
function svgSource(el: Element, rect: Rect, win: Window): string {
  const copy = el.cloneNode(true) as Element;
  copy.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  if (!copy.getAttribute('viewBox')) copy.setAttribute('viewBox', `0 0 ${rect.w} ${rect.h}`);
  copy.setAttribute('width', String(rect.w * 2));
  copy.setAttribute('height', String(rect.h * 2));
  (copy as SVGElement).style.color = win.getComputedStyle(el).color;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(copy))}`;
}

function collect(root: Element, win: Window): Imported[] {
  const out: Imported[] = [];
  const visit = (el: Element) => {
    if (out.length >= MAX_ITEMS) return;
    const tag = el.tagName.toLowerCase();
    if (SKIPPED.has(tag)) return;
    const cs = win.getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return;
    const rect = toRect(el.getBoundingClientRect());
    const sized = rect.w > 0 && rect.h > 0;

    if (tag === 'img') {
      const src = (el as HTMLImageElement).currentSrc || (el as HTMLImageElement).src;
      if (src && sized) out.push({ kind: 'image', rect, src });
      return;
    }
    if (tag === 'svg') {
      if (sized) out.push({ kind: 'image', rect, src: svgSource(el, rect, win) });
      return;
    }
    if (isTextBlock(el, win)) {
      const text = readText(el as HTMLElement, win);
      if (text) out.push(text);
      return;
    }
    if (el !== root && sized) {
      const fill = cssColor(cs.backgroundColor);
      const borderWidth = parseFloat(cs.borderTopWidth) || 0;
      const stroke = borderWidth > 0 && cs.borderTopStyle !== 'none' ? cssColor(cs.borderTopColor) : null;
      if (fill || stroke) {
        const radius = parseFloat(cs.borderTopLeftRadius) || 0;
        const round = cs.borderTopLeftRadius.endsWith('%')
          ? radius >= 50
          : radius >= Math.min(rect.w, rect.h) / 2;
        out.push({
          kind: 'box',
          rect,
          shape: round ? 'ellipse' : radius > 0 ? 'roundrect' : 'rect',
          fill: fill ?? TRANSPARENT,
          stroke: stroke ?? TRANSPARENT,
          strokeWidth: stroke ? borderWidth : 0,
        });
      }
      const background = /^url\(["']?(.*?)["']?\)/.exec(cs.backgroundImage)?.[1];
      if (background) out.push({ kind: 'image', rect, src: background });
    }
    // Text sitting directly beside block children is measured on its own.
    for (const node of el.childNodes) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        visit(node as Element);
      } else if (node.nodeType === Node.TEXT_NODE && node.textContent?.trim()) {
        const wrapper = el.ownerDocument.createElement('span');
        node.replaceWith(wrapper);
        wrapper.append(node);
        const text = readText(wrapper, win);
        if (text) out.push(text);
      }
    }
  };
  visit(root);
  return out;
}

/** Lay the HTML out and read back what it shows. */
export function readHtml(html: string): Promise<Imported[]> {
  return new Promise((resolve) => {
    const frame = document.createElement('iframe');
    frame.setAttribute('sandbox', 'allow-same-origin');
    frame.setAttribute('aria-hidden', 'true');
    frame.tabIndex = -1;
    frame.style.cssText = 'position:fixed;left:-20000px;top:0;width:1600px;height:1200px;border:0;';
    frame.srcdoc =
      `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" ` +
      `content="default-src 'none'; img-src * data: blob:; style-src 'unsafe-inline'">` +
      `</head><body style="margin:0">${html}</body></html>`;

    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      const doc = frame.contentDocument;
      const win = frame.contentWindow;
      let items: Imported[] = [];
      try {
        if (doc?.body && win) items = collect(doc.body, win);
      } finally {
        frame.remove();
      }
      resolve(items);
    };
    frame.addEventListener('load', finish);
    // Remote images can hold up the load event; what they are is known without them.
    setTimeout(finish, LOAD_TIMEOUT_MS);
    document.body.append(frame);
  });
}

/** Images get copied onto the board, which needs their host to allow it. Null when it doesn't. */
export async function uploadPicture(boardId: string, src: string) {
  try {
    const res = await fetch(src);
    if (!res.ok) return null;
    const { blob, width, height } = await compressImage(await res.blob());
    return { assetId: await uploadAsset(boardId, blob), width, height };
  } catch {
    return null;
  }
}

/** Objects for what was read, positioned as they were laid out, plus how many images couldn't be copied. */
export async function toObjects(boardId: string, items: Imported[]) {
  const texts = items.filter((i) => i.kind === 'text');
  await Promise.all([...new Set(texts.map((t) => t.font))].map(ensureFont));

  let failed = 0;
  const pictures = items.filter((i) => i.kind === 'image');
  failed += Math.max(0, pictures.length - MAX_IMAGES);
  const allowed = new Set(pictures.slice(0, MAX_IMAGES));
  const uploads = new Map(
    await Promise.all([...allowed].map(async (p) => [p, await uploadPicture(boardId, p.src)] as const)),
  );

  const objects: BoardObject[] = [];
  for (const item of items) {
    const { x, y, w, h } = item.rect;
    if (item.kind === 'box') {
      const { shape, fill, stroke, strokeWidth } = item;
      objects.push({ ...makeShape(shape, { x, y, w, h }, '', { fill, stroke }), strokeWidth });
    } else if (item.kind === 'image') {
      const done = uploads.get(item);
      if (!done) {
        if (allowed.has(item)) failed += 1;
        continue;
      }
      objects.push({ ...makeImage({ x, y }, '', done.assetId, done.width, done.height), x, y, w, h });
    } else {
      const { text, font, fontSize, color, bold, italic, underline, strike, align, highlight, background } =
        item;
      const base = {
        ...makeText({ x, y }, '', color, fontSize),
        text,
        font,
        bold,
        italic,
        underline,
        strike,
        align,
        highlight,
        background,
        // A wrapped paragraph keeps its width; single lines fit their content.
        autoWidth: !item.multiline,
        w: Math.ceil(w) + 2,
      };
      objects.push({ ...base, ...textBox(base) });
    }
  }
  return { objects, failed };
}
