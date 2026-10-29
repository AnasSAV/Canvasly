import { describe, expect, it } from 'vitest';
import { can, type Action, type Role } from './permissions';

const ALL: Action[] = ['view', 'edit', 'comment', 'rename', 'share', 'delete'];

describe('permissions', () => {
  const allowed = (role: Role) => ALL.filter((a) => can(role, a));

  it('grants owners everything', () => {
    expect(allowed('owner')).toEqual(ALL);
  });

  it('lets editors change content and rename but not share or delete', () => {
    expect(allowed('editor')).toEqual(['view', 'edit', 'comment', 'rename']);
  });

  it('lets viewers view and comment only', () => {
    expect(allowed('viewer')).toEqual(['view', 'comment']);
  });

  it('denies everything without a role', () => {
    expect(ALL.some((a) => can(null, a))).toBe(false);
    expect(ALL.some((a) => can(undefined, a))).toBe(false);
  });
});
