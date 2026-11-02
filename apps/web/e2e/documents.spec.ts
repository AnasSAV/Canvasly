import { expect, test, type Page } from '@playwright/test';
import { jsPDF } from 'jspdf';
import type * as UIModule from '../src/state/ui';
import { createBoard, openBoard, signUp } from './helpers';

type Obj = Record<string, unknown> & { id: string; type: string; x: number; y: number; w: number; h: number };

const all = (page: Page) =>
  page.evaluate(() => [...window.__canvasly!.store.all()] as unknown as Record<string, unknown>[]) as Promise<
    Obj[]
  >;
const documents = async (page: Page) => (await all(page)).filter((o) => o.type === 'pdf');

/** A real PDF, with pages of two sizes. */
function pdf(pages = 3): Buffer {
  const doc = new jsPDF({ unit: 'pt', format: [400, 600] });
  doc.setFontSize(40);
  doc.text('Page 1', 60, 100);
  for (let n = 2; n <= pages; n++) {
    doc.addPage([400, 600]);
    doc.text(`Page ${n}`, 60, 100);
  }
  return Buffer.from(doc.output('arraybuffer'));
}

/** Fire drag events as the browser would for a file coming from outside the page. */
async function drag(
  page: Page,
  type: 'dragenter' | 'dragleave' | 'dragover' | 'drop',
  files: { name: string; mime: string; bytes: number[] }[],
  at = { x: 700, y: 450 },
) {
  await page.getByTestId('board-root').evaluate(
    (root, { type, files, at }) => {
      const dt = new DataTransfer();
      for (const f of files) dt.items.add(new File([new Uint8Array(f.bytes)], f.name, { type: f.mime }));
      root.dispatchEvent(
        new DragEvent(type, {
          dataTransfer: dt,
          bubbles: true,
          cancelable: true,
          clientX: at.x,
          clientY: at.y,
        }),
      );
    },
    { type, files, at },
  );
}

const pdfFile = (pages = 3) => ({ name: 'Report.pdf', mime: 'application/pdf', bytes: [...pdf(pages)] });

test.beforeEach(async ({ page }) => {
  await signUp(page.request);
  await openBoard(page, await createBoard(page.request));
});

test('uploading a PDF makes one object that turns pages', async ({ page }) => {
  await page.getByTestId('file-input').setInputFiles({
    name: 'Quarterly report.pdf',
    mimeType: 'application/pdf',
    buffer: pdf(3),
  });
  await expect.poll(async () => (await documents(page)).length, { timeout: 30_000 }).toBe(1);
  const doc = (await documents(page))[0]!;
  expect(doc).toMatchObject({ title: 'Quarterly report', page: 0, w: 480, h: 720 });
  expect(doc.pages).toHaveLength(3);

  // It's selected, with the toolbar from Miro.
  await expect(page.getByTestId('doc-title')).toHaveText('Quarterly report');
  await expect(page.getByTestId('doc-page')).toHaveValue('1');
  await expect(page.getByTestId('doc-count')).toHaveText('of 3');
  await expect(page.getByTestId('doc-prev')).toBeDisabled();

  await page.getByTestId('doc-next').click();
  await expect.poll(async () => (await documents(page))[0]!.page).toBe(1);
  await expect(page.getByTestId('doc-page')).toHaveValue('2');

  await page.getByTestId('doc-page').fill('3');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await documents(page))[0]!.page).toBe(2);
  await expect(page.getByTestId('doc-next')).toBeDisabled();

  // Out of range goes to the nearest page.
  await page.getByTestId('doc-page').fill('99');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('doc-page')).toHaveValue('3');

  // Pages really are stored and served.
  const first = (doc.pages as { assetId: string }[])[0]!.assetId;
  const res = await page.request.get(`/api/boards/${await boardId(page)}/assets/${first}`);
  expect(res.ok()).toBe(true);
  expect(res.headers()['content-type']).toContain('image/webp');
});

const boardId = (page: Page) => Promise.resolve(new URL(page.url()).pathname.split('/').pop()!);

