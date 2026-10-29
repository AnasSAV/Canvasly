import { TEMPLATES, type TemplateId } from '@canvasly/shared';
import { Columns3, MessagesSquare, Network, SquareDashed, Workflow, X } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';

const ICONS: Record<TemplateId, ReactNode> = {
  blank: <SquareDashed size={28} />,
  kanban: <Columns3 size={28} />,
  retrospective: <MessagesSquare size={28} />,
  mindmap: <Network size={28} />,
  flowchart: <Workflow size={28} />,
};

export function TemplatePicker({
  onPick,
  onClose,
  busy,
}: {
  onPick: (id: TemplateId) => void;
  onClose: () => void;
  busy: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 p-4 pt-[12vh]"
      onPointerDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-label="Choose a template"
        className="w-full max-w-2xl rounded-2xl border border-gray-200 bg-white p-5 shadow-xl dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
      >
        <div className="mb-4 flex items-center justify-between">
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
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {TEMPLATES.map((t) => (
            <button
              key={t.id}
              type="button"
              disabled={busy}
              onClick={() => onPick(t.id)}
              className="flex flex-col items-start gap-2 rounded-xl border border-gray-200 p-4 text-left transition-colors hover:border-indigo-400 hover:bg-indigo-50/50 disabled:opacity-50 dark:border-zinc-700 dark:hover:border-indigo-500 dark:hover:bg-indigo-500/10"
              data-testid={`template-${t.id}`}
            >
              <span className="text-indigo-600 dark:text-indigo-400">{ICONS[t.id]}</span>
              <span className="text-sm font-medium">{t.name}</span>
              <span className="text-xs text-gray-500 dark:text-zinc-400">{t.description}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
