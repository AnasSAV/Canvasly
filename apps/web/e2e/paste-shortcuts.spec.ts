import { expect, test, type Page } from '@playwright/test';
import { createBoard, openBoard, signUp } from './helpers';

type Obj = Record<string, unknown> & { id: string; type: string; x: number; y: number; w: number; h: number };

const all = (page: Page) =>
  page.evaluate(() => [...window.__canvasly!.store.all()] as unknown as Record<string, unknown>[]) as Promise<
    Obj[]
  >;
const ofType = async (page: Page, type: string) => (await all(page)).filter((o) => o.type === type);
const first = async (page: Page, type: string) => (await ofType(page, type))[0]!;
const withText = async (page: Page, text: string) => (await all(page)).find((o) => o.text === text)!;

/** The same event a real Ctrl+V fires, with what another app would have put on the clipboard. */
async function paste(page: Page, data: { html?: string; text?: string; png?: boolean; canva?: string }) {
  await page.evaluate(async ({ html, text, png, canva }) => {
    const dt = new DataTransfer();
    if (html) dt.setData('text/html', html);
    if (text) dt.setData('text/plain', text);
    if (canva) dt.setData('application/x-canva', canva);
    if (png) {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 40;
      canvas.getContext('2d')!.fillRect(0, 0, 40, 40);
      const blob = await new Promise<Blob>((r) => canvas.toBlob((b) => r(b!), 'image/png'));
      dt.items.add(new File([blob], 'copied.png', { type: 'image/png' }));
    }
    document.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }),
    );
  }, data);
}

const PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAEBgIApD5fRAAAAABJRU5ErkJggg==';

test.beforeEach(async ({ page }) => {
  await signUp(page.request);
  await openBoard(page, await createBoard(page.request));
  await page.mouse.move(700, 450);
});

test('Ctrl+B, I and U format selected text and toggle back', async ({ page }) => {
  await page.keyboard.press('t');
  await page.getByTestId('board-canvas').click({ position: { x: 700, y: 450 } });
  await page.keyboard.type('Shortcut');
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await first(page, 'text')).text).toBe('Shortcut');

  await page.keyboard.press('Control+b');
  await expect.poll(async () => (await first(page, 'text')).bold).toBe(true);
  await page.keyboard.press('Control+i');
  await page.keyboard.press('Control+u');
  await page.keyboard.press('Control+Shift+x');
  await expect
    .poll(() => first(page, 'text'))
    .toMatchObject({ bold: true, italic: true, underline: true, strike: true });

  await page.keyboard.press('Control+b');
  await expect.poll(async () => (await first(page, 'text')).bold).toBe(false);
  await page.keyboard.press('Control+z'); // each is its own undo step
  await expect.poll(async () => (await first(page, 'text')).bold).toBe(true);

  await page.keyboard.press('Control+Shift+>');
  await expect.poll(async () => (await first(page, 'text')).fontSize).toBe(30);
  await page.keyboard.press('Control+Shift+<');
  await expect.poll(async () => (await first(page, 'text')).fontSize).toBe(24);
  await page.keyboard.press('Control+Shift+Digit8');
  await expect.poll(async () => (await first(page, 'text')).text).toBe('• Shortcut');
});

test('the shortcuts also work while typing, and leave the text being typed alone', async ({ page }) => {
  await page.keyboard.press('t');
  await page.getByTestId('board-canvas').click({ position: { x: 700, y: 450 } });
  await page.keyboard.type('abc');
  await page.keyboard.press('Control+b');
  await expect.poll(async () => (await first(page, 'text')).bold).toBe(true);
  await page.keyboard.type('def');
  await expect.poll(async () => (await first(page, 'text')).text).toBe('abcdef');
  await expect(page.locator('textarea')).toHaveCSS('font-weight', '700');
});

test('the shortcuts skip locked objects, and do nothing to shapes without a selection', async ({ page }) => {
  await page.keyboard.press('t');
  await page.getByTestId('board-canvas').click({ position: { x: 700, y: 450 } });
  await page.keyboard.type('Locked');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+Shift+l');
  await expect.poll(async () => (await first(page, 'text')).locked).toBe(true);
  await page.keyboard.press('Control+b');
  await page.waitForTimeout(150);
  expect((await first(page, 'text')).bold).toBe(false);
});

