# Contributing to Canvasly

Thanks for helping out. Bug reports, ideas and pull requests are all welcome. For anything large, please open an issue first
so that we can agree on the approach before you spend time on it.

## Getting set up

You need [Node.js 22 or later](https://nodejs.org) and [pnpm](https://pnpm.io) (`npm install -g pnpm`).

```sh
pnpm install
pnpm dev
```

This starts `wrangler dev` on port 8787, with a local D1 database and Durable Objects, and Vite on port 5173, which proxies
`/api`. Open <http://localhost:5173> and create an account. No Cloudflare account is needed.

`pnpm dev` creates `apps/worker/.dev.vars` from [`.dev.vars.example`](apps/worker/.dev.vars.example) on its first run, and
applies database migrations. Local state lives in `apps/worker/.wrangler/`; delete that folder to start fresh.

## Where things are

| Path              | What's there                                                                     |
| ----------------- | -------------------------------------------------------------------------------- |
| `apps/web`        | The React app. `src/canvas` draws the board, `src/ui` is the toolbars and panels |
| `apps/web/e2e`    | Browser tests                                                                    |
| `apps/worker`     | The API, auth and the `BoardRoom` Durable Object. `migrations/` holds D1 schema  |
| `packages/shared` | Code used on both sides: schemas, geometry, the Yjs model, permissions           |
| `docs`            | Architecture, deployment and the user guide                                      |

[Architecture](docs/ARCHITECTURE.md) explains how the pieces fit together, and why they're built this way.

## Before you open a pull request

```sh
pnpm format
pnpm lint
pnpm typecheck
pnpm test
pnpm --filter @canvasly/web test:e2e
```

The browser tests start their own servers on ports 8788 and 5174, so they won't collide with `pnpm dev`. The first run needs
`pnpm --filter @canvasly/web exec playwright install chromium`.

## Conventions

- **It has to stay free to host.** Canvasly runs on the Cloudflare Workers Free plan with no payment method on file. A change
  that needs a paid service, or pushes against the [free-tier limits](docs/DEPLOYMENT.md#free-tier-limits-we-rely-on), needs
  a discussion first.
- **Enforce permissions on the server.** The UI hiding a button isn't protection. Check roles in the Worker or the Durable
  Object.
- **Keep old boards working.** Documents live for a long time. New object fields need a default in their Zod schema, so that
  existing data keeps parsing, and a value this client doesn't recognize should fall back rather than break an object.
- **Test what you change.** Put logic in `packages/shared` where you can, and unit test it there. Use browser tests for
  behavior people see, and check that a new test fails without your change.
- **Match the code around you.** ESLint and Prettier handle most of the style. Comments explain why, not what.

## Commit messages

Start with a short summary in the imperative, like "Add corner rounding for shapes", and explain the why in the body when it
isn't obvious. Update [`CHANGELOG.md`](CHANGELOG.md) if people would notice the change.

## Updating screenshots

Screenshots in the docs come from the real app, with demo content:

```sh
pnpm --filter @canvasly/web screenshots
```

## Releasing

For maintainers: update `CHANGELOG.md`, then publish a GitHub Release with a tag like `v1.2.0`. That runs
[`release.yml`](.github/workflows/release.yml), which publishes the shared library to GitHub Packages at that version and
attaches it to the release. Pushing to `main` deploys the site separately, once CI passes.

## Code of conduct

By taking part, you agree to follow the [code of conduct](CODE_OF_CONDUCT.md).
