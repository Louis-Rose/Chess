import { useEffect, useState } from 'react';

// Optional free-text note, saved on blur (only when changed) via the parent's
// onSave. Used for a session's comment and for a per-exercise note.

export function FitSessionComment({ comment, onSave, id = 'session-comment', placeholder = "Comment s'est passée la séance ?" }: {
  comment: string | null;
  onSave: (comment: string | null) => void;
  id?: string;
  placeholder?: string;
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
      <label htmlFor={id} className="mb-1 block text-center text-xs uppercase tracking-wide text-slate-500">
        Notes
      </label>
      <textarea
        id={id}
        value={text}
        onChange={e => setText(e.target.value)}
        onBlur={save}
        rows={2}
        placeholder={placeholder}
        className="w-full resize-none rounded-xl border border-slate-700 bg-slate-800/60 px-3 py-2 text-base text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none"
      />
    </div>
  );
}
