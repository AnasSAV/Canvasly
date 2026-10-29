# Canvasly

A Miro-style collaborative whiteboard that runs entirely on Cloudflare's **Workers Free** plan — no
credit card, no servers that sleep, $0 hosting.

**Features:** infinite canvas (stickies, text, shapes, connectors, pen, images, frames), accounts
(email/password + optional Google), dashboard with thumbnails and templates, real-time collaboration
(live cursors, presence, follow mode, per-user undo, offline edits), sharing with roles and public
links, comments, presentation mode, PNG/PDF/JSON export and JSON import, dark mode, and touch support.

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
| Lazy document load               | After hibernation, most wake-ups are presence renewals that only need relaying, so the DO loads the Y.Doc from SQLite only when a sync message or RPC needs it.                                                              |
| Debounced persistence            | Updates are merged and written to SQLite at most every 2 s (≤ 10 s after the first change, immediately when the last client leaves). The log is compacted into a chunked snapshot after 200 rows / 1 MB.                     |
| Better Auth + PBKDF2 (WebCrypto) | Better Auth's default scrypt is pure JS and exceeds the Free plan's 10 ms CPU limit; native PBKDF2-SHA256 (100k iterations, the Workers max) doesn't. The iteration count is stored in each hash so it can be raised later.  |
| react-konva                      | Hit-testing primitives, Transformer handles and export for free; perf via R-tree culling, a non-listening content layer and rAF-batched drags (60 fps panning with 1,000+ objects).                                          |
| Hand-rolled 3-route router       | `/`, `/b/:id` and the signed-out page don't justify a router dependency.                                                                                                                                                     |

### Real-time collaboration

- **Sync:** both sides exchange Yjs state vectors on every (re)connect, then stream merged updates.
  Conflicts are impossible by construction (CRDT); text is `Y.Text`, so concurrent typing merges.
- **Presence** (Yjs awareness): each client publishes `{ user, cursor, selection, viewport }`, validated
  with Zod on receipt. Cursors are drawn in screen space with name tags; other people's selections get a
  dashed outline in their color; avatars in the header dedupe multiple tabs of the same person.
- **Follow mode:** click an avatar to mirror that person's view (their visible world rect is fitted to your
  screen). Panning/zooming yourself, Esc or "Stop" ends it.
- **Undo is per user:** `Y.UndoManager` only tracks this client's transactions, so undo never reverts
  someone else's edit. Discrete actions (create, delete, restyle, reorder, group, lock) are always their
  own undo step; drags/resizes/strokes are one step each.
