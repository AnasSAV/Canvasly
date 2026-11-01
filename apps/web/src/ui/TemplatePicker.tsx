import { TEMPLATES, type TemplateId } from '@canvasly/shared';
import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { TemplatePreview } from './TemplatePreview';

const CATEGORIES = ['All', 'Agile', 'Diagrams', 'Strategy', 'Planning', 'Meetings'] as const;

/** Template gallery shown when creating a board from the dashboard. */
export function TemplatePicker({
  onPick,
  onClose,
  busy,
}: {
  onPick: (id: TemplateId) => void;
  onClose: () => void;
  busy: boolean;
}) {
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>('All');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const list = TEMPLATES.filter((t) => category === 'All' || t.category === category || t.id === 'blank');

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 p-4 pt-[8vh]"
      onPointerDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-label="Choose a template"
        className="flex max-h-[84vh] w-full max-w-4xl flex-col rounded-2xl bg-white p-5 shadow-xl dark:bg-zinc-900 dark:text-zinc-100"
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">New board</h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="rounded-md p-1 hover:bg-gray-100 dark:hover:bg-zinc-800"
          >
            <X size={18} />
          </button>
        </div>
        <div className="mb-4 flex flex-wrap gap-1.5">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              className={`rounded-full px-3 py-1 text-sm ${
                c === category
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'
              }`}
            >
              {c}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-4 overflow-y-auto p-1 sm:grid-cols-3 lg:grid-cols-4">
          {list.map((t) => (
            <button
              key={t.id}
              type="button"
              disabled={busy}
              onClick={() => onPick(t.id)}
              className="group flex flex-col text-left disabled:opacity-50"
              data-testid={`template-${t.id}`}
            >
              <span className="block aspect-[4/3] w-full overflow-hidden rounded-lg border border-gray-200 transition-shadow group-hover:border-indigo-400 group-hover:shadow-md dark:border-zinc-700">
                <TemplatePreview id={t.id} />
              </span>
              <span className="mt-2 text-sm font-medium">{t.name}</span>
              <span className="text-xs text-gray-500 dark:text-zinc-400">{t.description}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
