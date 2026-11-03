import { TEMPLATES, type TemplateId } from '@canvasly/shared';
import { useState } from 'react';
import { Dialog } from './Dialog';
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
  const list = TEMPLATES.filter((t) => category === 'All' || t.category === category || t.id === 'blank');

  return (
    <Dialog
      label="Choose a template"
      title="New board"
      subtitle="Start blank, or from something already laid out."
      size="xl"
      onClose={onClose}
      bare
    >
      <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
        <nav
          className="flex shrink-0 gap-0.5 overflow-x-auto border-b border-line p-2 sm:w-40 sm:flex-col sm:border-r sm:border-b-0"
          aria-label="Template categories"
        >
          {CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={c === category}
              onClick={() => setCategory(c)}
              className={`menu-row w-auto! font-medium sm:w-full! ${
                c === category ? 'bg-selected! text-on-selected' : ''
              }`}
            >
              {c}
            </button>
          ))}
        </nav>
        <div className="grid min-h-0 flex-1 grid-cols-2 content-start gap-x-4 gap-y-5 overflow-y-auto p-4 md:grid-cols-3 lg:grid-cols-4">
          {list.map((t) => (
            <button
              key={t.id}
              type="button"
              disabled={busy}
              onClick={() => onPick(t.id)}
              className="group flex min-w-0 flex-col text-left disabled:opacity-50"
              data-testid={`template-${t.id}`}
            >
              <span className="block aspect-[4/3] w-full overflow-hidden rounded-md border border-line transition-colors duration-100 group-hover:border-teal">
                <TemplatePreview id={t.id} />
              </span>
              <span className="mt-1.5 text-[13px] font-semibold">{t.name}</span>
              <span className="text-xs leading-snug text-muted">{t.description}</span>
            </button>
          ))}
        </div>
      </div>
    </Dialog>
  );
}
