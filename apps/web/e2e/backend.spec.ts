import { expect, test } from '@playwright/test';
import { createBoard, openBoard, signIn, signUp } from './helpers';

test('dashboard: create, open, rename and delete a board', async ({ page }) => {
  await signUp(page.request);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Your boards' })).toBeVisible();
  await page.getByTestId('new-board').first().click();
  await page.getByTestId('template-blank').click();
  await expect(page).toHaveURL(/\/b\/[\w-]+$/);
  await expect(page.getByTestId('connection-status')).toHaveAttribute('data-status', 'online');

  // Rename from inside the board
  await page.getByTestId('board-title').click();
  await page.getByTestId('board-title-input').fill('Roadmap');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('board-title')).toHaveText('Roadmap');

  // Draw something so a thumbnail gets uploaded on the way out
  await page.keyboard.press('n');
  await page.getByTestId('board-canvas').click({ position: { x: 600, y: 400 } });
  await page.keyboard.type('Thumbnail me');
  await page.keyboard.press('Escape');
  await page.getByTestId('main-menu').click();
  await page.getByRole('menuitem', { name: 'Back to boards' }).click();

  await expect(page).toHaveURL(/\/$/);
  const card = page.getByTestId('board-card');
  await expect(card).toHaveCount(1);
  await expect(page.getByTestId('board-item').getByText('Roadmap')).toBeVisible();
  await expect(card.locator('img')).toBeVisible();

  page.once('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: 'Board options' }).click();
  await page.getByRole('button', { name: 'Delete' }).click();
  await expect(card).toHaveCount(0);
  // The card goes as soon as you confirm; the server catches up a moment later.
  await expect
    .poll(async () => {
      const res = await page.request.get('/api/boards');
      return ((await res.json()) as { boards: unknown[] }).boards.length;
    })
    .toBe(0);
});

test('board content persists in the Durable Object across browsers', async ({ page, browser }) => {
  const user = await signUp(page.request);
  const boardId = await createBoard(page.request);
  await openBoard(page, boardId);
  await page.keyboard.press('r');
  await page.getByTestId('board-canvas').click({ position: { x: 500, y: 400 } });
  await page.mouse.dblclick(500, 400);
  await page.keyboard.type('Persist me');
  await page.keyboard.press('Escape');
  // Let the 50 ms client batch go out; closing the page then disconnects the socket, which makes
  // the Durable Object flush to SQLite immediately.
  await page.waitForTimeout(300);
  await page.close();

  // Fresh context = empty IndexedDB, so the content can only come from the server.
  const ctx = await browser.newContext();
  const page2 = await ctx.newPage();
  await signIn(page2.request, user);
  await openBoard(page2, boardId);
  await expect
    .poll(() => page2.evaluate(() => [...window.__canvasly!.store.all()].map((o) => o.type)))
    .toEqual(['rect']);
  const text = await page2.evaluate(() => {
    const [o] = [...window.__canvasly!.store.all()];
    return o && 'text' in o ? o.text : null;
  });
  expect(text).toBe('Persist me');
  await ctx.close();
});

test('another user cannot open a board they have no access to', async ({ page, browser }) => {
  await signUp(page.request);
  const boardId = await createBoard(page.request);
  const ctx = await browser.newContext();
  const other = await ctx.newPage();
  await signUp(other.request);
  await other.goto(`/b/${boardId}`);
  await expect(other.getByText(/doesn.t exist or you don.t have access/)).toBeVisible();
  const ws = await other.request.get(`/api/boards/${boardId}/ws`, { headers: { upgrade: 'websocket' } });
  expect(ws.status()).toBe(404);
  await ctx.close();
});

test('signs up and out through the UI', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign up' }).click();
  await page.getByPlaceholder('Your name').fill('UI Person');
  await page.getByPlaceholder('Email').fill(`ui-${Date.now()}@test.dev`);
  await page.getByPlaceholder(/Password/).fill('password1234');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: 'Your boards' })).toBeVisible();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
});

test('forgot password and reset screens', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Forgot password?' }).click();
  await page.getByPlaceholder('Email').fill('someone@test.dev');
  await page.getByRole('button', { name: 'Send reset link' }).click();
  // Same answer whether or not the account exists (no account enumeration).
  await expect(page.getByText('If an account exists for someone@test.dev')).toBeVisible();

  await page.goto('/reset-password?error=INVALID_TOKEN');
  await expect(page.getByText('This reset link is invalid or has expired.')).toBeVisible();
  await page.goto('/reset-password?token=not-a-real-token');
  await page.getByPlaceholder('New password').fill('new-password-123');
  await page.getByRole('button', { name: 'Set password' }).click();
  await expect(page.locator('p.text-red-600')).toBeVisible();
});
