import { BoardExport, compareZ, type BoardObject, type DocumentObject, type Rect } from '@canvasly/shared';
import { renderRegion } from '../canvas/renderer2d';
import { assetUrl, uploadAsset } from '../doc/assets';
import type { Board } from '../doc/board';
import { contentBounds, expandGroups, pastePayload, selectionBounds } from '../doc/ops';

const safeName = (title: string) =>
  title
    .replace(/[^\w\- ]+/g, '')
    .trim()
    .replace(/\s+/g, '-') || 'board';

export function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

const toBlob = (canvas: HTMLCanvasElement, type: string, quality?: number) =>
  new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Export failed'))), type, quality),
  );

/** PNG of the whole board, or of the given ids (selection) on a transparent-free background. */
export async function exportPng(board: Board, title: string, ids?: string[]) {
  const only = ids?.length ? new Set(expandGroups(board.store, ids)) : undefined;
  const rect = only ? selectionBounds(board.store, only) : contentBounds(board.store);
  if (!rect) throw new Error('Nothing to export');
  const canvas = await renderRegion(board.store, board.assetBase, rect, { scale: 2, only });
  download(await toBlob(canvas, 'image/png'), `${safeName(title)}${only ? '-selection' : ''}.png`);
}

/** PDF with one page per frame (in presentation order), or a single page of the whole board if there are none. */
export async function exportPdf(board: Board, title: string) {
  const frames = [...board.store.all()].filter((o) => o.type === 'frame').sort(compareZ);
  const pages: Rect[] = frames.length
    ? frames.map((f) => board.store.getBounds(f.id)!).filter(Boolean)
    : [contentBounds(board.store)].filter((r): r is Rect => !!r);
  if (!pages.length) throw new Error('Nothing to export');

  const { jsPDF } = await import('jspdf');
  let doc: InstanceType<typeof jsPDF> | null = null;
  for (const rect of pages) {
    const canvas = await renderRegion(board.store, board.assetBase, rect, {
      scale: 2,
      padding: frames.length ? 0 : 40,
    });
    // Page size follows the content's aspect ratio, ~1 CSS px per point at 100%.
    const w = canvas.width / 2;
    const h = canvas.height / 2;
    const orientation = w >= h ? 'landscape' : 'portrait';
    if (!doc) doc = new jsPDF({ orientation, unit: 'pt', format: [w, h], compress: true });
    else doc.addPage([w, h], orientation);
    doc.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, w, h);
  }
  download(doc!.output('blob'), `${safeName(title)}.pdf`);
}

const blobToDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });

/** A document's pages back as a PDF. They're images on the board, so its text can't be selected in the result. */
export async function exportDocumentPdf(board: Board, o: DocumentObject) {
  const { jsPDF } = await import('jspdf');
  let doc: InstanceType<typeof jsPDF> | null = null;
  for (const page of o.pages) {
    const res = await fetch(assetUrl(board.assetBase, page.assetId));
    if (!res.ok) throw new Error('A page of this document could not be loaded');
    const bitmap = await createImageBitmap(await res.blob());
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
    bitmap.close();
    const orientation = page.w >= page.h ? 'landscape' : 'portrait';
    if (!doc) doc = new jsPDF({ orientation, unit: 'pt', format: [page.w, page.h], compress: true });
    else doc.addPage([page.w, page.h], orientation);
    doc.addImage(canvas.toDataURL('image/jpeg', 0.9), 'JPEG', 0, 0, page.w, page.h);
  }
  doc?.save(`${safeName(o.title)}.pdf`);
}

/** Portable JSON (objects + embedded images) that can be imported into any board. */
export async function exportJson(board: Board, title: string) {
  const objects = board.store.getSorted();
  const assets: Record<string, string> = {};
  for (const o of objects) {
    const ids = o.type === 'image' ? [o.assetId] : o.type === 'pdf' ? o.pages.map((p) => p.assetId) : [];
    for (const id of ids) {
      if (assets[id]) continue;
      const res = await fetch(assetUrl(board.assetBase, id));
      if (res.ok) assets[id] = await blobToDataUrl(await res.blob());
    }
  }
  const file: BoardExport = {
    kind: 'canvasly/board',
    version: 1,
    title,
    exportedAt: Date.now(),
    objects,
    assets,
  };
  download(
    new Blob([JSON.stringify(file)], { type: 'application/json' }),
    `${safeName(title)}.canvasly.json`,
  );
}

/** Add a board export's contents to this board (new ids, re-uploaded images), centered at `at`. Returns new ids. */
export async function importJson(board: Board, file: File, at: { x: number; y: number }): Promise<string[]> {
  if (file.size > 50 * 1024 * 1024) throw new Error('File is larger than 50 MB');
  const parsed = BoardExport.safeParse(JSON.parse(await file.text()));
  if (!parsed.success) throw new Error("This isn't a Canvasly board file");
  const { objects, assets } = parsed.data;

  const assetMap = new Map<string, string>();
  for (const [oldId, dataUrl] of Object.entries(assets)) {
    const blob = await (await fetch(dataUrl)).blob();
    assetMap.set(oldId, await uploadAsset(board.id, blob));
  }
  const remapped: BoardObject[] = [];
  for (const o of objects) {
    if (o.type === 'image') {
      const assetId = assetMap.get(o.assetId);
      if (assetId) remapped.push({ ...o, assetId }); // images missing from the file are dropped
    } else if (o.type === 'pdf') {
      const pages = o.pages.flatMap((p) => {
        const assetId = assetMap.get(p.assetId);
        return assetId ? [{ ...p, assetId }] : [];
      });
      if (pages.length) remapped.push({ ...o, pages, page: 0 });
    } else {
      remapped.push(o);
    }
  }
  return pastePayload(board, { kind: 'canvasly/objects', version: 1, objects: remapped }, at);
}
