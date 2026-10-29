import { createAuthClient } from 'better-auth/react';

/** Talks to Better Auth at /api/auth on the same origin (proxied to wrangler in dev). */
export const authClient = createAuthClient();

/** Drop locally cached boards so the next person on this browser can't read them. */
export async function signOut() {
  await authClient.signOut();
  const dbs = (await indexedDB.databases?.()) ?? [];
  await Promise.all(
    dbs
      .filter((d) => d.name?.startsWith('canvasly-board-'))
      .map(
        (d) =>
          new Promise<void>((resolve) => {
            const req = indexedDB.deleteDatabase(d.name!);
            req.onsuccess = req.onerror = req.onblocked = () => resolve();
          }),
      ),
  );
}