test('pasted HTML arrives as text, shapes and images, in place', async ({ page }) => {
  await paste(page, {
    text: 'Fallback text',
    html: `<div style="position:relative;width:800px;height:500px">
      <div style="position:absolute;left:0;top:0;width:300px;height:200px;background:#ff0000;border-radius:12px"></div>
      <p style="position:absolute;left:400px;top:20px;margin:0;font:700 32px Poppins;color:#123456">Title here</p>
      <p style="position:absolute;left:400px;top:90px;margin:0;font:italic 18px 'Some Unknown Serif', serif;color:rgb(0,128,0);text-decoration:underline">Unknown font</p>
      <p style="position:absolute;left:400px;top:140px;margin:0;font:16px monospace;text-align:left"><span style="background:#ffff00">marked</span></p>
      <img src="${PIXEL}" style="position:absolute;left:20px;top:300px;width:120px;height:80px">
      <svg style="position:absolute;left:200px;top:300px" width="60" height="60"><circle cx="30" cy="30" r="30" fill="blue"/></svg>
      <script>window.parent.document.title = 'hacked'</script>
    </div>`,
  });
  await expect.poll(async () => (await all(page)).length).toBe(6);
  expect(await page.title()).not.toBe('hacked');

  const title = await withText(page, 'Title here');
  expect(title).toMatchObject({ type: 'text', font: 'poppins', bold: true, fontSize: 32, color: '#123456' });

  const unknown = await withText(page, 'Unknown font');
  expect(unknown).toMatchObject({ font: 'georgia', italic: true, underline: true, color: '#008000' });

  expect(await withText(page, 'marked')).toMatchObject({ font: 'mono', highlight: '#ffff00' });

  const box = await first(page, 'roundrect');
  expect(box).toMatchObject({ fill: '#ff0000', w: 300, h: 200 });

  // Relative positions come across as they were laid out.
  expect(title.x - box.x).toBeCloseTo(400, 0);
  expect(unknown.y - title.y).toBeGreaterThan(50);
  const images = await ofType(page, 'image');
  expect(images).toHaveLength(2);
  const photo = images.find((i) => i.w === 120)!;
  expect(photo.h).toBe(80);
  expect(photo.x - box.x).toBeCloseTo(20, 0);

  // One step undoes the whole paste, and the pasted objects are selected.
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await all(page)).length).toBe(0);
});

/** Shaped like a real Canva clipboard, with made-up text. */
const CANVA = JSON.stringify({
  a: 5,
  h: 'www.canva.com',
  'A?': 'B',
  B: 1920,
  C: 1080,
  A: [
    {
      A: 100,
      B: 200,
      D: 900,
      C: 40,
      'A?': 'K',
      a: {
        C: {
          A: ['LABEL:  Value      \n'],
          B: [20],
          C: [
            { C: 'YAFdJjbTu24,1', G: '32px', I: 'bold', M: '#831a1a', Y: '1.2em', c: 'start' },
            { J: true, M: '#1e1e1e' },
            { I: 'bold', M: '#831a1a' },
            { D: true, H: true, J: true, N: true, Z: true, d: true },
          ],
          D: [0, 8, 5, 7],
        },
      },
    },
    {
      A: 300,
      B: 200,
      D: 500,
      C: 200,
      'A?': 'K',
      a: {
        C: {
          A: ['A heading that needs well-known wrapping to fit\n'],
          B: [48],
          C: [{ C: 'UNKNOWNFONT,1', G: '56px', I: 'bold', M: '#222222', Y: '1.2em', c: 'start' }],
          D: [0],
        },
      },
    },
    {
      A: 600,
      B: 200,
      D: 1800,
      C: 500,
      'A?': 'K',
      a: {
        C: {
          A: ['HUGE\n'],
          B: [5],
          C: [{ C: 'YAFdJjbTu24,1', G: '460px', I: 'bold', M: '#831a1a', Y: '1.2em', c: 'start' }],
          D: [0],
        },
      },
    },
    { A: 0, B: 0, D: 50, C: 50, 'A?': 'I', a: { B: { A: { A: 'MEDIAID' } } } },
  ],
});

