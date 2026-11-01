import { CHART_KINDS, CHART_PALETTE, type ChartKind, type ChartObject } from '@canvasly/shared';
import { Plus, X } from 'lucide-react';
import { useBoard, useDocVersion } from '../doc/context';
import { patch } from '../doc/ops';
import { useUI } from '../state/ui';
import { panel } from './IconButton';

const KIND_LABELS: Record<ChartKind, string> = {
  bar: 'Bar',
  line: 'Line',
  area: 'Area',
  pie: 'Pie',
  donut: 'Donut',
};

const cell =
  'w-full min-w-0 rounded border border-transparent bg-transparent px-1.5 py-1 text-sm outline-none hover:border-gray-300 focus:border-indigo-500 dark:hover:border-zinc-600';

/** Side panel for a chart's title, type and data. */
export function ChartEditor() {
  const board = useBoard();
  useDocVersion(board);
  const id = useUI((s) => s.chartEditorId);
  const setChartEditor = useUI((s) => s.setChartEditor);
  const readOnly = useUI((s) => s.readOnly);
  const obj = id ? board.store.get(id) : undefined;
  if (!id || obj?.type !== 'chart' || readOnly) return null;
  const c: ChartObject = obj;
  const round = c.chartKind === 'pie' || c.chartKind === 'donut';
  const series = round ? c.series.slice(0, 1) : c.series;
  const update = (p: Partial<Pick<ChartObject, 'title' | 'chartKind' | 'labels' | 'series'>>) =>
    patch(board, c.id, p);

  const setValue = (si: number, li: number, text: string) => {
    const value = Number(text);
    if (!Number.isFinite(value)) return;
    update({
      series: c.series.map((s, i) => {
        if (i !== si) return s;
        const values = c.labels.map((_, j) => s.values[j] ?? 0);
        values[li] = value;
        return { ...s, values };
      }),
    });
  };
  const addRow = () =>
    update({
      labels: [...c.labels, `Item ${c.labels.length + 1}`],
      series: c.series.map((s) => ({ ...s, values: [...s.values, 0] })),
    });
  const removeRow = (li: number) =>
    update({
      labels: c.labels.filter((_, i) => i !== li),
      series: c.series.map((s) => ({ ...s, values: s.values.filter((_, i) => i !== li) })),
    });
  const addSeries = () =>
    update({
      series: [
        ...c.series,
        {
          name: `Series ${c.series.length + 1}`,
          color: CHART_PALETTE[c.series.length % CHART_PALETTE.length]!,
          values: c.labels.map(() => 0),
        },
      ],
    });

  return (
    <aside
      className={`${panel} absolute top-[72px] right-3 bottom-16 z-20 flex w-[22rem] max-w-[calc(100%-1.5rem)] flex-col`}
      data-testid="chart-editor"
    >
      <div className="flex items-center justify-between border-b border-gray-200 px-3 py-2.5 dark:border-zinc-700">
        <h2 className="text-sm font-semibold">Chart data</h2>
        <button
          type="button"
          aria-label="Close chart data"
          onClick={() => setChartEditor(null)}
          className="rounded p-0.5 hover:bg-gray-100 dark:hover:bg-zinc-800"
        >
          <X size={16} />
        </button>
      </div>
      <div className="flex flex-col gap-3 overflow-y-auto p-3">
        <label className="text-xs font-medium text-gray-500 dark:text-zinc-400">
          Title
          <input
            value={c.title}
            maxLength={120}
            onChange={(e) => update({ title: e.target.value })}
            onKeyDown={(e) => e.stopPropagation()}
            className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm text-gray-900 outline-none focus:border-indigo-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
            data-testid="chart-title"
          />
        </label>
        <div className="flex flex-wrap gap-1">
          {CHART_KINDS.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => update({ chartKind: k })}
              className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                c.chartKind === k
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 hover:bg-gray-200 dark:bg-zinc-800 dark:hover:bg-zinc-700'
              }`}
            >
              {KIND_LABELS[k]}
            </button>
          ))}
        </div>
        <div className="overflow-x-auto">
          <table
            className="min-w-full table-fixed border-collapse text-sm"
            style={{ width: 84 + series.length * 122 }}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <thead>
              <tr>
                <th className="w-16 p-0.5 text-left text-xs font-medium text-gray-500 dark:text-zinc-400">
                  Label
                </th>
                {series.map((s, si) => (
                  <th key={si} className="p-0.5">
                    <div className="flex items-center gap-1">
                      <input
                        type="color"
                        value={s.color.length === 7 ? s.color : '#4262ff'}
                        aria-label={`Color of ${s.name}`}
                        onChange={(e) =>
                          update({
                            series: c.series.map((x, i) => (i === si ? { ...x, color: e.target.value } : x)),
                          })
                        }
                        className="h-5 w-5 shrink-0 cursor-pointer border-0 bg-transparent p-0"
                      />
                      <input
                        value={s.name}
                        maxLength={60}
                        aria-label="Series name"
                        onChange={(e) =>
                          update({
                            series: c.series.map((x, i) => (i === si ? { ...x, name: e.target.value } : x)),
                          })
                        }
                        className={`${cell} font-medium`}
                      />
                      {!round && c.series.length > 1 && (
                        <button
                          type="button"
                          aria-label={`Remove ${s.name}`}
                          onClick={() => update({ series: c.series.filter((_, i) => i !== si) })}
                          className="shrink-0 rounded p-0.5 text-gray-400 hover:text-red-600"
                        >
                          <X size={12} />
                        </button>
                      )}
                    </div>
                  </th>
                ))}
                <th className="w-5" />
              </tr>
            </thead>
            <tbody>
              {c.labels.map((label, li) => (
                <tr key={li} className="border-t border-gray-100 dark:border-zinc-800">
                  <td className="p-0.5">
                    <input
                      value={label}
                      maxLength={60}
                      aria-label={`Label ${li + 1}`}
                      onChange={(e) =>
                        update({ labels: c.labels.map((l, i) => (i === li ? e.target.value : l)) })
                      }
                      className={cell}
                    />
                  </td>
                  {series.map((s, si) => (
                    <td key={si} className="p-0.5">
                      <input
                        type="number"
                        value={s.values[li] ?? 0}
                        aria-label={`${s.name} value ${li + 1}`}
                        onChange={(e) => setValue(si, li, e.target.value)}
                        className={`${cell} tabular-nums`}
                        data-testid={`chart-value-${si}-${li}`}
                      />
                    </td>
                  ))}
                  <td>
                    {c.labels.length > 1 && (
                      <button
                        type="button"
                        aria-label={`Remove ${label}`}
                        onClick={() => removeRow(li)}
                        className="rounded p-0.5 text-gray-400 hover:text-red-600"
                      >
                        <X size={12} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={addRow}
            disabled={c.labels.length >= 60}
            className="flex items-center gap-1 rounded-md bg-gray-100 px-2 py-1 text-xs font-medium hover:bg-gray-200 disabled:opacity-40 dark:bg-zinc-800 dark:hover:bg-zinc-700"
          >
            <Plus size={12} /> Row
          </button>
          {!round && (
            <button
              type="button"
              onClick={addSeries}
              disabled={c.series.length >= 8}
              className="flex items-center gap-1 rounded-md bg-gray-100 px-2 py-1 text-xs font-medium hover:bg-gray-200 disabled:opacity-40 dark:bg-zinc-800 dark:hover:bg-zinc-700"
            >
              <Plus size={12} /> Series
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
