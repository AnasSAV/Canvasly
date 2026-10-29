import { z } from 'zod';
import { BoardObject } from './objects';

/** Portable board file: objects plus embedded images (data URLs), so it can be imported anywhere. */
export const BoardExport = z.object({
  kind: z.literal('canvasly/board'),
  version: z.literal(1),
  title: z.string().max(120),
  exportedAt: z.number(),
  objects: z.array(BoardObject).max(50_000),
  assets: z.record(z.string(), z.string().startsWith('data:image/')),
});
export type BoardExport = z.infer<typeof BoardExport>;
