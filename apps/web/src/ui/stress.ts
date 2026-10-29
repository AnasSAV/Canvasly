import {
  STICKY_COLORS,
  keysAbove,
  makeConnector,
  makeShape,
  makeSticky,
  type BoardObject,
  type ShapeKind,
} from '@canvasly/shared';
import type { Board } from '../doc/board';
import { addObjects, contentBounds } from '../doc/ops';

/** Dev helper: scatter `n` stickies/shapes (plus some connectors) to exercise culling and rendering. */
export function addStressObjects(board: Board, n: number) {
  const cols = Math.ceil(Math.sqrt(n));
  // Start to the right of existing content so the generated grid doesn't overlap it.
  const origin = contentBounds(board.store);
  const ox = origin ? origin.x + origin.w + 400 : 0;
  const oy = origin ? origin.y : 0;
  const keys = keysAbove(board.store.getSorted().at(-1)?.z ?? null, n + Math.floor(n / 10));
  const objs: BoardObject[] = [];
  const kinds: ShapeKind[] = ['rect', 'ellipse', 'triangle'];
  for (let i = 0; i < n; i++) {
    const x = ox + (i % cols) * 260 + Math.random() * 30;
    const y = oy + Math.floor(i / cols) * 260 + Math.random() * 30;
    if (i % 2 === 0) {
      objs.push({
        ...makeSticky({ x, y }, keys[i]!, STICKY_COLORS[i % STICKY_COLORS.length]),
        text: `Note ${i + 1}\nlorem ipsum dolor sit amet`,
      });
    } else {
      objs.push(
        makeShape(kinds[i % 3]!, { x, y, w: 160, h: 110 }, keys[i]!, { fill: '#e0e7ff', stroke: '#4338ca' }),
      );
    }
  }
  for (let i = 0; i + 1 < n && objs.length < keys.length; i += 10) {
    objs.push(
      makeConnector(
        { kind: 'attached', objectId: objs[i]!.id, anchor: 'auto' },
        { kind: 'attached', objectId: objs[i + 1]!.id, anchor: 'auto' },
        keys[objs.length]!,
        { arrow: true },
      ),
    );
  }
  addObjects(board, objs);
}