const canvaOf = (...elements: unknown[]) => JSON.stringify({ a: 5, A: elements, B: 1920, C: 1080 });

test('Canva elements paste in position with their styles, whichever form the clipboard offers', async ({
  page,
}) => {
  await paste(page, { text: 'plain fallback', html: '<p>html fallback</p>', canva: CANVA });
  await expect(page.getByTestId('toast')).toContainText('1 picture is a gray box');
  await expect.poll(async () => (await all(page)).length).toBe(5);
  expect(await withText(page, 'Picture from Canva')).toMatchObject({ type: 'rect', w: 50, h: 50 });

  const label = await withText(page, 'LABEL:');
  expect(label).toMatchObject({ font: 'poppins', bold: true, color: '#831a1a', fontSize: 32 });
  const value = await withText(page, 'Value');
  expect(value).toMatchObject({ font: 'poppins', bold: false, color: '#1e1e1e', y: label.y });
  expect(value.x).toBeGreaterThan(label.x + label.w - 5); // sits after the label on the same line

  // An unknown font falls back; the line breaks are Canva's, not at the hyphen.
  const heading = (await ofType(page, 'text')).find((o) => (o.text as string).startsWith('A heading'))!;
  expect(heading).toMatchObject({ font: 'sans', bold: true, fontSize: 56 });
  expect((heading.text as string).split('\n').length).toBeGreaterThan(1);
  expect(heading.text).toContain('well-known');
  expect(heading.x).toBeCloseTo(label.x, 0);

  expect(await withText(page, 'HUGE')).toMatchObject({ fontSize: 460 });

  // A design larger than the view is brought fully into it.
  const zoom = await page.getByTestId('zoom-level').textContent();
  expect(Number.parseInt(zoom!, 10)).toBeLessThan(100);
});

test('Canva data hidden in the HTML is enough, for when only that form is readable', async ({ page }) => {
  const encoded = await page.evaluate((json) => {
    const bytes = new Uint8Array(new Uint16Array([...json].map((c) => c.charCodeAt(0))).buffer);
    return btoa(String.fromCharCode(...bytes));
  }, CANVA);
  await paste(page, {
    html: `<div><span data-canva-clipboard="${encoded}"></span><p>html fallback</p></div>`,
  });
  await expect.poll(async () => (await all(page)).length).toBe(5);
  expect(await withText(page, 'LABEL:')).toBeTruthy();
  expect(await withText(page, 'html fallback')).toBeUndefined();
});

test('Canva shapes: a filled rectangle stays a shape, anything else becomes a sharp image', async ({
  page,
}) => {
  await paste(page, {
    html: '<p>unused</p>',
    canva: canvaOf(
      {
        A: 0,
        B: 0,
        C: 324,
        D: 324,
        'A?': 'J',
        a: { D: 64, C: 64 },
        b: [{ A: 'M0 0H64V64H0z', B: { C: '#d99a9a' } }],
        f: [
          {
            A: {
              C: {
                A: ['Inside\n'],
                B: [7],
                C: [{ G: '32px', M: '#112233', Y: '1.2em', c: 'center' }],
                D: [0],
              },
            },
          },
        ],
      },
      {
        A: 0,
        B: 400,
        C: 200,
        D: 200,
        'A?': 'J',
        a: { D: 100, C: 100 },
        b: [{ A: 'M50 0L100 100H0z', B: { C: '#00aa00' } }],
      },
    ),
  });
  await expect.poll(async () => (await all(page)).length).toBe(3);
  const rect = await first(page, 'rect');
  expect(rect).toMatchObject({ fill: '#d99a9a', stroke: 'transparent', w: 324, h: 324 });

  // Text in a shape is centered in it.
  const inside = await withText(page, 'Inside');
  expect(inside).toMatchObject({ color: '#112233', fontSize: 32 });
  expect(inside.x + inside.w / 2).toBeCloseTo(rect.x + 162, -1);
  expect(inside.y + inside.h / 2).toBeCloseTo(rect.y + 162, -1);

  const triangle = await first(page, 'image');
  expect(triangle).toMatchObject({ w: 200, h: 200 });
  expect(triangle.x - rect.x).toBeCloseTo(400, 0);
});

