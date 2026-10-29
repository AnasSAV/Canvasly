import { describe, expect, it } from 'vitest';
import { can } from './permissions';
import { buildTemplate, TEMPLATES } from './model/templates';
import { comparePaint } from './model/zorder';
import { CommentEvent, CommentOp } from './schemas/comments';
import { BoardExport } from './schemas/export';
import { BoardObject } from './schemas/objects';
import { InviteBody, maxRole } from './schemas/share';

describe('templates', () => {
  it.each(TEMPLATES.map((t) => t.id))('%s produces valid, self-consistent objects', (id) => {
    const objs = buildTemplate(id);
    if (id === 'blank') {
      expect(objs).toEqual([]);
      return;
    }
    expect(objs.length).toBeGreaterThan(3);
    for (const o of objs) expect(BoardObject.safeParse(o).success).toBe(true);
    const ids = new Set(objs.map((o) => o.id));
    expect(ids.size).toBe(objs.length);
    for (const o of objs) {
      if (o.type !== 'connector') continue;
      for (const end of [o.start, o.end])
        if (end.kind === 'attached') expect(ids.has(end.objectId)).toBe(true);
    }
    const zs = objs.map((o) => o.z);
    expect([...zs].sort()).toEqual(zs); // creation order == paint order
  });
});

describe('paint order', () => {
  it('draws frames beneath everything regardless of z', () => {
    const items = [
      { id: 'a', z: 'a0', type: 'sticky' },
      { id: 'f', z: 'a5', type: 'frame' },
      { id: 'b', z: 'a1', type: 'rect' },
    ];
    expect(items.sort(comparePaint).map((i) => i.id)).toEqual(['f', 'a', 'b']);
  });
});

describe('sharing rules', () => {
  it('never downgrades an existing member when joining by link', () => {
    expect(maxRole('editor', 'viewer')).toBe('editor');
    expect(maxRole('viewer', 'editor')).toBe('editor');
    expect(maxRole('owner', 'editor')).toBe('owner');
    expect(maxRole(null, 'viewer')).toBe('viewer');
  });

  it('normalizes invite emails and rejects bad roles', () => {
    expect(InviteBody.parse({ email: '  Bob@Example.COM ', role: 'viewer' }).email).toBe('bob@example.com');
    expect(InviteBody.safeParse({ email: 'bob@example.com', role: 'owner' }).success).toBe(false);
    expect(InviteBody.safeParse({ email: 'not-an-email', role: 'editor' }).success).toBe(false);
  });

  it('lets viewers comment but not edit', () => {
    expect(can('viewer', 'comment')).toBe(true);
    expect(can('viewer', 'edit')).toBe(false);
  });
});

describe('comment protocol', () => {
  it('accepts valid ops and rejects empty or oversized text', () => {
    expect(CommentOp.safeParse({ op: 'create', x: 1, y: 2, text: 'Looks good' }).success).toBe(true);
    expect(CommentOp.safeParse({ op: 'reply', threadId: 't', text: '   ' }).success).toBe(false);
    expect(CommentOp.safeParse({ op: 'reply', threadId: 't', text: 'x'.repeat(2001) }).success).toBe(false);
    expect(CommentOp.safeParse({ op: 'create', x: Infinity, y: 0, text: 'x' }).success).toBe(false);
  });

  it('parses server events', () => {
    expect(CommentEvent.safeParse({ type: 'remove', threadId: 't' }).success).toBe(true);
  });
});

describe('board export', () => {
  it('round-trips a template and rejects non-image assets', () => {
    const file = {
      kind: 'canvasly/board',
      version: 1,
      title: 'Kanban',
      exportedAt: 1,
      objects: buildTemplate('kanban'),
      assets: { a1: 'data:image/webp;base64,AAAA' },
    };
    expect(BoardExport.parse(JSON.parse(JSON.stringify(file))).objects).toHaveLength(file.objects.length);
    expect(BoardExport.safeParse({ ...file, assets: { a1: 'javascript:alert(1)' } }).success).toBe(false);
  });
});
