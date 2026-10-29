import {
  BoardList,
  BoardSummary,
  InviteResult,
  PublicBoard,
  ShareSettings,
  type CreateBoardBody,
  type GrantableRole,
  type LinkRole,
  type RenameBoardBody,
} from '@canvasly/shared';
import { z } from 'zod';

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

  // Sharing (owner only)
  getShare: (id: string) => request(`/boards/${id}/share`, ShareSettings),
  invite: (id: string, email: string, role: GrantableRole) =>
    request(`/boards/${id}/invites`, InviteResult, { method: 'POST', ...json({ email, role }) }),
  cancelInvite: (id: string, email: string) =>
    request(`/boards/${id}/invites/${encodeURIComponent(email)}`, ShareSettings, { method: 'DELETE' }),
  setMemberRole: (id: string, userId: string, role: GrantableRole) =>
    request(`/boards/${id}/members/${userId}`, ShareSettings, { method: 'PATCH', ...json({ role }) }),
  removeMember: (id: string, userId: string) =>
    request(`/boards/${id}/members/${userId}`, ShareSettings, { method: 'DELETE' }),
  setLink: (id: string, role: LinkRole) =>
    request(`/boards/${id}/link`, ShareSettings, { method: 'PUT', ...json({ role }) }),
  rotateLink: (id: string) => request(`/boards/${id}/link/rotate`, ShareSettings, { method: 'POST' }),

  // Share links
  joinByLink: (token: string) =>
    request(`/share/${token}/join`, z.object({ boardId: z.string() }), { method: 'POST' }),
  publicBoard: (token: string) => request(`/public/${token}`, PublicBoard),
};

export const thumbnailUrl = (b: Pick<BoardSummary, 'id' | 'thumbnailVersion'>) =>
  b.thumbnailVersion ? `/api/boards/${b.id}/thumbnail?v=${b.thumbnailVersion}` : null;

const wsOrigin = () => `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`;
export const boardSocketUrl = (id: string) => `${wsOrigin()}/api/boards/${id}/ws`;
export const publicSocketUrl = (token: string) => `${wsOrigin()}/api/public/${token}/ws`;
export const shareLinkUrl = (token: string) => `${location.origin}/s/${token}`;