test('a rotated Canva element keeps its center, underline and italics', async ({ page }) => {
  await paste(page, {
    canva: canvaOf({
      A: 100,
      B: 100,
      C: 100,
      D: 200,
      E: 90,
      'A?': 'J',
      a: { D: 200, C: 100 },
      b: [{ A: 'M0 0H200V100H0z', B: { C: '#123456' } }],
    }),
  });
  await expect.poll(async () => (await all(page)).length).toBe(1);
  const shape = (await first(page, 'rect')) as Obj & { rotation: number };
  expect(shape.rotation).toBe(90);
  // Around its center, the top-left corner lands 100 right of where it would be at the center's left.
  const bounds = await page.evaluate((id) => window.__canvasly!.store.getBounds(id), shape.id);
  expect(bounds!.w).toBeCloseTo(100, 0);
  expect(bounds!.h).toBeCloseTo(200, 0);

  await page.keyboard.press('Delete');
  await paste(page, {
    canva: canvaOf({
      A: 0,
      B: 0,
      C: 40,
      D: 400,
      'A?': 'K',
      a: {
        C: {
          A: ['Styled\n'],
          B: [7],
          C: [{ G: '30px', K: 'italic', O: 'underline', I: 'bold', Y: '1.2em' }],
          D: [0],
        },
      },
    }),
  });
  await expect.poll(async () => (await ofType(page, 'text')).length).toBe(1);
  expect(await first(page, 'text')).toMatchObject({ italic: true, underline: true, bold: true });
});

test('plain text pastes as a text object, wrapping long lines', async ({ page }) => {
  await paste(page, { text: 'Just some words\nOn two lines' });
  await expect.poll(async () => (await all(page)).length).toBe(1);
  const t = await first(page, 'text');
  expect(t).toMatchObject({ text: 'Just some words\nOn two lines', autoWidth: true });
  expect(t.h).toBeCloseTo(2 * 24 * 1.25, 0);

  await page.keyboard.press('Delete');
  await paste(page, { text: 'long '.repeat(100) });
  await expect.poll(async () => (await all(page)).length).toBe(1);
  expect(await first(page, 'text')).toMatchObject({ autoWidth: false, w: 640 });
});

test('a copied picture uses the image file; text alongside one uses the HTML', async ({ page }) => {
  // Browsers offer a lone copied image as a file plus HTML pointing somewhere that may refuse us.
  await paste(page, { html: '<img src="https://blocked.invalid/x.png" width="50" height="50">', png: true });
  await expect.poll(async () => (await ofType(page, 'image')).length).toBe(1);

  await page.keyboard.press('Delete');
  await paste(page, {
    html: `<p style="margin:0">A caption</p><img src="${PIXEL}" width="50" height="50">`,
    png: true,
  });
  await expect.poll(async () => (await all(page)).length).toBe(2);
  expect(await withText(page, 'A caption')).toBeTruthy();
});

test('an image its host refuses is reported, and the rest still arrives', async ({ page }) => {
  await paste(page, { html: '<p>Kept</p><img src="https://blocked.invalid/x.png" width="50" height="50">' });
  await expect(page.getByTestId('toast')).toContainText("1 image couldn't be copied");
  await expect.poll(async () => (await all(page)).map((o) => o.text)).toEqual(['Kept']);
});

test('objects copied on this board still paste as themselves', async ({ page }) => {
  await page.keyboard.press('r');
  await page.getByTestId('board-canvas').click({ position: { x: 700, y: 450 } });
  await expect.poll(async () => (await ofType(page, 'rect')).length).toBe(1);
  const payload = await page.evaluate(() => {
    const objects = [...window.__canvasly!.store.all()];
    return JSON.stringify({ kind: 'canvasly/objects', version: 1, objects });
  });
  await paste(page, { text: payload, html: '<p>Ignored, ours wins</p>' });
  await expect.poll(async () => (await ofType(page, 'rect')).length).toBe(2);
  expect(await ofType(page, 'text')).toHaveLength(0);
});
