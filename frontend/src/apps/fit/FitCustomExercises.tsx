import { useState } from 'react';
import axios from 'axios';
import { X } from 'lucide-react';
import { fitRequest } from './fitAuth';
import { MUSCLE_ORDER, type CustomExercise } from './programData';

// Create / edit form for a custom exercise (free-text name, an optional single
// row of variants, manual primary/secondary muscles). Driven by the program
// editor: it owns the draft (new or from an existing exercise) and reacts to
// onSaved. Deletion is done by swiping the exercise card left in the picker, so
// it isn't offered here. Custom exercises are shown inline in the picker too.

const NAME_MAX = 60;

export interface CustomDraft {
  id: number | null;
  name: string;
  variants: string[];
  primary: string[];
  secondary: string[];
}

export const newCustomDraft = (muscle: string): CustomDraft =>
  ({ id: null, name: '', variants: [], primary: [muscle], secondary: [] });

export const editCustomDraft = (c: CustomExercise): CustomDraft =>
  ({ id: c.id, name: c.name, variants: [...c.variants], primary: [...c.primary], secondary: [...c.secondary] });

export function FitCustomExerciseForm({ muscle, draft, onClose, onSaved }: {
  muscle: string;
  draft: CustomDraft;
  onClose: () => void;
  onSaved: (saved: CustomExercise, wasNew: boolean) => void;
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
      const res = draft.id == null
        ? await fitRequest(() => axios.post<CustomExercise>('/api/fit/custom-exercises', body))
        : await fitRequest(() => axios.put<CustomExercise>(`/api/fit/custom-exercises/${draft.id}`, body));
      onSaved(res.data, draft.id == null);
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
