import { useEffect, useState } from 'react';

// Optional free-text comment on a session. Saved on blur (only when changed)
// via the parent's onSave. Shared by the new-session flow and the detail view.

export function FitSessionComment({ comment, onSave }: {
  comment: string | null;
  onSave: (comment: string | null) => void;
}) {
  const [text, setText] = useState(comment ?? '');

  // Reflect the persisted value once it loads / changes.
  useEffect(() => { setText(comment ?? ''); }, [comment]);

  function save() {
    const next = text.trim();
    if (next !== (comment ?? '').trim()) onSave(next || null);
  }

  return (
    <div className="mx-auto w-full max-w-[22rem]">
      <label htmlFor="session-comment" className="mb-1 block text-center text-xs uppercase tracking-wide text-slate-500">
        Commentaire
      </label>
      <textarea
        id="session-comment"
        value={text}
        onChange={e => setText(e.target.value)}
        onBlur={save}
        rows={2}
        placeholder="Comment s'est passée la séance ?"
        className="w-full resize-none rounded-xl border border-slate-700 bg-slate-800/60 px-3 py-2 text-base text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none"
      />
    </div>
  );
}
