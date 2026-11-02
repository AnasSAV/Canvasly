import { aabb, buildTemplate, unionRects, type BoardObject, type TemplateId } from '@canvasly/shared';
import { memo, useMemo } from 'react';

const center = (o: BoardObject) => {
  if (o.type === 'connector') return null;
  return { x: o.x + o.w / 2, y: o.y + o.h / 2 };
};

/** Frames, then connectors, then the rest, so lines run center to center but stop at the shapes. */
const layer = (o: BoardObject) => (o.type === 'frame' ? 0 : o.type === 'connector' ? 1 : 2);

/** Miniature of a template, drawn from the same objects the template creates. */
export const TemplatePreview = memo(function TemplatePreview({ id }: { id: TemplateId }) {
  const objects = useMemo(() => buildTemplate(id).sort((a, b) => layer(a) - layer(b)), [id]);
  const bounds = unionRects(objects.filter((o) => o.type !== 'connector').map((o) => aabb(o as never)));
  const byId = new Map(objects.map((o) => [o.id, o]));
  if (!bounds) {
    return <div className="h-full w-full bg-white dark:bg-zinc-800" />;
  }
  const pad = Math.max(bounds.w, bounds.h) * 0.06;
  const viewBox = `${bounds.x - pad} ${bounds.y - pad} ${bounds.w + pad * 2} ${bounds.h + pad * 2}`;
  const unit = Math.max(bounds.w, bounds.h) / 160;
  return (
    <svg viewBox={viewBox} className="h-full w-full bg-white dark:bg-zinc-800" aria-hidden>
      {objects.map((o) => {
        switch (o.type) {
          case 'connector': {
            const a = o.start.kind === 'attached' ? center(byId.get(o.start.objectId)!) : null;
            const b = o.end.kind === 'attached' ? center(byId.get(o.end.objectId)!) : null;
            if (!a || !b) return null;
            return (
              <line
                key={o.id}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke="#868e96"
                strokeWidth={unit * 0.8}
              />
            );
          }
          case 'frame':
            return (
              <rect
                key={o.id}
                x={o.x}
                y={o.y}
                width={o.w}
                height={o.h}
                fill={o.fill === 'transparent' ? 'none' : o.fill}
                stroke="#ced4da"
                strokeWidth={unit * 0.8}
              />
            );
          case 'sticky':
            return <rect key={o.id} x={o.x} y={o.y} width={o.w} height={o.h} rx={unit} fill={o.color} />;
          case 'text':
            return (
              <rect
                key={o.id}
                x={o.x}
                y={o.y}
                width={o.w * 0.5}
                height={o.h * 0.6}
                rx={unit}
                fill="#343a40"
              />
            );
          case 'table':
            return (
              <g key={o.id}>
                <rect
                  x={o.x}
                  y={o.y}
                  width={o.w}
                  height={o.h}
                  fill="#fff"
                  stroke="#adb5bd"
                  strokeWidth={unit}
                />
                <rect x={o.x} y={o.y} width={o.w} height={o.rows[0]!.h} fill={o.headerFill} />
              </g>
            );
          case 'ellipse':
          case 'cloud':
            return (
              <ellipse
                key={o.id}
                cx={o.x + o.w / 2}
                cy={o.y + o.h / 2}
                rx={o.w / 2}
                ry={o.h / 2}
                fill={o.fill}
                stroke={o.stroke}
                strokeWidth={unit}
              />
            );
          case 'pen':
          case 'image':
          case 'pdf':
          case 'chart':
            return null;
          default:
            return (
              <rect
                key={o.id}
                x={o.x}
                y={o.y}
                width={o.w}
                height={o.h}
                rx={unit * 2}
                fill={o.fill}
                stroke={o.stroke}
                strokeWidth={unit}
              />
            );
        }
      })}
    </svg>
  );
});
