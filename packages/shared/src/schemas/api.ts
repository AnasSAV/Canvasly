import { z } from 'zod';
import { Role } from '../permissions';

export const BoardTitle = z.string().trim().min(1).max(120);

export const CreateBoardBody = z.object({ title: BoardTitle.default('Untitled board') });
export type CreateBoardBody = z.infer<typeof CreateBoardBody>;

export const RenameBoardBody = z.object({ title: BoardTitle });
export type RenameBoardBody = z.infer<typeof RenameBoardBody>;

export const BoardSummary = z.object({
  id: z.string(),
  title: z.string(),
  role: Role,
  ownerName: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
  /** Cache-busting version of the thumbnail, or null if none uploaded yet. */
  thumbnailVersion: z.number().nullable(),
});
export type BoardSummary = z.infer<typeof BoardSummary>;

export const BoardList = z.object({ boards: z.array(BoardSummary) });
export type BoardList = z.infer<typeof BoardList>;

export const AssetCreated = z.object({ id: z.string() });

export const ApiError = z.object({ error: z.string() });

/** Images are compressed client-side; the server rejects anything larger (DO SQLite rows max out at 2 MB). */
export const MAX_ASSET_BYTES = 1024 * 1024;
export const MAX_THUMBNAIL_BYTES = 64 * 1024;
export const ASSET_MIME_TYPES = ['image/webp', 'image/png', 'image/jpeg', 'image/gif'] as const;
