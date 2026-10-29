# Canvasly

A Miro-style collaborative whiteboard that runs entirely on Cloudflare's **Workers Free** plan — no
credit card, no servers that sleep, $0 hosting.

> **Status:** Phase 2 of 4 — infinite canvas, accounts (email/password + optional Google), dashboard
> with thumbnails, and boards persisted in a per-board Durable Object. Live multi-user presence and
> cursors arrive in Phase 3; sharing, comments, frames and export in Phase 4.

## Architecture

```
                          ┌──────────────────────── Cloudflare · Workers Free ─────────────────────────┐
 Browser (React SPA)      │                                                                             │
 ┌──────────────────┐ GET │  ┌──────────────── Worker "canvasly" (Hono) ─────────────────┐              │
 │ react-konva      │────►│  │ static assets (SPA)   ← free & unlimited, Worker not run  │              │
 │ Zustand (UI)     │     │  │ /api/auth/*           → Better Auth ─────────┐             │              │
 │ Y.Doc            │HTTP │  │ /api/boards/*         → session + role ──────┼──►  D1      │              │
 │  ├ y-indexeddb   │────►│  │   thumbnails (D1), assets (→ DO)             │  users,     │              │
 │  └ SyncProvider  │ WS  │  │ /api/boards/:id/ws    → auth, then forward ──┘  boards,    │              │
 └────────┬─────────┘────►│  └──────────────┬─────────────────────────────────  members   ┘              │
          │               │                 │ stub.fetch / RPC (trusted role headers)                     │
          │               │  ┌──────────────▼──────── BoardRoom Durable Object (1 per board) ───────────┐ │
          └───────────────┼─►│ WebSocket Hibernation · y-protocols sync + awareness relay               │ │
                          │  │ role enforced per socket (viewer updates dropped server-side)           │ │
                          │  │ SQLite: Yjs snapshot chunks · update log · image assets                 │ │
                          │  └──────────────────────────────────────────────────────────────────────────┘ │
                          └─────────────────────────────────────────────────────────────────────────────┘
```

- **One Worker** serves the SPA (Workers Static Assets with SPA fallback) and `/api/*`
  (`run_worker_first`), so a single `wrangler deploy` ships everything.
- **D1** holds users/sessions (Better Auth), board metadata, memberships and thumbnails.
- **One SQLite-backed Durable Object per board** (`BoardRoom`) holds the board's Yjs document and its
  images. The Worker authenticates the WebSocket upgrade, looks up the caller's role in D1 and forwards it
  in headers the client can't forge; the DO stores it on the socket (survives hibernation) and drops
  document updates from viewers.

### Key decisions

| Choice                           | Why                                                                                                                                                                                                                          |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hand-rolled y-protocols sync     | Server-side role checks need per-message control; the client batches doc + presence updates into ≤ 1 frame / 50 ms because incoming WS messages count against the DO request quota; and we control hibernation + compaction. |
| No server-side `Awareness`       | y-protocols' `Awareness` runs a `setInterval`, which would keep the DO from hibernating. The DO parses/relays the wire format instead.                                                                                       |
| Debounced persistence            | Updates are merged and written to SQLite at most every 2 s (≤ 10 s after the first change, immediately when the last client leaves). The log is compacted into a chunked snapshot after 200 rows / 1 MB.                     |
| Better Auth + PBKDF2 (WebCrypto) | Better Auth's default scrypt is pure JS and exceeds the Free plan's 10 ms CPU limit; native PBKDF2-SHA256 (100k iterations, the Workers max) doesn't. The iteration count is stored in each hash so it can be raised later.  |
| react-konva                      | Hit-testing primitives, Transformer handles and export for free; perf via R-tree culling, a non-listening content layer and rAF-batched drags (60 fps panning with 1,000+ objects).                                          |
| Hand-rolled 3-route router       | `/`, `/b/:id` and the signed-out page don't justify a router dependency.                                                                                                                                                     |

### Data model

**Yjs document** (per board): `objects: Y.Map<id, Y.Map>` — every object has `id, type, z` (fractional
index), `locked, groupId`; box objects add `x, y, w, h, rotation`; text lives in `Y.Text`. Connectors
reference shapes by id (`{ kind: 'attached', objectId, anchor }`) so they follow them. Schemas are Zod
discriminated unions in [`packages/shared/src/schemas/objects.ts`](packages/shared/src/schemas/objects.ts).

