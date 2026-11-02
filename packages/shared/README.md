# @anassav/canvasly-shared

The shared core of [Canvasly](https://github.com/AnasSAV/Canvasly), a real-time collaborative whiteboard: the board's
object schemas, canvas geometry, Yjs document helpers, permissions and templates. It runs in browsers, Node.js and
Cloudflare Workers, and has no DOM dependency.

## Install

The package is on GitHub Packages, which needs a GitHub login to install from, even for public packages. Create a
[personal access token](https://github.com/settings/tokens) with the `read:packages` scope, then add this to an `.npmrc`
in your project, keeping the token out of version control:

```ini
@anassav:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

```sh
npm install @anassav/canvasly-shared yjs
```

`yjs` is a peer dependency, so that your app and this library share one copy of it.

## Usage

### Validate board objects

Every object on a board is a [Zod](https://zod.dev) schema, discriminated by `type`. Fields added in later versions get
defaults, so older data keeps parsing.

```ts
import { BoardObject, makeShape, makeSticky } from '@anassav/canvasly-shared';

const sticky = makeSticky({ x: 0, y: 0 }, 'a0');
const rounded = { ...makeShape('rect', { x: 200, y: 0, w: 160, h: 100 }, 'a1'), cornerRadius: 12 };

BoardObject.parse(sticky);
BoardObject.safeParse({ type: 'sticky' }).success; // false
```

### Route lines between shapes

```ts
import { resolveConnector, type AttachTarget } from '@anassav/canvasly-shared';

const shapes: Record<string, AttachTarget> = {
  a: { x: 0, y: 0, w: 100, h: 100, rotation: 0, outline: 'rect' },
  b: { x: 300, y: 200, w: 100, h: 100, rotation: 0, outline: 'rect' },
};

const line = resolveConnector(
  {
    start: { kind: 'attached', objectId: 'a', anchor: [1, 0.5] },
    end: { kind: 'attached', objectId: 'b', anchor: [0, 0.5] },
    routing: 'elbow',
  },
  (id) => shapes[id],
);

line?.points; // [100, 50, 200, 50, 200, 250, 300, 250]
```

Routes are `straight`, `elbow` or `curved`. Curves come back as sampled points, so everything can treat them alike.

### Keep objects in a shared Yjs document

Concurrent edits to different fields merge, and text is a `Y.Text`, so people can type in the same object at once.

```ts
import * as Y from 'yjs';
import { getObjectsMap, insertObject, makeSticky, patchObject, readObjects } from '@anassav/canvasly-shared';

const doc = new Y.Doc();
const objects = getObjectsMap(doc);
const note = makeSticky({ x: 0, y: 0 }, 'a0');

insertObject(objects, note);
patchObject(objects, note.id, { text: 'Hello', x: 40 });
readObjects(objects); // validated objects
```

### Check permissions

```ts
import { can } from '@anassav/canvasly-shared';

can('viewer', 'comment'); // true
can('viewer', 'edit'); // false
```

### Build templates, layers and more

```ts
import { TEMPLATES, buildLayers, buildTemplate, parsePageRanges } from '@anassav/canvasly-shared';

TEMPLATES.map((t) => t.name); // 'Blank', 'Kanban', ...
const kanban = buildTemplate('kanban'); // ready-made board objects
buildLayers(kanban); // top-first list, with groups gathered together
parsePageRanges('1-3, 5', 21); // { pages: [0, 1, 2, 4] }
```

## What's included

| Area          | Exports                                                                                   |
| ------------- | ----------------------------------------------------------------------------------------- |
| Schemas       | `BoardObject` and one schema per object type, API, comment, sharing and export schemas    |
| Factories     | `makeSticky`, `makeText`, `makeShape`, `makeConnector`, `makeTable`, `makeChart`, ...     |
| Geometry      | `resolveConnector`, `curvePoints`, `elbowPoints`, `snapRect`, `zoomAt`, `recognizeStroke` |
| Yjs model     | `getObjectsMap`, `insertObject`, `patchObject`, `readObjects`, clipboard helpers          |
| Collaboration | `can`, wire protocol and presence schemas                                                 |
| Content       | `TEMPLATES`, `buildTemplate`, `buildLayers`, `parsePageRanges`, list and Canva helpers    |

## Stability

This library is extracted from the app that uses it, so its first job is serving Canvasly. It follows
[semantic versioning](https://semver.org), and breaking changes are listed in the
[changelog](https://github.com/AnasSAV/Canvasly/blob/main/CHANGELOG.md).

## License

[MIT](https://github.com/AnasSAV/Canvasly/blob/main/LICENSE)
