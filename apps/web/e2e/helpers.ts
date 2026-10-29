import { expect, type APIRequestContext, type Page } from '@playwright/test';

let counter = 0;

export interface TestUser {
  email: string;
  password: string;
  name: string;
}

export function newUser(): TestUser {
  const id = `${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  return { email: `e2e-${id}@test.dev`, password: 'password1234', name: `Tester ${id.slice(-4)}` };
}

/** Sign up through the API; the session cookie lands in the page's browser context. */
export async function signUp(request: APIRequestContext, user = newUser()): Promise<TestUser> {
  const res = await request.post('/api/auth/sign-up/email', { data: user });
  expect(res.ok(), await res.text()).toBe(true);
  return user;
}

export async function signIn(request: APIRequestContext, user: TestUser) {
  const res = await request.post('/api/auth/sign-in/email', {
    data: { email: user.email, password: user.password },
  });
  expect(res.ok(), await res.text()).toBe(true);
}

export async function createBoard(request: APIRequestContext, title = 'E2E board'): Promise<string> {
  const res = await request.post('/api/boards', { data: { title } });
  expect(res.ok(), await res.text()).toBe(true);
  return ((await res.json()) as { id: string }).id;
}

/** Open a board and wait until it is connected and synced with its Durable Object. */
export async function openBoard(page: Page, id: string) {
  await page.goto(`/b/${id}`);
  await expect(page.getByTestId('board-canvas')).toBeVisible();
  await expect(page.getByTestId('connection-status')).toHaveAttribute('data-status', 'online');
}
