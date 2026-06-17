import { useState } from 'react';
import axios from 'axios';
import { Pencil, Plus, Trash2, X } from 'lucide-react';
import { fitRequest } from './fitAuth';
import { MUSCLE_ORDER, type CustomExercise } from './programData';

// Custom-exercise management for one muscle, shown under the picker in the
// program editor. Lists this muscle's custom exercises (edit / delete) and a
// "Créer un exercice" button that opens a form (free-text name, an optional row
// of variants, and manual primary/secondary muscle selection). On any change it
// calls onChanged so the parent reloads the merged picker + selections.

const NAME_MAX = 60;

type Draft = { id: number | null; name: string; variants: string[]; primary: string[]; secondary: string[] };

export function FitCustomExercises({ muscle, customs, onChanged }: {
  muscle: string;
  customs: CustomExercise[];          // the full list; filtered to `muscle` here
  onChanged: () => void;
}) {
  const mine = customs.filter(c => c.muscle === muscle);
  const [draft, setDraft] = useState<Draft | null>(null);   // open form (new or edit)
  const [confirmId, setConfirmId] = useState<number | null>(null);

  function openNew() {
    setDraft({ id: null, name: '', variants: [], primary: [muscle], secondary: [] });
  }
  function openEdit(c: CustomExercise) {
    setDraft({ id: c.id, name: c.name, variants: [...c.variants], primary: [...c.primary], secondary: [...c.secondary] });
  }

  async function remove(id: number) {
    try {
      await fitRequest(() => axios.delete(`/api/fit/custom-exercises/${id}`));
      setConfirmId(null);
      onChanged();
    } catch { /* keep shown */ }
  }

  return (
    <div className="mx-auto mt-8 w-full max-w-[18rem]">
      <p className="text-center text-xs uppercase tracking-wide text-slate-500">Mes exercices</p>

      <div className="mt-3 flex flex-col gap-2">
        {mine.map(c => (
          <div key={c.id} className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800/40 px-3 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-slate-100">{c.name}</p>
              {c.variants.length > 0 && (
                <p className="truncate text-xs text-slate-400">({c.variants.join(', ')})</p>
              )}
            </div>
            {confirmId === c.id ? (
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setConfirmId(null)} className="rounded-lg border border-slate-700 px-2 py-1 text-xs text-slate-200 active:bg-slate-800">Annuler</button>
                <button type="button" onClick={() => remove(c.id)} className="rounded-lg bg-red-600/90 px-2 py-1 text-xs font-semibold text-white active:bg-red-600">Suppr.</button>
              </div>
            ) : (
              <div className="flex items-center gap-1">
                <button type="button" aria-label="Modifier" onClick={() => openEdit(c)} className="rounded-lg p-1.5 text-slate-400 active:bg-slate-800">
                  <Pencil className="h-4 w-4" />
                </button>
                <button type="button" aria-label="Supprimer" onClick={() => setConfirmId(c.id)} className="rounded-lg p-1.5 text-slate-500 active:text-red-300">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={openNew}
        className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-600 px-4 py-2.5 text-sm font-medium text-slate-200 transition-colors active:bg-slate-800/60"
      >
        <Plus className="h-4 w-4" />
        Créer un exercice
      </button>

      {draft && (
        <CustomForm
          muscle={muscle}
          draft={draft}
          onClose={() => setDraft(null)}
          onSaved={() => { setDraft(null); onChanged(); }}
        />
      )}
    </div>
  );
}

function CustomForm({ muscle, draft, onClose, onSaved }: {
  muscle: string;
  draft: Draft;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(draft.name);
  const [variants, setVariants] = useState<string[]>(draft.variants);
  const [variantInput, setVariantInput] = useState('');
  const [primary, setPrimary] = useState<string[]>(draft.primary);
  const [secondary, setSecondary] = useState<string[]>(draft.secondary);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A muscle is either primary or secondary, never both: toggling one role
  // clears the other.
  const togglePrimary = (m: string) => {
    setPrimary(p => p.includes(m) ? p.filter(x => x !== m) : [...p, m]);
    setSecondary(s => s.filter(x => x !== m));
  };
  const toggleSecondary = (m: string) => {
    setSecondary(s => s.includes(m) ? s.filter(x => x !== m) : [...s, m]);
    setPrimary(p => p.filter(x => x !== m));
  };

  function addVariant() {
    const v = variantInput.trim();
    if (!v || variants.includes(v)) { setVariantInput(''); return; }
    setVariants([...variants, v]);
    setVariantInput('');
  }

  const canSave = name.trim().length > 0 && primary.length > 0 && !saving;

  async function save() {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    const body = { name: name.trim(), muscle, primary, secondary, variants };
    try {
      if (draft.id == null) await fitRequest(() => axios.post('/api/fit/custom-exercises', body));
      else await fitRequest(() => axios.put(`/api/fit/custom-exercises/${draft.id}`, body));
      onSaved();
    } catch (e) {
      const status = axios.isAxiosError(e) ? e.response?.status : undefined;
      setError(status === 409 ? 'Ce nom existe déjà.' : "Échec de l'enregistrement.");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/60 px-5" onClick={onClose}>
      <div
        className="max-h-[85dvh] w-full max-w-sm overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-5"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-100">
            {draft.id == null ? 'Nouvel exercice' : 'Modifier'}
          </h3>
          <button type="button" aria-label="Fermer" onClick={onClose} className="rounded-lg p-1 text-slate-400 active:bg-slate-800">
            <X className="h-5 w-5" />
          </button>
        </div>

        <label className="mt-4 block text-xs uppercase tracking-wide text-slate-500">Nom</label>
        <input
          type="text"
          value={name}
          maxLength={NAME_MAX}
          onChange={e => setName(e.target.value)}
          placeholder="ex. Rowing Yates"
          className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-800/50 px-3 py-2.5 text-slate-100 outline-none transition-colors focus:border-emerald-500"
        />

        <label className="mt-4 block text-xs uppercase tracking-wide text-slate-500">Variantes (optionnel)</label>
        {variants.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {variants.map(v => (
              <span key={v} className="inline-flex items-center gap-1 rounded-full bg-slate-800 px-2.5 py-1 text-xs text-slate-200">
                {v}
                <button type="button" aria-label={`Retirer ${v}`} onClick={() => setVariants(variants.filter(x => x !== v))}>
                  <X className="h-3 w-3 text-slate-400" />
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="mt-2 flex gap-2">
          <input
            type="text"
            value={variantInput}
            onChange={e => setVariantInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addVariant(); } }}
            placeholder="ex. Pronation"
            className="min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-800/50 px-3 py-2 text-sm text-slate-100 outline-none transition-colors focus:border-emerald-500"
          />
          <button type="button" onClick={addVariant} className="shrink-0 rounded-xl border border-slate-600 px-3 py-2 text-sm text-slate-200 active:bg-slate-800">
            Ajouter
          </button>
        </div>

        <MuscleChips label="Muscles principaux" selected={primary} onToggle={togglePrimary} />
        <MuscleChips label="Muscles secondaires" selected={secondary} onToggle={toggleSecondary} />

        {error && <p className="mt-3 text-center text-sm text-red-400">{error}</p>}

        <button
          type="button"
          onClick={save}
          disabled={!canSave}
          className="mt-5 w-full rounded-xl bg-emerald-600 px-4 py-3 font-semibold text-white transition-colors active:bg-emerald-500 disabled:opacity-50"
        >
          Enregistrer
        </button>
      </div>
    </div>
  );
}

function MuscleChips({ label, selected, onToggle }: { label: string; selected: string[]; onToggle: (m: string) => void }) {
  return (
    <div className="mt-4">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {MUSCLE_ORDER.map(m => {
          const on = selected.includes(m);
          return (
            <button
              key={m}
              type="button"
              aria-pressed={on}
              onClick={() => onToggle(m)}
              className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                on ? 'border-emerald-500 bg-emerald-500/10 text-emerald-200' : 'border-slate-700 text-slate-300 active:bg-slate-800'
              }`}
            >
              {m}
            </button>
          );
        })}
      </div>
    </div>
  );
}