**D1** ([`apps/worker/migrations`](apps/worker/migrations)): Better Auth's `user / session / account /
verification`, plus `boards`, `board_members (board_id, user_id, role)` and `board_thumbnails`.

**Durable Object SQLite**: `doc_snapshot (seq, data)` chunks (< 2 MB rows), `doc_updates` log,
`assets (id, mime, bytes, data)`.

### Images and the size trade-off

R2 needs a payment method on file, so images are stored as BLOBs in the board's Durable Object. To keep
that viable the browser resizes every image to **max 1600 px** and re-encodes it as **WebP (≤ 1 MB,
usually 100–300 KB)** before upload; the server rejects anything larger or not webp/png/jpeg/gif (no
SVG, so no script injection), and serves assets with `nosniff` and long-lived private caching.
The cost: images aren't on a CDN and count toward the 5 GB account-wide DO storage (≈ 1 GB per object
on the Free plan) — fine for a few hundred images per board, not for a media library. Deleting an image
object doesn't yet garbage-collect its blob.

## Local development

Requires Node 22+ and pnpm (`npm i -g pnpm`).

```sh
pnpm install
pnpm dev          # wrangler dev (:8787, local D1 + Durable Objects) + Vite (:5173, proxies /api)
```

Open http://localhost:5173 and create an account. `pnpm dev` creates `apps/worker/.dev.vars` from
[`.dev.vars.example`](apps/worker/.dev.vars.example) on first run and applies D1 migrations to the local
database (state lives in `apps/worker/.wrangler/`, delete it to reset).

| Command                                     | What it does                                               |
| ------------------------------------------- | ---------------------------------------------------------- |
| `pnpm dev`                                  | Worker + web app, one command                              |
| `pnpm test`                                 | Vitest: geometry, CRDT model, permissions, worker helpers  |
| `pnpm --filter @canvasly/web test:e2e`      | Playwright; starts its own servers on :8788/:5174          |
| `pnpm lint` / `pnpm typecheck`              | ESLint (typescript-eslint strict) / `tsc` in every package |
| `pnpm format`                               | Prettier                                                   |
| `pnpm db:migrate:local`                     | Apply D1 migrations to the local database                  |
| `pnpm --filter @canvasly/worker cf-typegen` | Regenerate `Env` types after editing `wrangler.jsonc`      |

**Google sign-in (optional):** create an OAuth client (Web application) in Google Cloud Console → APIs &
Services → Credentials, add `http://localhost:5173/api/auth/callback/google` (and your production URL
equivalent) as an authorized redirect URI, and put the id/secret in `.dev.vars`. The button only appears
when both are set.

## One-time Cloudflare setup

Everything below is free and needs no payment method.

1. Create a Cloudflare account and note your workers.dev subdomain (Workers & Pages → Overview).
   The app will live at `https://canvasly.<subdomain>.workers.dev`.
2. Log in: `pnpm --filter @canvasly/worker exec wrangler login`
3. Create the D1 database and copy the printed `database_id` into
   [`apps/worker/wrangler.jsonc`](apps/worker/wrangler.jsonc):
   ```sh
   pnpm --filter @canvasly/worker exec wrangler d1 create canvasly
   ```
4. Apply migrations to it: `pnpm db:migrate:remote`
5. Set production secrets (each command prompts for the value):
   ```sh
   cd apps/worker
   pnpm exec wrangler secret put BETTER_AUTH_SECRET     # e.g. output of: openssl rand -base64 32
   pnpm exec wrangler secret put BETTER_AUTH_URL        # https://canvasly.<subdomain>.workers.dev
   pnpm exec wrangler secret put GOOGLE_CLIENT_ID       # optional
   pnpm exec wrangler secret put GOOGLE_CLIENT_SECRET   # optional
   ```

## Deploy

**Manually:** `pnpm cf:deploy` (builds the SPA, then `wrangler deploy` uploads the Worker, static assets
and Durable Object class). Run `pnpm db:migrate:remote` first whenever a new migration is added.

**From GitHub Actions:** [`ci.yml`](.github/workflows/ci.yml) runs format/lint/typecheck/unit/e2e on
every push and PR; on `main` it then applies D1 migrations and deploys. The deploy job is skipped until
these repository secrets exist (Settings → Secrets and variables → Actions):

