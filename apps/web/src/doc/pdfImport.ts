import type { DocumentPage } from '@canvasly/shared';
import { compressBitmap, uploadAsset } from './assets';

/** Each page is stored as an image on the board, so very long documents would use up its storage. */
export const MAX_PDF_PAGES = 100;
const MAX_PDF_BYTES = 100 * 1024 * 1024;
/** Longest side of a page image. Higher than other images, so that small print stays readable when zoomed in. */
const PAGE_SIDE = 2000;

export interface PdfProgress {
  done: number;
  total: number;
}

export class PdfCancelled extends Error {}

/**
 * Render a PDF's pages to images in the browser and upload them. Storing the file itself isn't an option: assets are
 * capped at 1 MB because they live in the board's Durable Object.
 */
export async function pdfToPages(
  file: File,
  boardId: string,
  onProgress: (p: PdfProgress) => void,
  cancelled: () => boolean,
): Promise<{ pages: DocumentPage[]; omitted: number }> {
  if (file.size > MAX_PDF_BYTES) throw new Error('This PDF is larger than 100 MB');
  // pdf.js is big, so it's only fetched when someone actually adds a PDF.
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).href;

  const task = pdfjs.getDocument({ data: await file.arrayBuffer() });
  try {
    const pdf = await task.promise.catch((e: Error) => {
      if (e.name === 'PasswordException') throw new Error('This PDF is password protected');
      throw new Error("This file couldn't be read as a PDF");
    });
    const total = Math.min(pdf.numPages, MAX_PDF_PAGES);
    const pages: DocumentPage[] = [];
    onProgress({ done: 0, total });
    for (let n = 1; n <= total; n++) {
      if (cancelled()) throw new PdfCancelled();
      const page = await pdf.getPage(n);
      const size = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({
        scale: Math.min(4, PAGE_SIDE / Math.max(size.width, size.height)),
      });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      await page.render({ canvas, viewport }).promise;
      const { blob } = await compressBitmap(canvas, PAGE_SIDE);
      pages.push({ assetId: await uploadAsset(boardId, blob), w: size.width, h: size.height });
      page.cleanup();
      canvas.width = 0; // release the bitmap's memory right away
      onProgress({ done: n, total });
    }
    return { pages, omitted: pdf.numPages - total };
  } finally {
    void task.destroy();
  }
}