test('dragging a file over the board asks to release it, and it lands where dropped', async ({ page }) => {
  const overlay = page.getByTestId('drop-overlay');
  await expect(overlay).toHaveCount(0);
  await drag(page, 'dragenter', [pdfFile()]);
  await expect(overlay).toContainText('Release to add it');

  // Crossing children fires more enters and leaves: only leaving the last one counts.
  await drag(page, 'dragenter', [pdfFile()]);
  await drag(page, 'dragleave', [pdfFile()]);
  await expect(overlay).toBeVisible();
  await drag(page, 'dragleave', [pdfFile()]);
  await expect(overlay).toHaveCount(0);

  await drag(page, 'dragenter', [pdfFile()]);
  await drag(page, 'drop', [pdfFile()], { x: 900, y: 500 });
  await expect(overlay).toHaveCount(0);
  await expect.poll(async () => (await documents(page)).length, { timeout: 30_000 }).toBe(1);
  const doc = (await documents(page))[0]!;
  // World (0,0) is at the center of the 1400x900 view: the document is centered on the drop.
  expect(doc.x + doc.w / 2).toBeCloseTo(200, 0);
  expect(doc.y + doc.h / 2).toBeCloseTo(50, 0);
});

test('dropped images still work, unsupported files are named, and dragging other things is ignored', async ({
  page,
}) => {
  const png = await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 20;
    const blob = await new Promise<Blob>((r) => canvas.toBlob((b) => r(b!), 'image/png'));
    return [...new Uint8Array(await blob.arrayBuffer())];
  });
  // The message blocks the page until it's dismissed, so the drop can't be awaited before that.
  const dialog = page.waitForEvent('dialog');
  const dropped = drag(page, 'drop', [
    { name: 'photo.png', mime: 'image/png', bytes: png },
    { name: 'notes.docx', mime: 'application/msword', bytes: [1, 2, 3] },
  ]);
  const d = await dialog;
  expect(d.message()).toContain('notes.docx');
  await d.dismiss();
  await dropped;
  await expect.poll(async () => (await all(page)).filter((o) => o.type === 'image').length).toBe(1);

  // Text or objects dragged around aren't files, so no overlay.
  await page.getByTestId('board-root').evaluate((root) => {
    const dt = new DataTransfer();
    dt.setData('text/plain', 'just text');
    root.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt, bubbles: true, cancelable: true }));
  });
  await expect(page.getByTestId('drop-overlay')).toHaveCount(0);
});

test('a broken PDF is reported, and leaves nothing behind', async ({ page }) => {
  const dialog = page.waitForEvent('dialog');
  await page.getByTestId('file-input').setInputFiles({
    name: 'broken.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('this is not a pdf'),
  });
  const d = await dialog;
  expect(d.message()).toContain("couldn't be read as a PDF");
  await d.dismiss();
  await expect(page.getByTestId('import-progress')).toHaveCount(0);
  expect(await all(page)).toHaveLength(0);
});

test('pages spread onto the board, the PDF downloads, and one undo removes the document', async ({
  page,
}) => {
  await page.getByTestId('file-input').setInputFiles({
    name: 'Spread.pdf',
    mimeType: 'application/pdf',
    buffer: pdf(2),
  });
  await expect.poll(async () => (await documents(page)).length, { timeout: 30_000 }).toBe(1);

  const download = page.waitForEvent('download');
  await page.getByTestId('doc-download').click();
  expect((await download).suggestedFilename()).toBe('Spread.pdf');

  await page.getByTestId('doc-spread').click();
  await expect.poll(async () => (await all(page)).filter((o) => o.type === 'image').length).toBe(2);
  const images = (await all(page)).filter((o) => o.type === 'image').sort((a, b) => a.x - b.x);
  expect(images[1]!.x).toBeGreaterThan(images[0]!.x + images[0]!.w);

  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await all(page)).filter((o) => o.type === 'image').length).toBe(0);
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await all(page)).length).toBe(0);
});

test('a viewer can turn pages for themselves, without changing them for anyone', async ({ page }) => {
  await page.getByTestId('file-input').setInputFiles({
    name: 'Shared.pdf',
    mimeType: 'application/pdf',
    buffer: pdf(2),
  });
  await expect.poll(async () => (await documents(page)).length, { timeout: 30_000 }).toBe(1);
  await page.evaluate(async (url) => {
    const mod = (await import(/* @vite-ignore */ url)) as typeof UIModule;
    mod.useUI.getState().setReadOnly(true);
  }, '/src/state/ui.ts');

  await page.getByTestId('doc-next').click();
  await expect(page.getByTestId('doc-page')).toHaveValue('2');
  expect((await documents(page))[0]!.page).toBe(0);
  await expect(page.getByTestId('doc-spread')).toHaveCount(0);
  await expect(page.getByTestId('selection-more')).toHaveCount(0);
});
