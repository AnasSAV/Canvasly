import { CHART_KINDS, CHART_PALETTE, type ChartKind, type ChartObject } from '@canvasly/shared';
import { Plus, X } from 'lucide-react';
import { useBoard, useDocVersion } from '../doc/context';
import { patch } from '../doc/ops';
import { useUI } from '../state/ui';
import { CustomColor } from './CustomColor';
import { SidePanel } from './SidePanel';

const KIND_LABELS: Record<ChartKind, string> = {
  bar: 'Bar',
  line: 'Line',
  area: 'Area',
  pie: 'Pie',
  donut: 'Donut',
};

const cell =
  'w-full min-w-0 rounded border border-transparent bg-transparent px-1.5 py-1 text-[13px] outline-none hover:border-line-strong focus:border-teal';

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
    <SidePanel
      title="Chart data"
      width="w-[22rem]"
      closeLabel="Close chart data"
      onClose={() => setChartEditor(null)}
      testId="chart-editor"
    >
      <div className="flex flex-col gap-3 overflow-y-auto p-3">
        <label className="field-label mb-0!">
          Title
          <input
            value={c.title}
            maxLength={120}
            onChange={(e) => update({ title: e.target.value })}
            onKeyDown={(e) => e.stopPropagation()}
            className="field mt-1.5 font-normal"
            data-testid="chart-title"
          />
        </label>
        <div
          className="flex overflow-hidden rounded-[7px] border border-line-strong"
          role="group"
          aria-label="Chart type"
        >
          {CHART_KINDS.map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={c.chartKind === k}
              onClick={() => update({ chartKind: k })}
              className={`h-8 flex-1 border-r border-line-strong text-xs font-semibold last:border-r-0 ${
                c.chartKind === k ? 'bg-teal text-on-teal' : 'hover:bg-hover'
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
                <th className="w-16 p-0.5 text-left text-xs font-semibold text-muted">Label</th>
                {series.map((s, si) => (
                  <th key={si} className="p-0.5">
                    <div className="flex items-center gap-1">
                      <CustomColor
                        showValue
                        value={s.color}
                        label={`Color of ${s.name}`}
                        onPick={(color) =>
                          update({ series: c.series.map((x, i) => (i === si ? { ...x, color } : x)) })
                        }
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
                        className={`${cell} font-semibold`}
                      />
                      {!round && c.series.length > 1 && (
                        <button
                          type="button"
                          aria-label={`Remove ${s.name}`}
                          onClick={() => update({ series: c.series.filter((_, i) => i !== si) })}
                          className="shrink-0 rounded p-0.5 text-muted hover:text-danger"
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
                <tr key={li} className="border-t border-line">
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
                        className="rounded p-0.5 text-muted hover:text-danger"
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
            className="btn btn-sm btn-secondary"
          >
            <Plus size={12} /> Row
          </button>
          {!round && (
            <button
              type="button"
              onClick={addSeries}
              disabled={c.series.length >= 8}
              className="btn btn-sm btn-secondary"
            >
              <Plus size={12} /> Series
            </button>
          )}
        </div>
      </div>
    </SidePanel>
  );
}