| Secret                  | Value                                                                                                                |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `CLOUDFLARE_API_TOKEN`  | My Profile → API Tokens → Create Token → "Edit Cloudflare Workers" template, plus **Account → D1 → Edit** permission |
| `CLOUDFLARE_ACCOUNT_ID` | Shown on the Workers & Pages overview page                                                                           |

Runtime secrets (`BETTER_AUTH_*`, `GOOGLE_*`) stay in Cloudflare (step 5 above), not in GitHub.

## Free-tier limits we rely on

All daily limits reset at 00:00 UTC. On the Free plan nothing is ever billed — exceeding a limit makes
the affected operations fail until the reset.

| Resource               | Free limit                                     | How Canvasly uses it                                                                                    | If exceeded                                                                            |
| ---------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Worker requests        | 100,000 / day                                  | Only `/api/*` runs the Worker (API calls, WS upgrades, image fetches). The SPA's static files are free. | `/api/*` returns 429 / error 1027 → can't sign in or open boards. The SPA still loads. |
| Worker CPU             | 10 ms / request                                | PBKDF2 (native) for passwords; no heavy work in the Worker                                              | That request fails                                                                     |
| Static asset requests  | Unlimited                                      | HTML/JS/CSS                                                                                             | —                                                                                      |
| DO requests            | 100,000 / day; incoming WS messages count 1/20 | ≤ 20 batched frames/s per _active_ editor ≈ 3,600 requests/hour → ~25+ active user-hours/day            | Board connections/messages fail; edits stay in the browser (IndexedDB) and sync later  |
| DO duration            | 13,000 GB-s / day                              | Hibernation: idle rooms are evicted while sockets stay open; no server timers                           | Durable Object calls fail                                                              |
| DO SQLite rows written | 100,000 / day                                  | ~1 row per 2 s of continuous editing per board (+ compaction); one row per image                        | Saves fail; clients keep edits locally and resend on reconnect                         |
| DO SQLite rows read    | 5,000,000 / day                                | Loading a board reads its snapshot chunks + log (compacted at 200 rows)                                 | Boards can't load                                                                      |
| DO storage             | 5 GB total (≈ 1 GB per object); 2 MB per row   | Yjs snapshots chunked < 1 MB; images ≤ 1 MB                                                             | Writes fail                                                                            |
| D1 rows read           | 5,000,000 / day                                | Session (cookie-cached 5 min), board list, access checks                                                | All D1 queries fail → sign-in and dashboard break                                      |
| D1 rows written        | 100,000 / day                                  | Sign-ups/sessions, board create/rename, thumbnail upserts (≤ 1 per 30 s while editing)                  | Writes fail                                                                            |
| D1 storage             | 500 MB per DB, 5 GB total; 2 MB per row        | Metadata + ~10–40 KB thumbnails                                                                         | Inserts fail until data is deleted                                                     |

## Repository layout

```
apps/web          React + Vite + Tailwind SPA (react-konva canvas, Zustand UI state, Better Auth client)
apps/worker       Cloudflare Worker (Hono API, Better Auth, BoardRoom Durable Object), D1 migrations
packages/shared   Zod schemas, permissions, wire protocol, geometry, Yjs document helpers
```

## Keyboard shortcuts

| Key                             | Action                                      |
| ------------------------------- | ------------------------------------------- |
| V / H                           | Select / Hand                               |
| N / T                           | Sticky note / Text                          |
| R / O                           | Rectangle / Ellipse                         |
| L / A                           | Line / Arrow (connector)                    |
| P / E                           | Pen / Eraser (pen strokes)                  |
| I                               | Upload image                                |
| Space + drag, middle/right drag | Pan                                         |
| Ctrl/⌘ + wheel, pinch           | Zoom at cursor                              |
| Shift+1 / Shift+0               | Zoom to fit / 100%                          |
| Ctrl/⌘ Z, Ctrl/⌘ Shift Z        | Undo / Redo                                 |
| Ctrl/⌘ D / A / C / X / V        | Duplicate / Select all / Copy / Cut / Paste |
| Ctrl/⌘ G, Ctrl/⌘ Shift G        | Group / Ungroup                             |
| Ctrl/⌘ Shift L                  | Lock / unlock                               |
| ] / [                           | Bring to front / Send to back               |
| Arrows (Shift = 10px)           | Nudge                                       |
| Enter / double-click            | Edit text                                   |
| Del / Backspace, Esc            | Delete, Deselect                            |
| Alt while dragging              | Disable alignment snapping                  |
