# Canvasly

A Miro-style collaborative whiteboard designed to run entirely on Cloudflare's **Workers Free** plan.

> **Status: Phase 1 — infinite canvas (single user, local only).** Boards are stored in the browser
> (IndexedDB). Backend, auth, real-time collaboration and sharing arrive in Phases 2–4, and this README
> will grow the architecture diagram, Cloudflare setup, deploy steps and free-tier limits table then.

## Quick start

Requires Node 22+ and pnpm (`npm i -g pnpm`).

```sh
pnpm install
pnpm dev            # http://localhost:5173
```

| Command                                | What it does                                     |
| -------------------------------------- | ------------------------------------------------ |
| `pnpm dev`                             | Vite dev server for the web app                  |
| `pnpm test`                            | Vitest unit tests (geometry, CRDT model helpers) |
| `pnpm lint`                            | ESLint (typescript-eslint strict + react-hooks)  |
| `pnpm typecheck`                       | `tsc` in every package (strict)                  |
| `pnpm format`                          | Prettier                                         |
| `pnpm --filter @canvasly/web test:e2e` | Playwright end-to-end tests                      |

## Layout

```
apps/web          React + Vite + Tailwind SPA (react-konva canvas, Zustand UI state)
packages/shared   Zod schemas, geometry, Yjs document helpers (used by web and, later, the worker)
```

## How the canvas works

- **Document:** a Yjs `Y.Doc` holds `objects: Y.Map<id, Y.Map>`; text is `Y.Text`. Phase 1 persists it
  locally with `y-indexeddb`; later phases sync the same document to a Durable Object.
- **Undo/redo:** `Y.UndoManager` scoped to local edits; drags/resizes are grouped into one step.
- **Rendering:** `DocStore` mirrors the doc into plain objects (identity preserved when unchanged, so
  memoized Konva nodes skip re-render) plus an R-tree (`rbush`) of world bounds.
  - Viewport culling: only objects intersecting the visible rect (+margin) are mounted.
  - Hit-testing is geometric via the R-tree, so the content layer has `listening={false}` and Konva never
    draws a hit canvas for it. Only the overlay layer (Transformer, connector handles) listens.
  - The dotted grid is a CSS background; below 25% zoom text and shadows are skipped (low detail).
  - Drag updates are coalesced to one doc write per animation frame.
- **Z-order:** fractional-index strings, so concurrent reorders never conflict.
- **Images:** resized client-side to max 1600 px and re-encoded as WebP ≤ 1 MB.

## Keyboard shortcuts

| Key                        | Action                                      |
| -------------------------- | ------------------------------------------- |
| V / H                      | Select / Hand                               |
| N / T                      | Sticky note / Text                          |
| R / O                      | Rectangle / Ellipse                         |
| L / A                      | Line / Arrow (connector)                    |
| P / E                      | Pen / Eraser (pen strokes)                  |
| I                          | Upload image                                |
| Space + drag, middle mouse | Pan                                         |
| Ctrl/⌘ + wheel, pinch      | Zoom at cursor                              |
| Shift+1 / Shift+0          | Zoom to fit / 100%                          |
| Ctrl/⌘ Z, Ctrl/⌘ Shift Z   | Undo / Redo                                 |
| Ctrl/⌘ D / A / C / X / V   | Duplicate / Select all / Copy / Cut / Paste |
| Ctrl/⌘ G, Ctrl/⌘ Shift G   | Group / Ungroup                             |
| Ctrl/⌘ Shift L             | Lock / unlock                               |
| ] / [                      | Bring to front / Send to back               |
| Arrows (Shift = 10px)      | Nudge                                       |
| Enter / double-click       | Edit text                                   |
| Del / Backspace, Esc       | Delete, Deselect                            |
| Alt while dragging         | Disable alignment snapping                  |
