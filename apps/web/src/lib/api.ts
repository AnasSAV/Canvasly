import { BoardList, BoardSummary, type CreateBoardBody, type RenameBoardBody } from '@canvasly/shared';
import type { z } from 'zod';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, schema: z.ZodType<T> | null, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, { credentials: 'same-origin', ...init });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(res.status, body?.error ?? res.statusText);
  }
  if (!schema) return undefined as T;
  return schema.parse(await res.json());
}

const json = (body: unknown): RequestInit => ({
  body: JSON.stringify(body),
  headers: { 'content-type': 'application/json' },
});

export const api = {
  listBoards: () => request('/boards', BoardList).then((r) => r.boards),
  getBoard: (id: string) => request(`/boards/${id}`, BoardSummary),
  createBoard: (body: Partial<CreateBoardBody> = {}) =>
    request('/boards', BoardSummary, { method: 'POST', ...json(body) }),
  renameBoard: (id: string, body: RenameBoardBody) =>
    request(`/boards/${id}`, BoardSummary, { method: 'PATCH', ...json(body) }),
  deleteBoard: (id: string) => request(`/boards/${id}`, null, { method: 'DELETE' }),
  config: () => fetch('/api/config').then((r) => r.json() as Promise<{ google: boolean }>),
};

export const thumbnailUrl = (b: Pick<BoardSummary, 'id' | 'thumbnailVersion'>) =>
  b.thumbnailVersion ? `/api/boards/${b.id}/thumbnail?v=${b.thumbnailVersion}` : null;

export const boardSocketUrl = (id: string) =>
  `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/boards/${id}/ws`;
