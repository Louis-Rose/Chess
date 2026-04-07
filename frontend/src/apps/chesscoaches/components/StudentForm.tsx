import { useState } from 'react';
import { useLanguage } from '../../../contexts/LanguageContext';
import { btnPrimary, BTN_GHOST } from './PanelShell';

export const STUDENT_SOURCES = ['chess.com', 'lichess', 'superprof', 'my website'] as const;

export interface StudentFormData {
  student_name: string;
  source: string;
  chesscom_username: string;
  lichess_username: string;
}

export const EMPTY_STUDENT_FORM: StudentFormData = {
  student_name: '',
  source: '',
  chesscom_username: '',
  lichess_username: '',
};

const input = 'w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-colors';
const label = 'text-xs font-medium text-slate-400 mb-1';

export function StudentForm({ initial, onSave, onCancel, saving }: {
  initial: StudentFormData;
  onSave: (data: StudentFormData) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const { t } = useLanguage();
  const [form, setForm] = useState(initial);

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 space-y-3 max-w-sm mx-auto">
      <div>
        <div className={label}>{t('coaches.students.name')} *</div>
        <input className={input} value={form.student_name} onChange={e => setForm({ ...form, student_name: e.target.value })} placeholder={t('coaches.students.name')} />
      </div>
      <div>
        <div className={label}>{t('coaches.packs.source')}</div>
        <select className={input} value={form.source} onChange={e => setForm({ ...form, source: e.target.value })}>
          <option value=""></option>
          {STUDENT_SOURCES.map(s => (
            <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
          ))}
        </select>
      </div>
      {form.source === 'chess.com' && (
        <div>
          <div className={label}>Chess.com username</div>
          <input className={input} value={form.chesscom_username} onChange={e => setForm({ ...form, chesscom_username: e.target.value })} placeholder="e.g. MagnusCarlsen" />
        </div>
      )}
      {form.source === 'lichess' && (
        <div>
          <div className={label}>Lichess username</div>
          <input className={input} value={form.lichess_username} onChange={e => setForm({ ...form, lichess_username: e.target.value })} placeholder="e.g. DrNykterstein" />
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-center gap-3 pt-1">
        <button
          onClick={() => onSave(form)}
          disabled={!form.student_name.trim() || saving}
          className={btnPrimary('purple')}
        >
          {saving ? '...' : t('coaches.students.save')}
        </button>
        <button onClick={onCancel} className={BTN_GHOST}>
          {t('coaches.students.cancel')}
        </button>
      </div>
    </div>
  );
}
