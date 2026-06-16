// A small centered confirmation modal, used to guard changes to an already
// saved session (deleting a session, set or exercise, or editing one).

export function FitConfirm({ title, message, confirmLabel = 'Confirmer', cancelLabel = 'Annuler', danger, hideCancel, onConfirm, onCancel }: {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  hideCancel?: boolean;   // single-button notice (no cancel) — just acknowledge
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-black/60 px-6"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-xs rounded-2xl border border-slate-700 bg-slate-900 p-5 text-center"
        onClick={e => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-slate-100">{title}</h2>
        {message && <p className="mt-2 text-sm text-slate-400">{message}</p>}
        <div className="mt-5 flex gap-3">
          {!hideCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 rounded-xl border border-slate-700 px-4 py-2.5 font-medium text-slate-200 transition-colors active:bg-slate-800"
            >
              {cancelLabel}
            </button>
          )}
          <button
            type="button"
            onClick={onConfirm}
            className={`flex-1 rounded-xl px-4 py-2.5 font-semibold text-white transition-colors ${
              danger ? 'bg-red-600 active:bg-red-500' : 'bg-emerald-600 active:bg-emerald-500'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