- **Offline & reconnect:** edits are persisted to IndexedDB (`y-indexeddb`) and synced on reconnect
  (exponential backoff with jitter, immediate retry on the browser's `online` event). A 25 s app-level
  heartbeat — answered by the DO's `setWebSocketAutoResponse` without waking it — detects dead connections.
  A board opened before can be reopened offline (metadata cached locally). The app shell itself isn't
  cached for offline loads (no service worker).

### Sharing & permissions

| Role                     | View | Comment | Edit | Rename | Share / delete |
| ------------------------ | :--: | :-----: | :--: | :----: | :------------: |
| Owner                    |  ✓   |    ✓    |  ✓   |   ✓    |       ✓        |
| Editor                   |  ✓   |    ✓    |  ✓   |   ✓    |                |
| Viewer                   |  ✓   |    ✓    |      |        |                |
| Public link (no account) |  ✓   |         |      |        |                |

- One table ([`permissions.ts`](packages/shared/src/permissions.ts)) drives the Worker, the Durable
  Object and the UI. Enforcement is server-side: the DO drops document updates from viewer sockets, the
  Worker checks the role on every HTTP request, and comments are authored by the server from the
  authenticated socket (they can't be forged by a client).
- Role changes and removals apply **live**: the Worker tells the DO, which pushes the new role to open
  sockets (the UI unlocks/locks without a reload) or disconnects them.
- **Share dialog** (owner): invite by email as editor/viewer, change roles, remove people, and set link
  access — _Off_, _Anyone can view_ (public, no sign-in; anonymous visitors connect as read-only guests)
  or _Signed-in users can edit_ (opening the link adds you as an editor). Links can be reset, which
  disconnects anonymous viewers using the old one.
- **Invites and unverified email:** until an email provider is configured, email/password accounts are
  unverified, so anyone could register someone else's address. Inviting an _existing_ account grants
  access immediately (the dialog shows the account's name so you can check it's the right person);
  pending invites for unknown emails are claimed automatically only by **verified** emails (Google
  sign-in). Use the share link for everyone else. Adding an email provider later lets password accounts
  verify and claim invites too.

### Comments, frames, templates, export

- **Comments** (tool `C`): pinned to canvas positions, threaded replies, resolve/reopen, delete own (editors
  can delete any). Stored in the board's DO SQLite and pushed live to everyone; a side panel lists all
  threads. Viewers can comment; anonymous public visitors can only read.
- **Frames** (tool `F`): named areas that carry their contents when moved, always drawn beneath other
  objects. The frames panel jumps to a frame, renames it, and starts **presentation mode** (full screen,
  arrows/space/PageUp-Down to navigate, Esc to exit).
- **Templates:** blank, kanban, retrospective, mind map, flowchart — generated in
  [`templates.ts`](packages/shared/src/model/templates.ts) and seeded into the new board's DO server-side.
- **Export:** board or selection as PNG (2×), PDF with one page per frame (or one page for the board), and
  a portable `.canvasly.json` (objects + embedded images) that can be imported into any board. Exports are
  rendered from the document with a canvas-2D renderer, not screenshots, so off-screen objects are
  included; they always use the light theme. jsPDF is loaded on demand.
- **Dark mode:** light/dark/system toggle. Board colors are stored as authored; in dark mode only the
  default ink (`#1a1a1a`) and paper (`#ffffff`) colors are swapped at render time.
- **Touch & small screens:** one finger pans the empty canvas or drags objects, two fingers pinch-zoom,
  double-tap edits text; on phones the toolbar moves to a scrollable bottom bar and the minimap/zoom
  controls hide.

### Data model

**Yjs document** (per board): `objects: Y.Map<id, Y.Map>` — every object has `id, type, z` (fractional
index), `locked, groupId`; box objects add `x, y, w, h, rotation`; text lives in `Y.Text`. Connectors
reference shapes by id (`{ kind: 'attached', objectId, anchor }`) so they follow them. Schemas are Zod
discriminated unions in [`packages/shared/src/schemas/objects.ts`](packages/shared/src/schemas/objects.ts).

**D1** ([`apps/worker/migrations`](apps/worker/migrations)): Better Auth's `user / session / account /
verification`, plus `boards (… link_role, link_token)`, `board_members (board_id, user_id, role)`,
`board_invites (board_id, email, role)` and `board_thumbnails`.

**Durable Object SQLite**: `doc_snapshot (seq, data)` chunks (< 2 MB rows), `doc_updates` log,
`assets (id, mime, bytes, data)`, `comment_threads (id, x, y, resolved)` and `comments`.

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

1. The app is served at **https://canvasly.anas-hussaindeen.com** (`routes` in
   [`wrangler.jsonc`](apps/worker/wrangler.jsonc), `custom_domain: true`). The domain's DNS is on Cloudflare,
   so `wrangler deploy` creates the DNS record and TLS certificate automatically; the `workers.dev` URL is
   disabled so there's a single origin. To use another (sub)domain, change the route pattern and
   `vars.BETTER_AUTH_URL` — the zone must be on the same Cloudflare account.
2. Log in (with the account that owns the domain): `pnpm --filter @canvasly/worker exec wrangler login`
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
   pnpm exec wrangler secret put GOOGLE_CLIENT_ID       # optional
   # Google redirect URI: https://canvasly.anas-hussaindeen.com/api/auth/callback/google
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

| Resource               | Free limit                                     | How Canvasly uses it                                                                                                                                                        | If exceeded                                                                            |
| ---------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Worker requests        | 100,000 / day                                  | Only `/api/*` runs the Worker (API calls, WS upgrades, image fetches). The SPA's static files are free.                                                                     | `/api/*` returns 429 / error 1027 → can't sign in or open boards. The SPA still loads. |
| Worker CPU             | 10 ms / request                                | PBKDF2 (native) for passwords; no heavy work in the Worker                                                                                                                  | That request fails                                                                     |
| Static asset requests  | Unlimited                                      | HTML/JS/CSS                                                                                                                                                                 | —                                                                                      |
| DO requests            | 100,000 / day; incoming WS messages count 1/20 | ≤ 20 batched frames/s (doc + cursor in one frame) per _active_ user ≈ 3,600 req/hour → ~25+ active user-hours/day; idle clients ≈ 7 req/hour (presence renewal + heartbeat) | Board connections/messages fail; edits stay in the browser (IndexedDB) and sync later  |
| DO duration            | 13,000 GB-s / day                              | Hibernation: idle rooms are evicted while sockets stay open; no server timers                                                                                               | Durable Object calls fail                                                              |
| DO SQLite rows written | 100,000 / day                                  | ~1 row per 2 s of continuous editing per board (+ compaction); one row per image                                                                                            | Saves fail; clients keep edits locally and resend on reconnect                         |
| DO SQLite rows read    | 5,000,000 / day                                | Loading a board reads its snapshot chunks + log (compacted at 200 rows); presence-only wake-ups read nothing                                                                | Boards can't load                                                                      |
| DO storage             | 5 GB total (≈ 1 GB per object); 2 MB per row   | Yjs snapshots chunked < 1 MB; images ≤ 1 MB                                                                                                                                 | Writes fail                                                                            |
| D1 rows read           | 5,000,000 / day                                | Session (cookie-cached 5 min), board list, access checks                                                                                                                    | All D1 queries fail → sign-in and dashboard break                                      |
| D1 rows written        | 100,000 / day                                  | Sign-ups/sessions, board create/rename, thumbnail upserts (≤ 1 per 30 s while editing)                                                                                      | Writes fail                                                                            |
| D1 storage             | 500 MB per DB, 5 GB total; 2 MB per row        | Metadata + ~10–40 KB thumbnails                                                                                                                                             | Inserts fail until data is deleted                                                     |

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
| F / C                           | Frame / Comment                             |
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
| ← → / Space / Esc (presenting)  | Previous / next frame / exit                |
| Touch: drag, pinch, double-tap  | Pan, zoom, edit text                        |
