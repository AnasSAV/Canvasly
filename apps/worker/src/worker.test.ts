import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { decodeAwarenessUpdate, encodeAwarenessUpdate } from './board-room/awareness';
import { chunkBytes, concatBytes, toArrayBuffer } from './board-room/storage';
import { hashPassword, verifyPassword } from './password';

describe('password hashing (PBKDF2)', () => {
  it('verifies the right password and rejects others', async () => {
    const hash = await hashPassword('correct horse battery');
    expect(hash).toMatch(/^pbkdf2-sha256\$100000\$/);
    expect(await verifyPassword({ hash, password: 'correct horse battery' })).toBe(true);
    expect(await verifyPassword({ hash, password: 'wrong' })).toBe(false);
  });

  it('salts every hash and rejects malformed hashes', async () => {
    expect(await hashPassword('same')).not.toBe(await hashPassword('same'));
    expect(await verifyPassword({ hash: 'scrypt$abc', password: 'x' })).toBe(false);
  });
});

describe('awareness wire format', () => {
  it('round-trips entries, including removals', () => {
    const entries = [
      { clientId: 42, clock: 3, state: JSON.stringify({ user: { name: 'A' }, cursor: { x: 1, y: 2 } }) },
      { clientId: 7, clock: 10, state: 'null' },
    ];
    expect(decodeAwarenessUpdate(encodeAwarenessUpdate(entries))).toEqual(entries);
  });
});

describe('snapshot chunking', () => {
  it('splits and rejoins byte arrays losslessly', () => {
    const bytes = Uint8Array.from({ length: 2500 }, (_, i) => i % 251);
    const parts = chunkBytes(bytes, 1000);
    expect(parts.map((p) => p.length)).toEqual([1000, 1000, 500]);
    expect(concatBytes(parts)).toEqual(bytes);
  });

  it('round-trips a Yjs snapshot through chunks', () => {
    const doc = new Y.Doc();
    doc.getMap('objects').set('a', 'x'.repeat(5000));
    const restored = new Y.Doc();
    Y.applyUpdate(restored, concatBytes(chunkBytes(Y.encodeStateAsUpdate(doc), 777)));
    expect(restored.getMap('objects').get('a')).toBe('x'.repeat(5000));
  });

  it('copies views into standalone buffers for SQL bindings', () => {
    const big = new Uint8Array([1, 2, 3, 4, 5]);
    const view = big.subarray(1, 3);
    expect(new Uint8Array(toArrayBuffer(view))).toEqual(new Uint8Array([2, 3]));
    expect(toArrayBuffer(big)).toBe(big.buffer);
  });
});
